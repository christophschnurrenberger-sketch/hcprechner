/**
 * Community-API (Node-Edition) – nur für angemeldete Mitglieder, nur freigegebene Daten.
 * Die Filterung (Opt-in, Sichtbarkeit je Runde, Admin-Schalter, Moderation) passiert serverseitig.
 *
 * GET /api/community/ranking?scope=ALL|HOME|REGION&page     Ranking nach Handicap Index
 * GET /api/community/members?q&sort=HCP|NAME|ACTIVITY&page  Mitglieder mit sichtbarem Profil
 * GET /api/community/members/:publicId                      öffentliches Profil
 * GET /api/community/members/:publicId/rounds?page          öffentliche Runden eines Mitglieds
 * GET /api/community/activity?page                          neueste öffentliche Runden
 * GET /api/community/rounds/:publicId/:roundId              öffentliche Runde (Basis oder Details)
 * GET /api/community/avatar/:publicId                       Profilbild
 */
import { apiError } from "@/lib/api/errors";
import { handle, json, searchParams } from "@/server/http";
import { activityPage, avatarFor, memberProfile, memberRounds, membersPage, publicRound, rankingPage } from "@/server/community";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const pageOf = (q: URLSearchParams) => Math.max(1, Math.min(10_000, Number(q.get("page")) || 1));

async function dispatch(req: Request, path: string[]): Promise<Response> {
  if (req.method !== "GET") throw apiError("NOT_FOUND");
  const user = await requireUser(req);
  const q = searchParams(req);
  const [head, a, b, c] = path;
  if (c !== undefined) throw apiError("NOT_FOUND");
  // Antworten sind personenbezogen (isMe, eigene Position): nie in gemeinsamen Caches ablegen
  const priv = { "cache-control": "private, no-store" };

  if (head === "ranking" && !a) return json(await rankingPage(user, { scope: q.get("scope"), page: pageOf(q) }), 200, priv);
  if (head === "members" && !a) return json(await membersPage(user, { q: q.get("q"), sort: q.get("sort"), page: pageOf(q) }), 200, priv);
  if (head === "members" && a && !b) return json(await memberProfile(user, a), 200, priv);
  if (head === "members" && a && b === "rounds") return json(await memberRounds(user, a, pageOf(q)), 200, priv);
  if (head === "activity" && !a) return json(await activityPage(user, pageOf(q)), 200, priv);
  if (head === "rounds" && a && b) return json(await publicRound(user, a, b), 200, priv);
  if (head === "avatar" && a && !b) {
    const img = await avatarFor(user, a);
    if (!img) throw apiError("NOT_FOUND");
    return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  }
  throw apiError("NOT_FOUND");
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => dispatch(req, (await ctx.params).path ?? []));
}
