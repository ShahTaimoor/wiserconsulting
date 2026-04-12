"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { logout } from "@/redux/slices/auth/authSlice";
import { useAppSelector } from "@/redux/hooks";
import { isAdminRole } from "@/utils/authRole";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shadcn-space/blocks/sidebar-06/app-sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
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
  }, [user, router]);

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  // Show loading state while checking authentication
  if (!user || !isAdminRole(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <SidebarProvider className="p-4 bg-muted min-h-screen" style={{ "--sidebar-width": "300px" } as React.CSSProperties}>
      <AppSidebar />
      <div className="flex flex-1 flex-col gap-4">
        {/* Modern Admin Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 rounded-xl bg-background px-4 shadow-sm">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="cursor-pointer" />
            <div className="h-4 w-[1px] bg-slate-200 mx-2" />
            <h1 className="text-sm font-semibold text-gray-900">Admin Panel</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-gray-600 hidden sm:inline-block">Welcome, {user.name}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 rounded-xl bg-background p-4 shadow-sm overflow-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
