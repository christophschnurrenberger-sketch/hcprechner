import type { Metadata } from "next";
import { ForcePasswordPage } from "@/components/member/pages/OnboardingPages";

export const metadata: Metadata = { title: "Passwort festlegen" };

export default function Page() {
  return <ForcePasswordPage />;
}
