/**
 * Optionale Synchronisation – Aufrufe je nach Build-Variante.
 *
 * - Node-Edition:     REST unter /api/sync (POST, GET/PUT/DELETE /api/sync/<id>, Bearer-Schlüssel)
 * - Webspace-Edition: api/sync.php, ausschließlich POST mit ?action=… und Schlüssel im Header
 *                     X-Sync-Key (viele Webhoster blockieren PUT/DELETE oder entfernen den
 *                     Authorization-Header).
 */
import { IS_WEBSPACE, phpApi } from "@/lib/runtime";
import { parsePayload, type SyncPayload } from "./payload";

export interface SyncCredentials {
  profileId: string;
  key: string;
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new Error("Server nicht erreichbar");
  }
  const text = await res.text();
  let json: { error?: string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Synchronisation nicht verfügbar (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error(json?.error ?? `Fehler (HTTP ${res.status})`);
  return json;
}

const jsonHeaders = { "content-type": "application/json" };

export async function syncCreate(payload: SyncPayload): Promise<SyncCredentials> {
  const body = JSON.stringify(payload);
  const json = IS_WEBSPACE
    ? await request(phpApi("sync", { action: "create" }), { method: "POST", headers: jsonHeaders, body })
    : await request("/api/sync", { method: "POST", headers: jsonHeaders, body });
  const { profileId, key } = json as SyncCredentials;
  if (!profileId || !key) throw new Error("Ungültige Antwort des Servers");
  return { profileId, key };
}

export async function syncPull(c: SyncCredentials): Promise<SyncPayload> {
  const json = IS_WEBSPACE
    ? await request(phpApi("sync", { action: "pull", id: c.profileId }), { method: "POST", headers: { "x-sync-key": c.key } })
    : await request(`/api/sync/${encodeURIComponent(c.profileId)}`, { headers: { authorization: `Bearer ${c.key}` } });
  // Serverdaten werden wie ein Import geprüft, bevor sie lokale Daten ersetzen.
  return parsePayload(json);
}

export async function syncPush(c: SyncCredentials, payload: SyncPayload): Promise<void> {
  const body = JSON.stringify(payload);
  if (IS_WEBSPACE) {
    await request(phpApi("sync", { action: "push", id: c.profileId }), { method: "POST", headers: { ...jsonHeaders, "x-sync-key": c.key }, body });
  } else {
    await request(`/api/sync/${encodeURIComponent(c.profileId)}`, { method: "PUT", headers: { ...jsonHeaders, authorization: `Bearer ${c.key}` }, body });
  }
}

export async function syncDelete(c: SyncCredentials): Promise<void> {
  if (IS_WEBSPACE) {
    await request(phpApi("sync", { action: "delete", id: c.profileId }), { method: "POST", headers: { "x-sync-key": c.key } });
  } else {
    await request(`/api/sync/${encodeURIComponent(c.profileId)}`, { method: "DELETE", headers: { authorization: `Bearer ${c.key}` } });
  }
}
