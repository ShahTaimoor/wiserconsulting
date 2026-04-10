"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const authPages = ["/login", "/register", "/login-01"];
  const hideLayout = isAdminRoute || authPages.includes(pathname || "");
  const showNavbar = !hideLayout && !isAdminRoute;
  const isHome = pathname === "/";

  return (
    <>
      {showNavbar && <Navbar />}
      <main className={showNavbar ? (isHome ? "min-h-screen" : "min-h-[calc(100vh-160px)] mt-20") : "min-h-screen"}>
        {children}
      </main>
      {!hideLayout && <Footer />}
    </>
  );
}
