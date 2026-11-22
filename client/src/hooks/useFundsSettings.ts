"use client";

import { useEffect, useState } from "react";
import { setSettings } from "@/shared/tourist-visa/engine";
import { touristVisaService } from "@/services/touristVisaService";
import { readFundsSettings, type FundsSettings } from "@/utils/touristVisaFunds";

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

let pending: Promise<FundsSettings | null> | null = null;
let settled: FundsSettings | null | undefined;

/**
 * The bank activity settings from the server, loaded once per page load. They are handed to the shared engine too (setSettings), which is
 * how the form knows which month of a statement must be explained: the numbers exist on the server only. A failure gives null: the
 * section then asks for no explanation it cannot work out (the server still checks).
 */
export function loadFundsSettings(): Promise<FundsSettings | null> {
  if (!pending) {
    pending = Promise.resolve()
      .then(() => {
        const token = readToken();
        if (!token) throw new Error("not signed in");
        return touristVisaService.getFundsSettings(token);
      })
      .then(readFundsSettings, () => null)
      .then((result) => {
        settled = result;
        if (result) setSettings({ spikePercent: result.spikePercent, singleTransactionPercent: result.singleTransactionPercent, singleTransactionFloor: result.singleTransactionFloor });
        return result;
      });
  }
  return pending;
}

/** The settings: undefined while they load, then the settings or null when they are unavailable. */
export function useFundsSettings(): FundsSettings | null | undefined {
  const [settings, setLoaded] = useState<FundsSettings | null | undefined>(() => settled);
  useEffect(() => {
    let alive = true;
    void loadFundsSettings().then((result) => {
      if (alive) setLoaded(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
