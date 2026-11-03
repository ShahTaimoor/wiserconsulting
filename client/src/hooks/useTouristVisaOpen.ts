"use client";

import { useEffect, useState } from "react";
import { config } from "@/shared/tourist-visa/engine";
import { fetchServerStatus } from "@/services/touristVisaService";
import { availabilityOf, countHeldSections, isPreviewMode, type Availability } from "@/utils/touristVisaChecklist";
import { createOpenChecker, type ServerOpenState } from "@/utils/touristVisaOpen";

/** One checker for the whole page load: every component that asks shares its remembered answer and its ask under way. */
export const touristVisaOpenChecker = createOpenChecker({ fetchStatus: fetchServerStatus });

/**
 * What the SERVER says about the Tourist Visa feature (its TOURIST_VISA_ENABLED switch): "unknown" until the answer
 * arrives, then "open" or "closed". Anything but a clear "open" (an error, a timeout, an odd answer) is "closed".
 * Step 8i uses this for the assessment popup and the footer link; the pages use useTouristVisaAvailability.
 */
export function useTouristVisaOpen(): ServerOpenState {
  const [state, setState] = useState<ServerOpenState>(() => touristVisaOpenChecker.peek());
  useEffect(() => {
    let alive = true;
    void touristVisaOpenChecker.check().then((answer) => {
      if (alive) setState(answer);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * Whether to show the Tourist Visa feature at all: "loading" (show a neutral wait, make no other Tourist Visa call),
 * "open", or "closed" (show the "not available yet" notice). Open only when the server says open AND this build's own
 * config hold passes (or the preview flag is set).
 */
export function useTouristVisaAvailability(): Availability {
  const server = useTouristVisaOpen();
  return availabilityOf(server, countHeldSections(config), isPreviewMode());
}
