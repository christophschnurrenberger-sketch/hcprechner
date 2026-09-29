import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundDetail } from "@/components/rounds/RoundDetail";

export const metadata: Metadata = { title: "Runden-Detail" };

export default async function RoundDetailPage(props: PageProps<"/runden/[id]">) {
  const { id } = await props.params;
  return (
    <Suspense>
      <RoundDetail id={decodeURIComponent(id)} />
    </Suspense>
  );
}
