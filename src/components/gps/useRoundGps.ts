"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DistanceViewState } from "@/lib/gps/distanceView";
import { getLocationService } from "@/lib/gps/locationService";
import { localOptIn, RoundGpsController, type RoundGpsContext } from "@/lib/gps/roundGps";

function createController(): RoundGpsController {
  return new RoundGpsController(getLocationService(), {
    now: () => Date.now(),
    optIn: localOptIn,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  });
}

/**
 * GPS der laufenden Runde für React. Der Controller wird beim Einhängen mit dem Standortdienst verbunden
 * und beim Aushängen (Runde verlassen = Pause) getrennt – damit endet auch die Standortbestimmung.
 */
export function useRoundGps(ctx: RoundGpsContext): { view: DistanceViewState; activate: () => void; controller: RoundGpsController } {
  const [controller] = useState(createController);

  useEffect(() => {
    controller.attach();
    return () => controller.detach();
  }, [controller]);

  const { round, courseId, holeNumber, green, hasGreens, target, unit } = ctx;
  useEffect(() => {
    controller.update({ round, courseId, holeNumber, green, hasGreens, target, unit });
  }, [controller, round, courseId, holeNumber, green, hasGreens, target, unit]);

  const view = useSyncExternalStore(controller.subscribe, controller.getView, controller.getView);
  return { view, activate: () => controller.activate(), controller };
}
