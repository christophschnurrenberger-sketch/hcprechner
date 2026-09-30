"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { VISIBILITY_LABELS } from "@/lib/community/policy";
import { ROUND_VISIBILITIES, type MyCommunity, type RoundVisibility } from "@/lib/community/types";
import { useApi } from "@/lib/useApi";
import { Alert, Button, ChoiceCards } from "@/components/ui";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";

/** Öffentliche Runden sind vom Betreiber eingeschaltet (Community und Rundenfreigabe). */
export function usePublicRoundsEnabled(): boolean {
  const { settings } = useSession();
  return settings.community.communityEnabled && settings.community.publicRoundsEnabled;
}

/** Eigene Community-Einstellungen (nur geladen, wenn die Community aktiv ist). */
export function useMyCommunity() {
  const { settings } = useSession();
  const enabled = settings.community.communityEnabled;
  return useApi<MyCommunity | null>(() => (enabled ? api.member.community() : Promise.resolve(null)), `my-community|${enabled}`);
}

const ICONS = { PRIVATE: <Lock className="h-4 w-4" />, MEMBERS_BASIC: <Users className="h-4 w-4" />, MEMBERS_FULL: <Eye className="h-4 w-4" /> };

/**
 * „Wer darf diese Runde sehen?“ mit ehrlicher Wirkung: Ohne Freigabe in den Privatsphäre-Einstellungen
 * bleibt jede Runde privat. Die Zustimmung erteilt das Mitglied hier ausdrücklich – nie automatisch.
 */
export function VisibilityChooser({
  value,
  onChange,
  community,
  onCommunity,
}: {
  value: RoundVisibility;
  onChange: (v: RoundVisibility) => void;
  community: MyCommunity | null | undefined;
  onCommunity: (c: MyCommunity) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = community?.settings;
  const flags = community?.flags;
  const needsRounds = value !== "PRIVATE" && s && !(s.profileVisible && s.roundsVisible);
  const needsStats = value === "MEMBERS_FULL" && s && !s.statsVisible;
  const statsOff = value === "MEMBERS_FULL" && flags && !flags.statsSharingEnabled;

  async function consent() {
    setBusy(true);
    try {
      const next = await api.member.saveCommunity({ profileVisible: true, roundsVisible: true, ...(value === "MEMBERS_FULL" ? { statsVisible: true } : {}) });
      onCommunity(next);
      toast("Freigabe gespeichert. Du kannst sie jederzeit im Profil zurücknehmen.");
    } catch (e) {
      toast(userMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ChoiceCards
        columns={3}
        value={value}
        onChange={onChange}
        options={ROUND_VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABELS[v].label, description: VISIBILITY_LABELS[v].description, icon: ICONS[v] }))}
      />
      {(needsRounds || needsStats) && (
        <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft/60 p-3 text-sm" role="group" aria-label="Freigabe">
          <p className="flex items-start gap-2 text-ink">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            {needsRounds
              ? "Deine Runden sind für andere Mitglieder noch nicht freigegeben – diese Runde bleibt deshalb privat."
              : "Andere Mitglieder sehen nur die Basisdaten, solange deine Statistiken nicht freigegeben sind."}
          </p>
          <p className="text-ink-2">
            Mit deiner Zustimmung sehen angemeldete Mitglieder dein Profil (Anzeigename, Handicap Index, Heimatplatz) und deine freigegebenen Runden
            {value === "MEMBERS_FULL" ? " inklusive Scorekarte und Statistik" : ""}. Notizen bleiben privat. E-Mail-Adresse und Kontaktdaten sind nie sichtbar.
          </p>
          <Button size="sm" onClick={consent} disabled={busy}>
            {value === "MEMBERS_FULL" ? "Profil, Runden und Statistik freigeben" : "Profil und Runden freigeben"}
          </Button>
        </div>
      )}
      {statsOff && !needsRounds && <Alert tone="info">Scorekarten und Statistiken werden derzeit nicht geteilt – andere Mitglieder sehen die Basisdaten.</Alert>}
    </div>
  );
}

/** Sichtbarkeit einer gespeicherten Runde ändern (Rundendetail). */
export function RoundVisibilityControl({ roundId, initial, onSaved }: { roundId: string; initial: RoundVisibility; onSaved?: (v: RoundVisibility) => void }) {
  const toast = useToast();
  const community = useMyCommunity();
  const [value, setValue] = useState<RoundVisibility>(initial);
  const [saving, setSaving] = useState(false);

  async function change(v: RoundVisibility) {
    const before = value;
    setValue(v);
    setSaving(true);
    try {
      await api.member.setRoundVisibility(roundId, v);
      onSaved?.(v);
      toast(`Sichtbarkeit: ${VISIBILITY_LABELS[v].label}`);
    } catch (e) {
      setValue(before);
      toast(userMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={saving ? "pointer-events-none opacity-70" : undefined}>
      <VisibilityChooser value={value} onChange={change} community={community.data} onCommunity={(c) => community.setData(c)} />
    </div>
  );
}
