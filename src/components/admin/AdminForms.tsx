"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { BAVARIAN_REGIONS } from "@/lib/courses/regions";
import { TEE_COLORS } from "@/lib/courses/tees";
import { FACILITY_TYPES, LAYOUT_TYPES, SOURCE_TYPES, type CourseDto, type HoleDto, type LayoutDto, type RatingSetDto } from "@/lib/courses/types";
import { SOURCE_TYPE_LABELS } from "@/lib/whs/messages";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { initialActionState as initial, type ActionState } from "@/lib/courses/adminForm";
import { useAdminBackend } from "./AdminBackend";

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? "success" : "error"}>
      {state.message}
      {state.fieldErrors && (
        <ul className="mt-1 list-disc pl-4">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

function CheckboxField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="hidden" name={`${name}__present`} value="1" />
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--brand)]" />
      {label}
    </label>
  );
}

const FACILITY_LABELS: Record<string, string> = {
  GOLF_COURSE: "Golfanlage / Golfplatz",
  SHORT_COURSE: "Kurzplatz",
  PAR3: "Par-3-Anlage",
  DRIVING_RANGE: "Driving Range / Übungsanlage (nicht handicap-relevant)",
};

export function LoginForm({ loginAction }: { loginAction: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Field label="Admin-Passwort" htmlFor="pw">
        <Input id="pw" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        Anmelden
      </Button>
    </form>
  );
}

