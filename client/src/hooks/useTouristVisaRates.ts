"use client";

import { useEffect, useState } from "react";
import { touristVisaService } from "@/services/touristVisaService";
import { createRatesStore, type RatesData } from "@/utils/touristVisaCurrency";

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

/** One store for the whole page load: every currency helper on the page shares its single fetch of the rates. */
export const touristVisaRatesStore = createRatesStore({
  fetchRates: async () => {
    const token = readToken();
    if (!token) throw new Error("not signed in");
    return touristVisaService.getRates(token);
  },
});

/**
 * The exchange rates for the currency helper: undefined while they load, the rates once they are in, or null when they are
 * unavailable for any reason (the helper is then simply not shown). It never reports an error.
 */
export function useTouristVisaRates(): RatesData | null | undefined {
  const [rates, setRates] = useState<RatesData | null | undefined>(() => touristVisaRatesStore.peek());
  useEffect(() => {
    let alive = true;
    void touristVisaRatesStore.get().then((result) => {
      if (alive) setRates(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}
