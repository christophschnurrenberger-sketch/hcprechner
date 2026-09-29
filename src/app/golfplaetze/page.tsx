import type { Metadata } from "next";
import { CourseSearchView } from "./CourseSearchView";

export const metadata: Metadata = {
  title: "Golfplätze in Bayern",
  description: "Golfplatzsuche Bayern mit Course Rating, Slope und Par je Abschlag – inklusive Datenquelle und Prüfdatum.",
};

export default function CoursesPage() {
  return <CourseSearchView />;
}
