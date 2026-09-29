import type { Metadata } from "next";
import { AccountView } from "@/components/account/AccountView";

export const metadata: Metadata = { title: "Mein Konto", robots: { index: false } };

export default function AccountPage() {
  return <AccountView />;
}
