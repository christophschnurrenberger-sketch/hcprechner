/**
 * Gemeinsame Hilfen für die Route Handler: strukturierte Fehler ({ error, message, fields }),
 * JSON-Körper mit Größenlimit, Client-Adresse.
 */
import { ZodError } from "zod";
import { ApiError, ERROR_STATUS, apiError } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/auth/validation";
import { logServerError } from "./audit";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json(error.toJSON(), error.status);
  if (error instanceof ZodError) {
    const e = apiError("VALIDATION", "Bitte die markierten Felder prüfen.", fieldErrors(error));
    return json(e.toJSON(), e.status);
  }
  console.error(error);
  void logServerError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  return json({ error: "SERVER", message: "Interner Fehler" }, ERROR_STATUS.SERVER ?? 500);
}

/** Führt einen Handler aus und wandelt Fehler in strukturierte Antworten um. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("VALIDATION", "Anfrage zu groß", 413);
  if (!text) return {};
  if (!type.includes("application/json")) throw apiError("VALIDATION", "JSON erwartet");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // unten
  }
  throw apiError("VALIDATION", "Ungültiges JSON");
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded && process.env.TRUST_PROXY === "true") return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? forwarded?.split(",")[0].trim() ?? "local";
}

export function str(body: Record<string, unknown>, key: string, max = 500): string {
  const v = body[key];
  return typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

/** Seite/Größe aus Query-Parametern (1-basiert, 5–200). */
export function pageParams(params: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(5, Number(params.get("pageSize")) || 25));
  return { page, pageSize };
}
