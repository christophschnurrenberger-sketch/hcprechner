"use client";

import { useEffect, useMemo, useState } from "react";
import { availableTees, holesFor, selectRatingSet, toRatingSnapshot } from "@/lib/courses/ratingSelection";
import type { CourseDto } from "@/lib/courses/types";
import { parseDecimal } from "@/lib/courses/csv";
import type { Gender, HoleInfo, NineSide, RatingSnapshot } from "@/lib/whs/types";
import { RATING_STATUS_TEXTS } from "@/lib/whs/messages";
import { formatDecimal } from "@/lib/format";
import { Alert, Button, Field, Input, Segmented, Select } from "@/components/ui";
import { CoursePicker } from "./CoursePicker";

export interface RatingSelection {
  rating: RatingSnapshot | null;
  holeData: HoleInfo[] | null;
  courseName: string;
  courseId: string | null;
  teeColor: string | null;
  gender: Gender;
  holes: 9 | 18;
}

/** Kompakte Auswahl: Platz aus der Datenbank (automatisches Rating) oder manuelle Werte. */
export function RatingSelector({
  date,
  defaultGender,
  onChange,
}: {
  date: string;
  defaultGender: Gender;
  onChange: (selection: RatingSelection) => void;
}) {
  const [mode, setMode] = useState<"DB" | "MANUAL">("MANUAL");
  const [course, setCourse] = useState<CourseDto | null>(null);
  const [picking, setPicking] = useState(false);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [holes, setHoles] = useState<9 | 18>(18);
  const [nine, setNine] = useState<NineSide>("FRONT");
  const [gender, setGender] = useState<Gender>(defaultGender);
  const [tee, setTee] = useState<string | null>(null);
  const [manual, setManual] = useState({ cr: "", slope: "", par: "" });

  const layout = course?.layouts.find((l) => l.id === layoutId) ?? null;
  const needsNine = holes === 9 && (layout?.holesCount ?? 18) >= 18;

  const selection: RatingSelection = useMemo(() => {
    if (mode === "MANUAL") {
      const cr = parseDecimal(manual.cr);
      const slope = parseDecimal(manual.slope);
      const par = parseDecimal(manual.par);
      const ok = (v: number | null) => v !== null && !Number.isNaN(v);
      return {
        rating: ok(cr) && ok(slope)
          ? { holes, courseRating: cr, slopeRating: slope, par: ok(par) ? par : null, manual: true, nine: holes === 9 ? nine : null }
          : null,
        holeData: null,
        courseName: "Manuelle Eingabe",
        courseId: null,
        teeColor: null,
        gender,
        holes,
      };
    }
    if (!layout || !tee) return { rating: null, holeData: null, courseName: course?.name ?? "", courseId: course?.id ?? null, teeColor: tee, gender, holes };
    const sel = selectRatingSet(layout.ratingSets, { date, gender, teeColor: tee, holes, nine: needsNine ? nine : null });
    return {
      rating: sel.status === "OK" && sel.ratingSet ? toRatingSnapshot(sel.ratingSet) : null,
      holeData: holesFor(layout, { gender, teeColor: tee, holes, nine: holes === 9 ? nine : null }),
      courseName: course!.name,
      courseId: course!.id,
      teeColor: tee,
      gender,
      holes,
    };
  }, [mode, manual, holes, nine, gender, layout, tee, date, course, needsNine]);

  useEffect(() => {
    onChange(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const dbStatus =
    mode === "DB" && layout && tee ? selectRatingSet(layout.ratingSets, { date, gender, teeColor: tee, holes, nine: needsNine ? nine : null }).status : null;
  const tees = layout ? availableTees(layout, { gender, holes, date }).filter((t) => !needsNine || t.nine === nine) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          name="Rating-Quelle"
          value={mode}
          onChange={setMode}
          options={[
            { value: "MANUAL", label: "Werte eingeben" },
            { value: "DB", label: "Golfplatz-Datenbank" },
          ]}
        />
        <Segmented
          name="Löcher"
          value={holes}
          onChange={(h) => {
            setHoles(h);
            setTee(null);
          }}
          options={[
            { value: 18, label: "18 Loch" },
            { value: 9, label: "9 Loch" },
          ]}
        />
        {holes === 9 && (
          <Segmented
            name="Hälfte"
            size="sm"
            value={nine}
            onChange={(v) => {
              setNine(v);
              setTee(null);
            }}
            options={[
              { value: "FRONT", label: "Front" },
              { value: "BACK", label: "Back" },
            ]}
          />
        )}
      </div>
      {mode === "MANUAL" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Course Rating (${holes} Loch)`} htmlFor="rs-cr">
            <Input id="rs-cr" inputMode="decimal" value={manual.cr} onChange={(e) => setManual({ ...manual, cr: e.target.value })} />
          </Field>
          <Field label="Slope Rating" htmlFor="rs-slope">
            <Input id="rs-slope" inputMode="numeric" value={manual.slope} onChange={(e) => setManual({ ...manual, slope: e.target.value })} />
          </Field>
          <Field label="Par" htmlFor="rs-par">
            <Input id="rs-par" inputMode="numeric" value={manual.par} onChange={(e) => setManual({ ...manual, par: e.target.value })} />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          {course && !picking ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong>{course.name}</strong>
              <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                ändern
              </Button>
            </div>
          ) : (
            <CoursePicker
              selectedId={course?.id ?? null}
              onSelect={(c) => {
                setCourse(c);
                const active = c.layouts.filter((l) => l.active);
                setLayoutId(active.length === 1 ? active[0].id : null);
                setTee(null);
                setPicking(false);
              }}
            />
          )}
          {course && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Platz">
                <Select value={layoutId ?? ""} onChange={(e) => { setLayoutId(e.target.value || null); setTee(null); }}>
                  <option value="">– wählen –</option>
                  {course.layouts.filter((l) => l.active).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.holesCount} L.)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Geschlecht">
                <Select value={gender} onChange={(e) => { setGender(e.target.value as Gender); setTee(null); }}>
                  <option value="M">Herren</option>
                  <option value="F">Damen</option>
                </Select>
              </Field>
              <Field label="Abschlag">
                <Select value={tee ?? ""} onChange={(e) => setTee(e.target.value || null)} disabled={!layout}>
                  <option value="">– wählen –</option>
                  {tees.map((t) => (
                    <option key={t.teeColor} value={t.teeColor}>
                      {t.teeColor}
                      {t.verified ? ` · CR ${formatDecimal(t.ratingSet.courseRating)} / ${t.ratingSet.slopeRating}` : " · nicht verifiziert"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {dbStatus && dbStatus !== "OK" && <Alert tone="warning">{RATING_STATUS_TEXTS[dbStatus]}</Alert>}
          {layout && tees.length === 0 && <Alert tone="warning">Für diese Auswahl sind keine Rating-Sets hinterlegt.</Alert>}
        </div>
      )}
      {selection.rating && (
        <p className="tabular text-sm text-ink-2">
          Verwendet: CR <strong>{formatDecimal(selection.rating.courseRating)}</strong> · Slope <strong>{selection.rating.slopeRating}</strong> · Par{" "}
          <strong>{selection.rating.par ?? "–"}</strong> ({holes} Loch)
        </p>
      )}
    </div>
  );
}