export function CourseForm({ course }: { course?: CourseDto }) {
  const { saveCourse } = useAdminBackend();
  const router = useRouter();
  const [state, action, pending] = useActionState(saveCourse, initial);
  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
  const v = (k: keyof CourseDto) => (course?.[k] ?? "") as string | number;
  return (
    <form action={action} className="space-y-4">
      {course && <input type="hidden" name="id" value={course.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" htmlFor="c-name">
          <Input id="c-name" name="name" defaultValue={v("name")} required />
        </Field>
        <Field label="Offizieller Name" htmlFor="c-off">
          <Input id="c-off" name="officialName" defaultValue={v("officialName")} />
        </Field>
        <Field label="Club / Verein" htmlFor="c-club">
          <Input id="c-club" name="clubName" defaultValue={v("clubName")} />
        </Field>
        <Field label="Anlagentyp" htmlFor="c-type">
          <Select id="c-type" name="facilityType" defaultValue={course?.facilityType ?? "GOLF_COURSE"}>
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {FACILITY_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Adresse" htmlFor="c-addr">
          <Input id="c-addr" name="address" defaultValue={v("address")} />
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <Field label="PLZ" htmlFor="c-plz">
            <Input id="c-plz" name="postalCode" defaultValue={v("postalCode")} />
          </Field>
          <Field label="Ort" htmlFor="c-city">
            <Input id="c-city" name="city" defaultValue={v("city")} />
          </Field>
        </div>
        <Field label="Region" htmlFor="c-region">
          <Select id="c-region" name="region" defaultValue={course?.region ?? ""}>
            <option value="">–</option>
            {BAVARIAN_REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Breitengrad" htmlFor="c-lat">
            <Input id="c-lat" name="latitude" inputMode="decimal" defaultValue={v("latitude")} />
          </Field>
          <Field label="Längengrad" htmlFor="c-lon">
            <Input id="c-lon" name="longitude" inputMode="decimal" defaultValue={v("longitude")} />
          </Field>
        </div>
        <Field label="Website" htmlFor="c-web">
          <Input id="c-web" name="website" type="url" defaultValue={v("website")} />
        </Field>
        <Field label="Offizielle Quelle (Stammdaten)" htmlFor="c-src">
          <Input id="c-src" name="officialSourceUrl" type="url" defaultValue={v("officialSourceUrl")} />
        </Field>
        <Field label="BGV-Eintrag" htmlFor="c-bgv">
          <Input id="c-bgv" name="bayernGolfverbandUrl" type="url" defaultValue={v("bayernGolfverbandUrl")} />
        </Field>
        <Field label="Club-ID (DGV/BGV)" htmlFor="c-ext" hint="Hilft bei der Duplikaterkennung">
          <Input id="c-ext" name="externalClubId" defaultValue={v("externalClubId")} />
        </Field>
        <Field label="Stammdaten zuletzt geprüft" htmlFor="c-lva">
          <Input id="c-lva" name="lastVerifiedAt" type="date" defaultValue={v("lastVerifiedAt")} />
        </Field>
        <div className="flex items-end gap-5 pb-2">
          <CheckboxField name="active" label="aktiv" defaultChecked={course?.active ?? true} />
          <CheckboxField name="verified" label="Stammdaten verifiziert" defaultChecked={course?.verified ?? false} />
        </div>
      </div>
      <Field label="Notizen" htmlFor="c-notes">
        <Textarea id="c-notes" name="notes" defaultValue={v("notes")} />
      </Field>
      <input type="hidden" name="federalState" value={course?.federalState ?? "BY"} />
      <input type="hidden" name="country" value={course?.country ?? "DE"} />
      <Message state={state} />
      <Button type="submit" disabled={pending}>
        {course ? "Anlage speichern" : "Anlage anlegen"}
      </Button>
    </form>
  );
}

export function LayoutForm({ courseId, layout, onDone }: { courseId: string; layout?: LayoutDto; onDone?: () => void }) {
  const { saveLayout } = useAdminBackend();
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await saveLayout(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, initial);
  return (
    <form action={action} className="space-y-3">
      {layout && <input type="hidden" name="id" value={layout.id} />}
      <input type="hidden" name="courseId" value={courseId} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name *" htmlFor={`l-name-${layout?.id ?? "new"}`}>
          <Input id={`l-name-${layout?.id ?? "new"}`} name="name" defaultValue={layout?.name ?? ""} required placeholder="z. B. Meisterschaftsplatz" />
        </Field>
        <Field label="Typ">
          <Select name="type" defaultValue={layout?.type ?? "18_HOLE"}>
            {LAYOUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_HOLE", " Loch").replace("SHORT_COURSE", "Kurzplatz")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Löcher">
          <Input name="holesCount" type="number" min={1} max={36} defaultValue={layout?.holesCount ?? 18} />
        </Field>
        <Field label="Kombination" hint="z. B. A-B, Front Nine">
          <Input name="combinationName" defaultValue={layout?.combinationName ?? ""} />
        </Field>
      </div>
      <CheckboxField name="active" label="aktiv" defaultChecked={layout?.active ?? true} />
      <Message state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {layout ? "Platz speichern" : "Platz anlegen"}
      </Button>
    </form>
  );
}

export function RatingSetForm({ layout, rating, onDone }: { layout: LayoutDto; rating?: RatingSetDto; onDone?: () => void }) {
  const { saveRatingSet } = useAdminBackend();
  const [holes, setHoles] = useState<number>(rating?.holes ?? (layout.holesCount === 9 ? 9 : 18));
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await saveRatingSet(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, initial);
  const id = rating?.id ?? `new-${layout.id}`;
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
      {rating && <input type="hidden" name="id" value={rating.id} />}
      <input type="hidden" name="layoutId" value={layout.id} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Geschlecht">
          <Select name="gender" defaultValue={rating?.gender ?? "M"}>
            <option value="M">Herren</option>
            <option value="F">Damen</option>
          </Select>
        </Field>
        <Field label="Abschlagsfarbe *">
          <Select name="teeColor" defaultValue={rating?.teeColor ?? "Gelb"}>
            {TEE_COLORS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Abschlagsname" htmlFor={`${id}-tn`}>
          <Input id={`${id}-tn`} name="teeName" defaultValue={rating?.teeName ?? ""} />
        </Field>
        <Field label="Löcher">
          <Select name="holes" value={holes} onChange={(e) => setHoles(Number(e.target.value))}>
            <option value={18}>18</option>
            <option value={9}>9</option>
          </Select>
        </Field>
        {holes === 9 && layout.holesCount >= 18 && (
          <Field label="Hälfte *">
            <Select name="nine" defaultValue={rating?.nine ?? "FRONT"}>
              <option value="FRONT">Front Nine (1–9)</option>
              <option value="BACK">Back Nine (10–18)</option>
            </Select>
          </Field>
        )}
        <Field label="Par" htmlFor={`${id}-par`}>
          <Input id={`${id}-par`} name="par" inputMode="numeric" defaultValue={rating?.par ?? ""} />
        </Field>
        <Field label="Course Rating" htmlFor={`${id}-cr`} hint={holes === 9 ? "offizielles 9-Loch-Rating" : undefined}>
          <Input id={`${id}-cr`} name="courseRating" inputMode="decimal" defaultValue={rating?.courseRating ?? ""} />
        </Field>
        <Field label="Slope Rating" htmlFor={`${id}-sl`}>
          <Input id={`${id}-sl`} name="slopeRating" inputMode="numeric" defaultValue={rating?.slopeRating ?? ""} />
        </Field>
        <Field label="Länge (m)" htmlFor={`${id}-yd`}>
          <Input id={`${id}-yd`} name="yardage" inputMode="numeric" defaultValue={rating?.yardage ?? ""} />
        </Field>
        <Field label="Gültig ab" htmlFor={`${id}-vf`}>
          <Input id={`${id}-vf`} name="validFrom" type="date" defaultValue={rating?.validFrom ?? ""} />
        </Field>
        <Field label="Gültig bis" htmlFor={`${id}-vt`}>
          <Input id={`${id}-vt`} name="validTo" type="date" defaultValue={rating?.validTo ?? ""} />
        </Field>
        <Field label="Datenquelle">
          <Select name="sourceType" defaultValue={rating?.sourceType ?? ""}>
            <option value="">–</option>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_TYPE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quell-URL" htmlFor={`${id}-su`} className="sm:col-span-2">
          <Input id={`${id}-su`} name="sourceUrl" type="url" defaultValue={rating?.sourceUrl ?? ""} />
        </Field>
        <Field label="Geprüft am" htmlFor={`${id}-ca`}>
          <Input id={`${id}-ca`} name="checkedAt" type="date" defaultValue={rating?.checkedAt ?? ""} />
        </Field>
        <Field label="Vertrauen">
          <Select name="confidence" defaultValue={rating?.confidence ?? ""}>
            <option value="">–</option>
            <option value="HIGH">hoch</option>
            <option value="MEDIUM">mittel</option>
            <option value="LOW">niedrig</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-5">
        <CheckboxField name="verified" label="verifiziert (nur mit CR, Slope, Par und Quelle)" defaultChecked={rating?.verified ?? false} />
        <CheckboxField name="active" label="aktiv" defaultChecked={rating?.active ?? true} />
      </div>
      <Message state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {rating ? "Rating speichern" : "Rating anlegen"}
      </Button>
    </form>
  );
}

export function HolesForm({ layout }: { layout: LayoutDto }) {
  const { saveHoles } = useAdminBackend();
  const [state, action, pending] = useActionState(saveHoles, initial);
  const count = Math.min(layout.holesCount, 36);
  const byNumber = new Map<number, HoleDto>(layout.holes.filter((h) => h.gender === null && h.teeColor === null).map((h) => [h.holeNumber, h]));
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="layoutId" value={layout.id} />
      <input type="hidden" name="count" value={count} />
      <div className="overflow-x-auto">
        <table className="tabular text-sm">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="px-1 py-1 text-left font-medium">Loch</th>
              <th className="px-1 py-1 font-medium">Par</th>
              <th className="px-1 py-1 font-medium">HCP</th>
              <th className="px-1 py-1 font-medium">Länge H</th>
              <th className="px-1 py-1 font-medium">Länge D</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
              const h = byNumber.get(n);
              return (
                <tr key={n}>
                  <td className="px-1 py-0.5">{n}</td>
                  <td className="px-1 py-0.5">
                    <input name={`par_${n}`} defaultValue={h?.par ?? ""} aria-label={`Par ${n}`} className="h-8 w-14 rounded border border-border-strong bg-surface px-2" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input name={`si_${n}`} defaultValue={h?.strokeIndex ?? ""} aria-label={`HCP ${n}`} className="h-8 w-14 rounded border border-border-strong bg-surface px-2" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input name={`lm_${n}`} defaultValue={h?.lengthMen ?? ""} aria-label={`Länge Herren ${n}`} className="h-8 w-20 rounded border border-border-strong bg-surface px-2" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input name={`lw_${n}`} defaultValue={h?.lengthWomen ?? ""} aria-label={`Länge Damen ${n}`} className="h-8 w-20 rounded border border-border-strong bg-surface px-2" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Message state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        Lochdaten speichern
      </Button>
    </form>
  );
}
