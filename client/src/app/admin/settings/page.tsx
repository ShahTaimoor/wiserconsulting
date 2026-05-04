"use client";

import { useAppSelector } from "@/redux/hooks";
import AdminSettingsForm from "@/components/admin/AdminSettingsForm";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdminRole } from "@/utils/authRole";
import { Loader2 } from "lucide-react";

/**
 * Admin Settings Page
 * 
 * This page allows admins to update:
 * - Website Title
 * - Email Address
 * - Phone Number
 * - Physical Address
 * - Site Logo (with Cloudinary upload)
 * - Social Media Links
 * 
 * File path: client/src/app/admin/settings/page.tsx
 */

export default function AdminSettingsPage() {
    const router = useRouter();
    const { user, loading } = useAppSelector((state) => state.auth);

    // Redirect if not admin
    useEffect(() => {
        if (!loading && (!user || !isAdminRole(user.role))) {
            router.push("/login");
        }
    }, [user, loading, router]);

    // Show loading state
    if (loading || !user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Show 403 if not admin
    if (!isAdminRole(user.role)) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-800 mb-4">
                        Access Denied
                    </h1>
                    <p className="text-gray-600 mb-6">
                        You don't have permission to access this page.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto">
                <AdminSettingsForm />
            </div>
        </div>
    );
}
