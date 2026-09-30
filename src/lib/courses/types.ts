import type { Gender, IsoDate, NineSide } from "@/lib/whs/types";

export type FacilityType = "GOLF_COURSE" | "SHORT_COURSE" | "PAR3" | "DRIVING_RANGE";
export type LayoutType = "9_HOLE" | "18_HOLE" | "27_HOLE" | "36_HOLE" | "SHORT_COURSE";
export type SourceType =
  | "DGV"
  | "BGV"
  | "CLUB_OFFICIAL"
  | "OFFICIAL_SCORECARD"
  | "SECONDARY_SOURCE"
  | "MANUAL_IMPORT";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface RatingSetDto {
  id: string;
  layoutId: string;
  gender: Gender;
  teeColor: string;
  teeName: string | null;
  holes: 9 | 18;
  nine: NineSide | null;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  yardage: number | null;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  sourceType: SourceType | null;
  sourceUrl: string | null;
  checkedAt: IsoDate | null;
  verified: boolean;
  lastVerifiedAt: IsoDate | null;
  confidence: Confidence | null;
  active: boolean;
  notes: string | null;
}

export interface HoleDto {
  id: string;
  layoutId: string;
  holeNumber: number;
  par: number;
  strokeIndex: number | null;
  lengthMen: number | null;
  lengthWomen: number | null;
  teeColor: string | null;
  gender: Gender | null;
}

/** WGS-84-Koordinate in Dezimalgrad. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** GeoJSON-Polygon der Grünfläche (vorbereitet). Ringe aus [Länge, Breite]-Paaren, erster = letzter Punkt. */
export interface GreenPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

/** Fahnenposition (vorbereitet): wechselt täglich, deshalb mit Zeitpunkt. */
export interface PinPosition extends GeoPoint {
  setAt: string;
}

/**
 * Grün eines Lochs – unabhängig vom Abschlag (alle Abschläge spielen auf dasselbe Grün).
 * MVP: Mitte. Vorbereitet: vorne/hinten, Grünfläche (GeoJSON) und Fahnenposition.
 */
export interface GreenGeo {
  front: GeoPoint | null;
  center: GeoPoint | null;
  back: GeoPoint | null;
  polygon: GreenPolygon | null;
  pin: PinPosition | null;
}

/** Abschlagposition je Abschlagsfarbe (vorbereitet, z. B. für eine spätere automatische Locherkennung). */
export interface TeePosition extends GeoPoint {
  teeColor: string;
}

/** Wie eine Koordinate erfasst wurde. */
export type GeoSource = "MANUAL" | "DEVICE_GPS" | "CSV_IMPORT" | "MAP";

/** Geodaten eines Lochs: Platz + Lochnummer (nicht je Abschlag). */
export interface HoleGeoDto {
  layoutId: string;
  holeNumber: number;
  green: GreenGeo;
  tees: TeePosition[];
  source: GeoSource | null;
  updatedAt: string | null;
}

export interface LayoutDto {
  id: string;
  courseId: string;
  name: string;
  type: LayoutType;
  combinationName: string | null;
  holesCount: number;
  active: boolean;
  notes: string | null;
  ratingSets: RatingSetDto[];
  holes: HoleDto[];
  /** GPS-Geodaten je Loch (fehlt bei älteren Datensätzen → leer). */
  holeGeo: HoleGeoDto[];
}

export interface CourseDto {
  id: string;
  slug: string;
  name: string;
  officialName: string | null;
  clubName: string | null;
  facilityType: FacilityType;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  federalState: string;
  country: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  officialSourceUrl: string | null;
  bayernGolfverbandUrl: string | null;
  externalClubId: string | null;
  active: boolean;
  verified: boolean;
  lastVerifiedAt: IsoDate | null;
  notes: string | null;
  layouts: LayoutDto[];
}

export const SOURCE_TYPES: readonly SourceType[] = [
  "DGV",
  "BGV",
  "CLUB_OFFICIAL",
  "OFFICIAL_SCORECARD",
  "SECONDARY_SOURCE",
  "MANUAL_IMPORT",
];

/** Quellenpriorität: DGV > Club offiziell / Scorekarte > BGV > Sekundärquelle > manuell. */
export const SOURCE_PRIORITY: Readonly<Record<SourceType, number>> = {
  DGV: 1,
  CLUB_OFFICIAL: 2,
  OFFICIAL_SCORECARD: 2,
  BGV: 3,
  SECONDARY_SOURCE: 4,
  MANUAL_IMPORT: 5,
};

export const LAYOUT_TYPES: readonly LayoutType[] = ["9_HOLE", "18_HOLE", "27_HOLE", "36_HOLE", "SHORT_COURSE"];
export const GEO_SOURCES: readonly GeoSource[] = ["MANUAL", "DEVICE_GPS", "CSV_IMPORT", "MAP"];
export const FACILITY_TYPES: readonly FacilityType[] = ["GOLF_COURSE", "SHORT_COURSE", "PAR3", "DRIVING_RANGE"];
