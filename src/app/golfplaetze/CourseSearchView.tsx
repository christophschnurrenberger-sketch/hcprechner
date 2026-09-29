"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { BAVARIAN_REGIONS, regionByKey } from "@/lib/courses/regions";
import { coursePath } from "@/lib/courses/paths";
import { TEE_COLORS, TEE_SWATCH, genderLabel } from "@/lib/courses/tees";
import { formatDecimal } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";

interface ResultLayout {
  id: string;
  name: string;
  type: string;
  holesCount: number;
  ratings: { gender: "M" | "F"; teeColor: string; holes: number; nine: string | null; par: number | null; courseRating: number | null; slopeRating: number | null; verified: boolean; validTo: string | null }[];
}

interface Result {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  has9: boolean;
  has18: boolean;
  verifiedRatingCount: number;
  distanceKm: number | null;
  layouts: ResultLayout[];
}


export function CourseSearchView() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [plz, setPlz] = useState("");
  const [has9, setHas9] = useState(false);
  const [has18, setHas18] = useState(false);
  const [tee, setTee] = useState("");
  const [near, setNear] = useState<{ lat: number; lon: number } | null>(null);
  const [maxKm, setMaxKm] = useState("50");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null; results: Result[]; total: number; totalCourses: number | null }>({
    loading: true,
    error: null,
    results: [],
    total: 0,
    totalCourses: null,
  });

  useEffect(() => {
    const params = new URLSearchParams({ q, limit: "100" });
    if (region) params.set("region", region);
    if (plz) params.set("plz", plz);
    if (has9) params.set("has9", "1");
    if (has18) params.set("has18", "1");
    if (tee) params.set("tee", tee);
    if (near) {
      params.set("lat", String(near.lat));
      params.set("lon", String(near.lon));
      if (maxKm) params.set("maxKm", maxKm);
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetch(`/api/courses?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setState({ loading: false, error: null, results: json.results, total: json.total, totalCourses: json.totalCourses });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState({ loading: false, error: (e as Error).message, results: [], total: 0, totalCourses: null });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, region, plz, has9, has18, tee, near, maxKm]);

  return (
    <>
      <PageHeader
        title="Golfplätze"
        description="Golfplatzdatenbank Bayern: Anlagen, Plätze und Abschläge mit Par, Course Rating und Slope – jeweils mit Quelle und Prüfdatum."
      />
      <Card className="mb-5">
        <CardBody className="grid gap-4 md:grid-cols-4">
          <Field label="Suche" htmlFor="cs-q" className="md:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input id="cs-q" className="pl-9" placeholder="Name oder Ort, z. B. „Ottobeuren“" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </Field>
          <Field label="Region" htmlFor="cs-region">
            <Select id="cs-region" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Ganz Bayern</option>
              {BAVARIAN_REGIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PLZ" htmlFor="cs-plz">
            <Input id="cs-plz" inputMode="numeric" maxLength={5} value={plz} onChange={(e) => setPlz(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Abschlagsfarbe" htmlFor="cs-tee">
            <Select id="cs-tee" value={tee} onChange={(e) => setTee(e.target.value)}>
              <option value="">alle</option>
              {TEE_COLORS.slice(0, 7).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-4 pb-2">
            <Checkbox checked={has18} onChange={setHas18} label="18 Loch" />
            <Checkbox checked={has9} onChange={setHas9} label="9 Loch" />
          </div>
          <Field label="Entfernung" className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={near ? "subtle" : "secondary"}
                size="sm"
                onClick={() => {
                  if (near) return setNear(null);
                  setGeoError(null);
                  navigator.geolocation?.getCurrentPosition(
                    (p) => setNear({ lat: p.coords.latitude, lon: p.coords.longitude }),
                    () => setGeoError("Standort nicht verfügbar"),
                  );
                }}
              >
                <LocateFixed className="h-4 w-4" /> {near ? "Standort aktiv" : "Meinen Standort verwenden"}
              </Button>
              {near && (
                <Select className="h-8 w-auto py-0 text-xs" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} aria-label="Umkreis">
                  {["10", "25", "50", "100", "200"].map((k) => (
                    <option key={k} value={k}>
                      bis {k} km
                    </option>
                  ))}
                </Select>
              )}
              {geoError && <span className="text-xs text-critical">{geoError}</span>}
            </div>
          </Field>
        </CardBody>
      </Card>

      {state.error && <Alert tone="error" title="Golfplatzdatenbank nicht erreichbar">{state.error}</Alert>}
      {state.totalCourses === 0 && (
        <Alert tone="info" title="Die Golfplatzdatenbank ist noch nicht befüllt">
          Die Anlagen werden über den Bayern-Importer (Discovery aus der BGV-Clubübersicht) und verifizierte Ratingdaten über den CSV-Import im
          Admin-Bereich eingepflegt. Es werden keine CR- oder Slope-Werte geschätzt oder erfunden.
        </Alert>
      )}
      {state.totalCourses !== null && state.totalCourses > 0 && (
        <p className="mb-3 text-sm text-ink-3">
          {state.total} von {state.totalCourses} Anlagen
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {state.results.map((c) => {
          const verified = c.layouts.flatMap((l) => l.ratings.filter((r) => r.verified).map((r) => ({ ...r, layout: l.name })));
          return (
            <li key={c.id}>
              <Link href={coursePath(c)} className="block h-full rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{c.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {[c.postalCode, c.city].filter(Boolean).join(" ")} {c.region && `· ${regionByKey(c.region)?.label}`}
                      {c.distanceKm !== null && ` · ${formatDecimal(c.distanceKm, 0)} km`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {c.has18 && <Badge>18 Loch</Badge>}
                    {c.has9 && <Badge>9 Loch</Badge>}
                  </div>
                </div>
                {verified.length > 0 ? (
                  <ul className="tabular mt-3 space-y-1 text-xs">
                    {verified.slice(0, 6).map((r, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[r.teeColor] ?? "#ccc" }} aria-hidden />
                        <span className="w-32 truncate text-ink-2">
                          {r.teeColor} {genderLabel(r.gender)} · {r.holes}
                          {r.nine ? (r.nine === "FRONT" ? " F" : " B") : ""}
                        </span>
                        <span>
                          CR {formatDecimal(r.courseRating)} · Slope {r.slopeRating} · Par {r.par}
                        </span>
                      </li>
                    ))}
                    {verified.length > 6 && <li className="text-ink-3">+ {verified.length - 6} weitere</li>}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-warning">Für diese Anlage liegen noch keine verifizierten WHS-Ratingdaten vor.</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
