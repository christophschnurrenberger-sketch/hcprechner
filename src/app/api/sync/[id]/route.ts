import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { SyncAuthError, deleteSyncProfile, parsePayload, pullSyncProfile, pushSyncProfile } from "@/server/syncRepository";

export const dynamic = "force-dynamic";

function keyOf(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function fail(error: unknown) {
  if (error instanceof SyncAuthError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "Synchronisation nicht verfügbar" }, { status: 503 });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/sync/[id]">) {
  const key = keyOf(request);
  if (!key) return NextResponse.json({ error: "Schlüssel fehlt" }, { status: 401 });
  try {
    return NextResponse.json(await pullSyncProfile((await ctx.params).id, key));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/sync/[id]">) {
  const key = keyOf(request);
  if (!key) return NextResponse.json({ error: "Schlüssel fehlt" }, { status: 401 });
  try {
    return NextResponse.json(await pushSyncProfile((await ctx.params).id, key, parsePayload(await request.json())));
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/sync/[id]">) {
  const key = keyOf(request);
  if (!key) return NextResponse.json({ error: "Schlüssel fehlt" }, { status: 401 });
  try {
    await deleteSyncProfile((await ctx.params).id, key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
