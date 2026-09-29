import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, clearUserCookie, currentUser, issueUserCookie } from "@/server/userAuth";
import { UserError, authenticate, changeOwnPassword, toAccountUser } from "@/server/userRepository";

export const dynamic = "force-dynamic";

/** Status des Benutzerkontos (Node-Edition). CSRF-Schutz: SameSite-Cookie + JSON-Anfragen. */
export async function GET() {
  if (!accountsEnabled()) return NextResponse.json({ enabled: false, user: null, csrf: null });
  try {
    const user = await currentUser();
    return NextResponse.json({ enabled: true, user: user ? toAccountUser(user) : null, csrf: null });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ enabled: false, user: null, csrf: null });
  }
}

const failedLogins = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (failedLogins.get(ip) ?? []).filter((t) => t > now - 15 * 60_000);
  failedLogins.set(ip, hits);
  return hits.length >= 10;
}

export async function POST(request: NextRequest) {
  if (!accountsEnabled()) return NextResponse.json({ error: "Benutzerkonten sind nicht aktiviert" }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 415 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case "login": {
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        if (rateLimited(ip)) return NextResponse.json({ error: "Zu viele Fehlversuche – bitte 15 Minuten warten." }, { status: 429 });
        const user = await authenticate(String(body.username ?? ""), String(body.password ?? ""));
        if (!user) {
          failedLogins.get(ip)?.push(Date.now());
          await new Promise((r) => setTimeout(r, 700));
          return NextResponse.json({ error: "Benutzername oder Passwort falsch." }, { status: 401 });
        }
        await issueUserCookie(user);
        return NextResponse.json({ user: toAccountUser(user), csrf: null });
      }
      case "logout":
        await clearUserCookie();
        return NextResponse.json({ ok: true });
      case "password": {
        const user = await currentUser();
        if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
        const updated = await changeOwnPassword(user.id, String(body.current ?? ""), String(body.next ?? ""));
        await issueUserCookie(updated);
        return NextResponse.json({ ok: true, user: toAccountUser(updated), csrf: null });
      }
      default:
        return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Benutzerkonten nicht verfügbar" }, { status: 503 });
  }
}
