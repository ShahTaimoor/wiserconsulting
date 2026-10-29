"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector } from "@/redux/hooks";
import { TouristVisaProvider } from "@/context/TouristVisaContext";
import { loginUrlWithNext } from "@/utils/safeRedirect";

/**
 * Shared layout for /tourist-visa. Only signed-in users get in: a visitor who is
 * not signed in goes to /login?next=<this page> and comes back after signing in.
 * Same mounted-flag pattern as the admin layout, because the signed-in user is
 * read from localStorage and is not known during server rendering.
 */
export default function TouristVisaLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAppSelector((state) => state.auth);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || user) return;
    router.replace(loginUrlWithNext(`${pathname}${window.location.search}`));
  }, [mounted, user, pathname, router]);

  if (!mounted || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return <TouristVisaProvider>{children}</TouristVisaProvider>;
}
