"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { COMMUNITY_POLICY, VISIBILITY_LABELS, initialsOf, sanitizeDisplayName } from "@/lib/community/policy";
import { ROUND_VISIBILITIES, type CommunitySettingsInput, type MyCommunity, type RoundVisibility } from "@/lib/community/types";
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { MemberAvatar } from "./MemberAvatar";
import { memberHref } from "./CommunityViews";
import { useMyCommunity } from "./Visibility";

/** Bild im Browser quadratisch zuschneiden und verkleinern (JPEG, höchstens 150 KB). */
async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      i.src = url;
    });
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if ((data.length * 3) / 4 <= COMMUNITY_POLICY.avatarMaxBytes) return data;
    }
    throw new Error("Das Bild ist zu groß.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const TOGGLES: { key: "rankingVisible" | "profileVisible" | "roundsVisible" | "statsVisible" | "notesVisible"; label: string; description: string }[] = [
  { key: "profileVisible", label: "Profil für Mitglieder sichtbar", description: "Anzeigename, Profilbild, Handicap Index, Heimatplatz und Anzahl Runden." },
  { key: "rankingVisible", label: "Am Ranking teilnehmen", description: "Anzeigename, Profilbild, Handicap Index, Heimatclub und Anzahl Runden im Ranking." },
  { key: "roundsVisible", label: "Runden teilen", description: "Nur Runden, die du einzeln für Mitglieder freigibst. Setzt ein sichtbares Profil voraus." },
  { key: "statsVisible", label: "Statistiken teilen", description: "Spielleistung im Profil sowie Scorekarte und Statistik freigegebener Runden (Stufe „Details“)." },
  { key: "notesVisible", label: "Notizen teilen", description: "Notizen in Runden mit Freigabe „Details“. Standardmäßig bleiben Notizen privat." },
];

function disabledReason(key: (typeof TOGGLES)[number]["key"], c: MyCommunity): string | null {
  const s = c.settings;
  const f = c.flags;
  if (key === "rankingVisible" && !f.rankingEnabled) return "Das Ranking ist derzeit ausgeschaltet.";
  if (key === "roundsVisible" && !f.publicRoundsEnabled) return "Öffentliche Runden sind derzeit ausgeschaltet.";
  if (key === "statsVisible" && !f.statsSharingEnabled) return "Das Teilen von Statistiken ist derzeit ausgeschaltet.";
  if ((key === "roundsVisible" || key === "statsVisible") && !s.profileVisible) return "Erst das Profil sichtbar machen.";
  if (key === "notesVisible" && !(s.roundsVisible && s.statsVisible)) return "Erst Runden und Statistiken teilen.";
  return null;
}

/** Profil → Community & Privatsphäre: alles Opt-in, jede Änderung wirkt sofort und wird protokolliert. */
export function CommunitySettingsCard() {
  const toast = useToast();
  const community = useMyCommunity();
  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (community.error && !community.data) return <ErrorState error={community.error} onRetry={community.reload} />;
  if (community.data === undefined) return <PageSkeleton variant="detail" />;
  if (community.data === null) return <Alert tone="info">Die Community ist derzeit ausgeschaltet.</Alert>;
  const c = community.data;
  const s = c.settings;
  const nameValue = name ?? s.displayName ?? "";

  async function save(input: CommunitySettingsInput, label: string, key: string) {
    setBusy(key);
    try {
      community.setData(await api.member.saveCommunity(input));
      toast(label);
      return true;
    } catch (e) {
      toast(userMessage(e), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (trimmed && !sanitizeDisplayName(trimmed)) {
      setNameError("2–40 Zeichen: Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich. Keine E-Mail-Adressen oder Links.");
      return;
    }
    setNameError(null);
    if (await save({ displayName: trimmed || null }, "Anzeigename gespeichert.", "name")) setName(null);
  }

  async function upload(file: File) {
    setBusy("avatar");
    try {
      const dataUrl = await resizeImage(file);
      community.setData(await api.member.saveAvatar(dataUrl));
      toast("Profilbild gespeichert.");
    } catch (e) {
      toast(e instanceof Error && !("code" in e) ? e.message : userMessage(e), "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="So erscheinst du" subtitle="Nie sichtbar: E-Mail-Adresse, Kontaktdaten und interne Kennungen." />
        <CardBody className="space-y-5">
          <div className="flex items-center gap-4">
            <MemberAvatar member={{ displayName: c.effectiveDisplayName, initials: initialsOf(c.effectiveDisplayName), avatarUrl: c.avatarUrl }} size="xl" />
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="avatar-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === "avatar"}>
                {busy === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />} {c.avatarUrl ? "Bild ändern" : "Profilbild hochladen"}
              </Button>
              {c.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === "avatar"}
                  onClick={async () => {
                    setBusy("avatar");
                    try {
                      community.setData(await api.member.deleteAvatar());
                      toast("Profilbild entfernt.");
                    } catch (e) {
                      toast(userMessage(e), "error");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-critical" aria-hidden /> Entfernen
                </Button>
              )}
            </div>
          </div>
          <Field label="Anzeigename" htmlFor="cm-name" hint={`Leer lassen für „${c.effectiveDisplayName}“ (Vorname und erster Buchstabe des Nachnamens).`} error={nameError}>
            <div className="flex gap-2">
              <Input id="cm-name" value={nameValue} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={c.effectiveDisplayName} />
              <Button variant="secondary" onClick={saveName} disabled={busy === "name" || name === null}>
                Speichern
              </Button>
            </div>
          </Field>
          {s.profileVisible && s.publicId && (
            <Link href={memberHref(s.publicId)} className="inline-block text-sm font-medium text-brand hover:underline">
              So sehen dich andere Mitglieder
            </Link>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Freigaben" subtitle="Alles ist ausgeschaltet, bis du es einschaltest. Du kannst jede Freigabe jederzeit zurücknehmen." />
        <CardBody className="space-y-4">
          {TOGGLES.map((t) => {
            const reason = disabledReason(t.key, c);
            return (
              <Checkbox
                key={t.key}
                checked={s[t.key]}
                disabled={busy !== null || (reason !== null && !s[t.key])}
                onChange={(v) => save({ [t.key]: v }, v ? `${t.label}: eingeschaltet` : `${t.label}: ausgeschaltet`, t.key)}
                label={t.label}
                description={reason && !s[t.key] ? `${t.description} ${reason}` : t.description}
              />
            );
          })}
          <Field label="Vorauswahl für neue Runden" htmlFor="cm-default" hint="Die Frage „Wer darf diese Runde sehen?“ startet mit dieser Auswahl.">
            <Select id="cm-default" value={s.defaultRoundVisibility} disabled={busy !== null} onChange={(e) => save({ defaultRoundVisibility: e.target.value as RoundVisibility }, "Vorauswahl gespeichert.", "default")}>
              {ROUND_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABELS[v].label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-3">Die Administration kann Inhalte für andere ausblenden, deine Freigaben aber nie für dich einschalten. Änderungen werden protokolliert.</p>
        </CardBody>
      </Card>
    </div>
  );
}
