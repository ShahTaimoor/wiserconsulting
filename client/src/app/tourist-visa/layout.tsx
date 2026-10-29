"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppSelector } from "@/redux/hooks";
import { TouristVisaProvider } from "@/context/TouristVisaContext";
import { loginUrlWithNext } from "@/utils/safeRedirect";

/**
 * The site Navbar is transparent with white text until the page is scrolled, which
 * suits the dark hero on the home page but not these white pages. This puts a dark
 * band behind it, as the Navbar already does for /about, /services and /contact.
 * It mirrors the Navbar's own switch: shown while scrollY <= 20, and faded out once
 * the Navbar becomes its white pill. If that threshold changes in Navbar.tsx, change it here.
 * z-30 keeps it under the Navbar (z-50) and under the mobile menu's backdrop (z-40).
 */
function NavbarBackdrop() {
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const update = () => setAtTop(window.scrollY <= 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-30 h-20 bg-slate-900 transition-opacity duration-300 ${
        atTop ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

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

  return (
    <>
      <NavbarBackdrop />
      {!mounted || !user ? (
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : (
        <TouristVisaProvider>{children}</TouristVisaProvider>
      )}
    </>
  );
}
