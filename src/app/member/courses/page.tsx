import type { Metadata } from "next";
import { CoursesPage } from "@/components/member/pages/CoursesPage";

export const metadata: Metadata = { title: "Golfplätze" };

export default function Page() {
  return <CoursesPage />;
}
