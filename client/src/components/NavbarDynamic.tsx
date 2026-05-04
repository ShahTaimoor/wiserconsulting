"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { usePathname } from "next/navigation";
import { isAdminRole } from "@/utils/authRole";
import { LayoutDashboard } from "lucide-react";
import { adminSettingsService } from "@/services/adminSettingsService";

interface AdminSettings {
    websiteTitle: string;
    email: string;
    phone: string;
    address: string;
    siteLogo?: string;
}

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [settings, setSettings] = useState<AdminSettings>({
        websiteTitle: "Wiser Consulting",
        email: "",
        phone: "",
        address: "",
        siteLogo: "",
    });
    const [loadingSettings, setLoadingSettings] = useState(true);
    const pathname = usePathname();

    const isLightPage =
        pathname === "/about" ||
        pathname === "/services" ||
        pathname === "/contact";
    const isLegalPage = pathname === "/privacy" || pathname === "/terms";

    const dispatch = useAppDispatch();
    const { user } = useAppSelector((state) => state.auth);

    // Fetch admin settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const publicSettings =
                    await adminSettingsService.getPublicSettings();
                setSettings(publicSettings);
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoadingSettings(false);
            }
        };

        fetchSettings();
    }, []);

    // Listen for settings updates across tabs/windows
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "settingsUpdated") {
                const fetchSettings = async () => {
                    try {
                        const publicSettings =
                            await adminSettingsService.getPublicSettings();
                        setSettings(publicSettings);
                    } catch (error) {
                        console.error("Error loading settings:", error);
                    }
                };
                fetchSettings();
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () =>
            window.removeEventListener("storage", handleStorageChange);
    }, []);

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        handleScroll();
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Handle escape key to close sidebar
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen]);

    // Lock body scroll when sidebar is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    useEffect(() => {
        const savedTheme =
            typeof window !== "undefined"
                ? localStorage.getItem("theme")
                : null;
        const prefersDark =
            typeof window !== "undefined"
                ? window.matchMedia("(prefers-color-scheme: dark)").matches
                : false;
        const initialDark = savedTheme === "dark" || (!savedTheme && prefersDark);
        setIsDarkMode(initialDark);
    }, []);

    const handleLogout = () => {
        dispatch(logout());
        setIsOpen(false);
    };

    if (loadingSettings) {
        return (
            <nav className="flex items-center justify-center h-16 bg-white shadow-md">
                <Loader2 className="h-5 w-5 animate-spin" />
            </nav>
        );
    }

    return (
        <nav
            className={`sticky top-0 z-50 transition-all duration-300 ${
                isScrolled
                    ? "bg-white shadow-md dark:bg-gray-900 dark:shadow-lg"
                    : "bg-white dark:bg-gray-900"
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Logo and Title */}
                    <Link
                        href="/"
                        className="flex items-center gap-3 hover:opacity-80 transition"
                    >
                        {settings.siteLogo && (
                            <img
                                src={settings.siteLogo}
                                alt={settings.websiteTitle}
                                className="h-10 w-auto object-contain"
                            />
                        )}
                        <span className="text-xl font-bold text-gray-800 dark:text-white">
                            {settings.websiteTitle}
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-6">
                        <Link
                            href="/about"
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                            About
                        </Link>
                        <Link
                            href="/services"
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                            Services
                        </Link>
                        <Link
                            href="/contact"
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                            Contact
                        </Link>

                        {!user ? (
                            <>
                                <Link
                                    href="/login"
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
                                >
                                    Login
                                </Link>
                                <Link
                                    href="/register"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                >
                                    Sign Up
                                </Link>
                            </>
                        ) : (
                            <div className="flex items-center gap-3">
                                {isAdminRole(user.role) && (
                                    <Link
                                        href="/admin"
                                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                                        title="Admin Dashboard"
                                    >
                                        <LayoutDashboard className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                                    </Link>
                                )}
                                <button
                                    onClick={handleLogout}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                                    title="Logout"
                                >
                                    <LogOut className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? (
                            <X className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                        ) : (
                            <Menu className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Sidebar */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
                    >
                        <div className="px-4 py-4 space-y-3">
                            <Link
                                href="/about"
                                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                onClick={() => setIsOpen(false)}
                            >
                                About
                            </Link>
                            <Link
                                href="/services"
                                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                onClick={() => setIsOpen(false)}
                            >
                                Services
                            </Link>
                            <Link
                                href="/contact"
                                className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                onClick={() => setIsOpen(false)}
                            >
                                Contact
                            </Link>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                                {!user ? (
                                    <>
                                        <Link
                                            href="/login"
                                            className="block px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                            onClick={() => setIsOpen(false)}
                                        >
                                            Login
                                        </Link>
                                        <Link
                                            href="/register"
                                            className="block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                            onClick={() => setIsOpen(false)}
                                        >
                                            Sign Up
                                        </Link>
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        {isAdminRole(user.role) && (
                                            <Link
                                                href="/admin"
                                                className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <LayoutDashboard className="h-5 w-5" />
                                                Admin Dashboard
                                            </Link>
                                        )}
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                                        >
                                            <LogOut className="h-5 w-5" />
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
};

export default Navbar;
