"use client";

import { Cloud, CloudOff, HardDrive, Loader2 } from "lucide-react";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Badge } from "@/components/ui";

/** Wo liegen die Daten gerade: im Browser oder im Konto (mit Speicherstatus)? */
export function SyncStatusBadge() {
  const { sync } = useHcp();
  if (sync.mode === "local") {
    return (
      <Badge>
        <HardDrive className="h-3 w-3" /> nur in diesem Browser
      </Badge>
    );
  }
  if (sync.state === "loading" || sync.state === "saving") {
    return (
      <Badge tone="info">
        <Loader2 className="h-3 w-3 animate-spin" /> {sync.state === "loading" ? "lädt …" : "speichert …"}
      </Badge>
    );
  }
  if (sync.state === "error") {
    return (
      <Badge tone="warning">
        <CloudOff className="h-3 w-3" /> nicht gespeichert
      </Badge>
    );
  }
  return (
    <Badge tone="good">
      <Cloud className="h-3 w-3" /> im Konto gespeichert
    </Badge>
  );
}
