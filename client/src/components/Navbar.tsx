"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Phone, LogOut, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";

import { usePathname } from "next/navigation";
import { isAdminRole } from "@/utils/authRole";
import { LayoutDashboard } from "lucide-react";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const pathname = usePathname();
  
  const isLightPage = pathname === '/about' || pathname === '/services' || pathname === '/contact';
  const isLegalPage = pathname === '/privacy' || pathname === '/terms';

  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const savedTheme = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    const prefersDark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    const initialDark = savedTheme === "dark" || (!savedTheme && prefersDark);
    setIsDarkMode(initialDark);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", initialDark);
    }
  }, []);

  const handleLogout = () => {
    dispatch(logout());
    setIsOpen(false);
  };

  const baseNavLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ];

  const navLinks = isAdminRole(user?.role) 
    ? [...baseNavLinks, { href: "/admin/products", label: "Dashboard" }]
    : baseNavLinks;

  return (
    <>
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? "bg-transparent px-3 py-3 sm:px-4" : (isLightPage || isLegalPage ? "bg-slate-900" : "bg-transparent")}`}>
        {isScrolled ? (
          <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/70 bg-white/95 px-4 py-2 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.2)] backdrop-blur-xl">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-3xl bg-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                <span className="text-white font-black text-lg">WC</span>
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className={`text-sm font-semibold uppercase tracking-[0.25em] ${isLegalPage ? 'text-slate-900 font-bold' : 'text-slate-900'}`}>
                  WISER CONSULTING
                </span>
                <span className={`text-[11px] uppercase tracking-[0.25em] ${isLegalPage ? 'text-emerald-600 font-semibold' : 'text-slate-500'}`}>
                  CONSULTANT
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-slate-950 shadow-sm shadow-slate-950/10 dark:bg-slate-950 dark:text-slate-50 dark:shadow-slate-950/20">
                  <Phone size={18} />
                  <span className="font-semibold">+923709706643</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-950 text-white shadow-md shadow-slate-950/20 transition hover:bg-slate-800"
                aria-label="Toggle menu"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-11 h-11 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                <span className="text-white font-black text-lg">WC</span>
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className={`text-sm font-semibold uppercase tracking-[0.25em] ${isLegalPage ? 'text-white' : 'text-slate-100/90'}`}>
                  WISER CONSULTING
                </span>
                <span className={`text-[11px] uppercase tracking-[0.25em] ${isLegalPage ? 'text-emerald-300' : 'text-slate-300'}`}>
                  CONSULTANT
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-slate-950 shadow-sm shadow-slate-950/10 dark:bg-slate-950 dark:text-slate-50 dark:shadow-slate-950/20">
                  <Phone size={18} />
                  <span className="font-semibold">+923709706643</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-center h-11 w-11 rounded-2xl border ${isLightPage ? 'border-white/10 bg-slate-800/80 hover:bg-slate-700' : 'border-slate-200/10 bg-slate-950/80 hover:bg-slate-900'} text-slate-100 shadow-2xl shadow-slate-950/30 transition`}
                aria-label="Toggle menu"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        )}
      </nav>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for clicking outside */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px]"
            />
            <motion.section
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-y-0 right-0 z-50 w-full md:w-1/2 bg-slate-950/95 backdrop-blur-xl text-slate-100 shadow-2xl shadow-slate-950/30"
            >
            <div className="relative flex h-full w-full flex-col justify-between px-6 py-8 sm:px-10 sm:py-12">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                    <span className="text-white font-black text-lg">WC</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/90">Wiser</p>
                    <p className="text-sm font-semibold text-slate-100">Consulting</p>
                  </div>
                </Link>
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/10 bg-slate-900/80 text-slate-100 transition hover:bg-slate-800"
                  aria-label="Close menu"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-col justify-center gap-10 px-2 py-6 sm:px-4">
                <div className="space-y-4">
                  {navLinks.map((link, index) => (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + index * 0.1, duration: 0.4, ease: "easeOut" }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className={`inline-block text-3xl font-semibold transition-all duration-300 hover:translate-x-3 ${pathname === link.href ? 'text-emerald-400' : 'text-slate-300 hover:text-emerald-300'
                          }`}
                      >
                        {link.label}
                      </Link>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-col gap-4">
                  {user ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 px-2 py-3 border-b border-slate-800">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
                            <UserIcon className="text-emerald-400" size={20} />
                          </div>
                          <div className="flex flex-col">
                            <p className="text-sm font-medium text-slate-100">{user.name}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>

                        {isAdminRole(user.role) && (
                          <Link
                            href="/admin/products"
                            onClick={() => setIsOpen(false)}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-800 border border-slate-700 px-8 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                          >
                            <LayoutDashboard size={18} />
                            Admin Dashboard
                          </Link>
                        )}

                        <button
                          onClick={handleLogout}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500/10 border border-red-500/20 px-8 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500 hover:text-white"
                        >
                          <LogOut size={18} />
                          Logout
                        </button>
                      </div>
                  ) : (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                      <Link
                        href="/login"
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-8 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-slate-900/90 px-8 py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-300 hover:text-white"
                      >
                        Sign Up
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-4 border-t border-slate-700/70 pt-6 text-sm text-slate-400">
                <div>
                  <p className="font-semibold text-slate-100">Contact</p>
                  <p>wiserconsulting55@gmail.com</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">Phone</p>
                  <p>+923709706643</p>
                </div>
              </div>
            </div>
          </motion.section>
        </>
      )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
