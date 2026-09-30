"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { RoundDetail } from "@/lib/api/types";
import { fetchCourse } from "@/lib/courses/client";
import { holesFor } from "@/lib/courses/ratingSelection";
import { alignToHoles, hasAnyStat, holeNumbersFor, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Button } from "@/components/ui";
import { ConfirmDialog, ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { roundHref } from "@/components/member/RoundList";
import { DetailedHoleInput } from "@/components/stats/DetailedHoleInput";

interface Loaded {
  detail: RoundDetail;
  stats: HoleStat[];
  parEditable: boolean;
}

type BaseHole = { number: number; par: number | null; strokeIndex: number | null };

/** Par und Handicap je Loch: Platzdaten des gespielten Abschlags, sonst Scorekarte der Runde. */
async function baseHolesFor(d: RoundDetail): Promise<BaseHole[] | null> {
  const { round } = d;
  const nine = round.holes === 9 ? (round.rating.nine ?? null) : null;
  if (round.course.courseId && round.course.layoutId) {
    const course = await fetchCourse(round.course.courseId).catch(() => null);
    const layout = course?.layouts.find((l) => l.id === round.course.layoutId);
    const holes = layout ? holesFor(layout, { gender: round.course.gender ?? "M", teeColor: round.course.teeColor ?? null, holes: round.holes, nine: layout.holesCount >= 18 ? nine : null }) : null;
    if (holes) return holes.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex ?? null }));
  }
  if (round.holeData?.length === round.holes) return round.holeData.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex ?? null }));
  const gbe = d.result.gbe?.holes;
  if (gbe?.length === round.holes) return gbe.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex ?? null }));
  return null;
}

/**
 * „Statistiken ergänzen“: Lochstatistik einer gespeicherten Runde erfassen oder ändern.
 * Handicap-Werte (GBE, Score Differential, HCPI) bleiben unverändert.
 */
export function RoundStatsPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const toast = useToast();
  const [stats, setStats] = useState<HoleStat[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const loaded = useApi<Loaded>(async () => {
    const detail = await api.member.round(id);
    const base = await baseHolesFor(detail);
    const numbers = base?.map((h) => h.number) ?? holeNumbersFor(detail.round.holes, detail.round.holes === 9 ? (detail.round.rating.nine ?? null) : null);
    let s = alignToHoles(detail.holeStats, base ?? numbers.map((n) => ({ number: n, par: null, strokeIndex: null })));
    if (detail.scoresLocked && detail.round.entry.holeScores) {
      const raw = detail.round.entry.holeScores;
      s = s.map((h, i) => ({ ...h, score: typeof raw[i] === "number" ? (raw[i] as number) : null }));
    }
    return { detail, stats: s, parEditable: base === null };
  }, id);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (!loaded.data) return <PageSkeleton variant="detail" />;
  const { detail, parEditable } = loaded.data;
  const current = stats ?? loaded.data.stats;
  const validation = validateHoleStats(current, current.map((h) => h.number));

  async function save() {
    if (validation.errors.length > 0) {
      setError(validation.errors[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.member.saveRoundStats(id, current.some((h) => hasAnyStat(h)) ? current : null);
      setDirty(false);
      toast(res.warnings.length ? `Statistik gespeichert – ${res.warnings.length} ${res.warnings.length === 1 ? "Hinweis" : "Hinweise"}.` : "Statistik gespeichert. Dein Handicap bleibt unverändert.");
      router.push(roundHref(id));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={roundHref(id)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Zur Runde
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{detail.holeStats ? "Statistik bearbeiten" : "Statistik ergänzen"}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {detail.item.courseName} · {formatDate(detail.item.date)} · {detail.item.holes} Loch
        </p>
      </div>
      <Alert tone="info">
        Statistiken beschreiben dein Spiel. GBE, Score Differential und Handicap Index bleiben unverändert.
        {detail.scoresLocked ? " Die Schläge je Loch stammen aus deinem Ergebnis und lassen sich nur über „Bearbeiten“ der Runde ändern." : ""}
      </Alert>
      {parEditable && <Alert tone="warning">Für diese Runde fehlen die Lochdaten. Wähle das Par je Loch – es dient nur der Statistik.</Alert>}

      <DetailedHoleInput
        stats={current}
        onChange={(s) => {
          setStats(s);
          setDirty(true);
        }}
        scoreLocked={detail.scoresLocked}
        parEditable={parEditable}
      />

      {validation.warnings.length > 0 && (
        <Alert tone="warning" title="Bitte prüfen">
          <ul className="list-disc space-y-0.5 pl-4">
            {validation.warnings.slice(0, 5).map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-surface-2/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {detail.holeStats ? (
          <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="h-4 w-4 text-critical" aria-hidden /> Statistik entfernen
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={save} disabled={saving || validation.errors.length > 0}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Statistik speichern
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Statistik entfernen?"
        confirmLabel="Entfernen"
        busy={saving}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await api.member.saveRoundStats(id, null);
            setDirty(false);
            toast("Statistik entfernt. Die Runde und dein Handicap bleiben erhalten.");
            router.push(roundHref(id));
          } catch (e) {
            toast(userMessage(e), "error");
            setSaving(false);
          }
        }}
      >
        <p className="text-ink-2">Putts, Grüns, Fairways, Bunker, Strafschläge und Notizen dieser Runde werden gelöscht. Die Runde selbst und dein Handicap bleiben unverändert.</p>
      </ConfirmDialog>
    </div>
  );
}
