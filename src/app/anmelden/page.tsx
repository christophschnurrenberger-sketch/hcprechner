import type { Metadata } from "next";
import { LoginView } from "@/components/account/LoginView";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };

export default function LoginPage() {
  return <LoginView />;
}
