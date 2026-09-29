import type { ReactNode } from "react";

export default function SectionLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">{children}</div>;
}
