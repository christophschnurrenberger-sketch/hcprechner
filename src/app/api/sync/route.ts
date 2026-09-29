import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { createSyncProfile, parsePayload } from "@/server/syncRepository";

export const dynamic = "force-dynamic";

/** Legt ein anonymes Synchronisationsprofil an und liefert Profil-ID + geheimen Schlüssel. */
export async function POST(request: NextRequest) {
  if (process.env.SYNC_ENABLED === "false") {
    return NextResponse.json({ error: "Synchronisation ist auf diesem Server deaktiviert" }, { status: 403 });
  }
  try {
    const data = parsePayload(await request.json());
    return NextResponse.json(await createSyncProfile(data), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Synchronisation nicht verfügbar" }, { status: 503 });
  }
}
