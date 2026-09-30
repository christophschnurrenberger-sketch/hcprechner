import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";
import { InstallGuard } from "@/components/layout/InstallGuard";
import { SessionProvider } from "@/components/session/SessionProvider";
import { ToastProvider } from "@/components/ui/feedback";
import { IS_WEBSPACE } from "@/lib/runtime";

export const metadata: Metadata = {
  title: {
    default: "Golf HCP Rechner – WHS 2026",
    template: "%s · Golf HCP Rechner",
  },
  description:
    "Dein Handicap Index nach World Handicap System und DGV-Regeln 2026: Runden erfassen, Score Differentials, 9-Loch-Berechnung, Golfplatzdatenbank Bayern.",
  applicationName: "Golf HCP Rechner – WHS 2026",
  // „Zum Home-Bildschirm“ auf dem iPhone: eigenständig, ohne Browserleiste (Scorekarte auf dem Platz)
  appleWebApp: { capable: true, title: "HCP Rechner", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#151816" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      {IS_WEBSPACE && (
        <head>
          <InstallGuard />
        </head>
      )}
      <body className="antialiased">
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
