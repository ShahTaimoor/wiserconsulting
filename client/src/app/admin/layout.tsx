"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { logout } from "@/redux/slices/auth/authSlice";
import { useAppSelector } from "@/redux/hooks";
import { isAdminRole } from "@/utils/authRole";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

  const navigation = [
   
    { name: "Form Submissions", href: "/admin/products", icon: "📝" },
    { name: "Merge PDFs", href: "/admin/orders", icon: "🛒" },
    { name: "Users", href: "/admin/users", icon: "👥" },
  ];

  // Show loading state while checking authentication
  if (!user || !isAdminRole(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user.name}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-screen">
          <nav className="mt-8 px-4 space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-green-100 text-green-900 border-r-2 border-green-500"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
