import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { HcpStoreProvider } from "@/components/providers/HcpStoreProvider";

export const metadata: Metadata = {
  title: {
    default: "Golf HCP Rechner – WHS 2026",
    template: "%s · Golf HCP Rechner",
  },
  description:
    "Handicap-Index-Rechner nach World Handicap System und DGV-Regeln 2026: Score Differentials, 9-Loch-Berechnung, 26,5-Bremse, Soft/Hard Cap, Golfplatzdatenbank Bayern.",
  applicationName: "Golf HCP Rechner – WHS 2026",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151816" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased">
        <HcpStoreProvider>
          <AppShell>{children}</AppShell>
        </HcpStoreProvider>
      </body>
    </html>
  );
}
