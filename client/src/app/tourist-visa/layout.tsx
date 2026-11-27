"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector } from "@/redux/hooks";
import { TouristVisaProvider } from "@/context/TouristVisaContext";
import { loginUrlWithNext } from "@/utils/safeRedirect";
import { useTouristVisaAvailability } from "@/hooks/useTouristVisaOpen";
import { AvailabilityLoading, ClosedNotice } from "@/components/tourist-visa/ClosedNotice";
import { useFundsSettings } from "@/hooks/useFundsSettings";

/**
 * (The dark band that used to sit behind the old transparent Navbar is gone: the floating glass navbar is its own white pill on every page.)
 *
 * Waits for the bank activity settings (a plain request, once per page load) before the pages are shown: the form needs them to know which month
 * of a statement must be explained. A failure is not waited for: the section then simply asks for no explanation it cannot work out.
 */
function FundsSettingsGate({ children }: { children: ReactNode }) {
  const settings = useFundsSettings();
  if (settings === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Shared layout for /tourist-visa. It first asks whether the feature is open (the server's TOURIST_VISA_ENABLED switch, and
 * this build's own hold): while that is not known it shows a neutral wait, and when it is closed a plain notice, and in both
 * cases mounts nothing else, so no other Tourist Visa call is made. When open, only signed-in users get in: a visitor who is
 * not signed in goes to /login?next=<this page> and comes back after signing in.
 * Same mounted-flag pattern as the admin layout, because the signed-in user is
 * read from localStorage and is not known during server rendering.
 */
export default function TouristVisaLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAppSelector((state) => state.auth);
  const [mounted, setMounted] = useState(false);
  const availability = useTouristVisaAvailability();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (availability !== "open" || !mounted || user) return;
    router.replace(loginUrlWithNext(`${pathname}${window.location.search}`));
  }, [availability, mounted, user, pathname, router]);

  return (
    <>
      {availability === "loading" ? (
        <AvailabilityLoading />
      ) : availability === "closed" ? (
        <ClosedNotice />
      ) : !mounted || !user ? (
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : (
        <TouristVisaProvider>
          <FundsSettingsGate>{children}</FundsSettingsGate>
        </TouristVisaProvider>
      )}
    </>
  );
}
