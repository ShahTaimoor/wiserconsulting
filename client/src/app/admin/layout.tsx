"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { logout } from "@/redux/slices/auth/authSlice";
import { useAppSelector } from "@/redux/hooks";
import { isAdminRole } from "@/utils/authRole";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import dynamic from "next/dynamic";

// Dynamically import AppSidebar to prevent SSR
const AppSidebar = dynamic(
  () => import("@/components/shadcn-space/blocks/sidebar-06/app-sidebar").then(mod => ({ default: mod.AppSidebar })),
  { 
    ssr: false,
    loading: () => <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
  }
);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAppSelector((state) => state.auth);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only run redirects after component is mounted
    if (!mounted) return;

    // Check if user is logged in
    if (!user) {
      router.replace("/login");
      return;
    }

    // Redirect if not admin
    if (!isAdminRole(user.role)) {
      router.replace("/");
      return;
    }
  }, [user, router, mounted]);

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  // Show loading state while checking authentication or not mounted
  if (!mounted || !user || !isAdminRole(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <SidebarProvider className="p-4 bg-muted min-h-screen" style={{ "--sidebar-width": "300px" } as React.CSSProperties}>
      <AppSidebar />
      <div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">
        {/* Modern Admin Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 rounded-xl bg-background px-4 shadow-sm w-full">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="cursor-pointer" />
            <div className="h-4 w-[1px] bg-slate-200 mx-2" />
            <h1 className="text-sm font-semibold text-gray-900 truncate">Admin Panel</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="text-xs font-medium text-gray-600 hidden sm:inline-block truncate max-w-[150px]">Welcome, {user.name}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100 whitespace-nowrap shrink-0"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 rounded-xl bg-background p-2 sm:p-4 shadow-sm overflow-x-hidden overflow-y-auto w-full">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
