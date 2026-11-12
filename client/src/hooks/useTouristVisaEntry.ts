"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/redux/hooks";
import { useTouristVisaAvailability } from "@/hooks/useTouristVisaOpen";
import { carriedNext, touristVisaEntryHref } from "@/utils/safeRedirect";

/**
 * What an entry point to the Tourist Visa application needs (step 8i): whether it may be shown at all, and where it goes.
 *
 * `open` is the EXISTING status hook's answer (the server's switch AND this build's own hold): true only for a clear "open". While the
 * answer is not known yet, or the form is closed, or the status check failed, `open` is false and the entry point renders nothing, so the
 * site looks and behaves exactly as it did before. `href` is "/tourist-visa" for a signed-in person and the sign-up page with
 * ?next=/tourist-visa for anyone else.
 */
export function useTouristVisaEntry(): { open: boolean; href: string } {
  const open = useTouristVisaAvailability() === "open";
  const signedIn = useAppSelector((state) => Boolean(state.auth.user));
  return { open, href: touristVisaEntryHref(signedIn) };
}

/**
 * What the sign-up and login pages carry (step 8i): `open` (as above) and `next`, the accepted "next" of the address bar, or null. `next`
 * is null whenever the form is not open, so the links between the two pages and the redirect after success stay exactly as they were.
 * The address bar is read after the page has mounted (it is not known while the server renders the page).
 */
export function useCarriedNext(): { open: boolean; next: string | null } {
  const open = useTouristVisaAvailability() === "open";
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
  }, []);
  return { open, next: carriedNext(open, search) };
}
