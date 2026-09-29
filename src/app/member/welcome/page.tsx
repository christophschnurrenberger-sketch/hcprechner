import type { Metadata } from "next";
import { WelcomePage } from "@/components/member/pages/OnboardingPages";

export const metadata: Metadata = { title: "Willkommen" };

export default function Page() {
  return <WelcomePage />;
}
