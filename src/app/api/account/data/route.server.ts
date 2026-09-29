import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/userAuth";
import { loadUserData, saveUserData } from "@/server/userRepository";
import { parsePayload } from "@/lib/sync/payload";

export const dynamic = "force-dynamic";

/** Profil, Runden und Einstellungen des angemeldeten Benutzers. */
export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  return NextResponse.json(await loadUserData(user.id));
}

/** Speichern mit Revisionsprüfung: veralteter Stand → 409 mit aktuellem Serverstand. */
export async function PUT(request: NextRequest) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { baseRevision?: unknown; data?: unknown } | null;
  if (!body || typeof body.baseRevision !== "number" || !Number.isInteger(body.baseRevision)) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  let data;
  try {
    const parsed = parsePayload(body.data);
    const settings = (body.data as { settings?: unknown })?.settings;
    data = { ...parsed, settings: settings && typeof settings === "object" ? (settings as never) : undefined };
  } catch {
    return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
  }
  const result = await saveUserData(user.id, body.baseRevision, data);
  if (!result.ok) return NextResponse.json({ error: "Die Daten wurden zwischenzeitlich auf einem anderen Gerät geändert.", ...result.conflict }, { status: 409 });
  return NextResponse.json(result);
}
