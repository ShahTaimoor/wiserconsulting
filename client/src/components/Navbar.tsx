"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/redux/store";
import { logout } from "@/redux/slices/auth/authSlice";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 bg-transparent">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <span className="text-white font-black text-lg">WC</span>
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-100/90">
                WISER CONSULTING
              </span>
              <span className="text-[11px] text-slate-300 uppercase tracking-[0.25em]">
                CONSULTANT
              </span>
            </div>
          </Link>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-center h-12 w-12 rounded-2xl border border-slate-200/10 bg-slate-950/80 text-slate-100 shadow-2xl shadow-slate-950/30 transition hover:bg-slate-900"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
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
                    <p className="text-sm font-semibold text-slate-100">Premium consulting</p>
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
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={`block text-3xl font-semibold transition ${
                        index === 0 ? 'text-emerald-400' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>

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
              </div>

              <div className="mt-auto flex flex-col gap-2 border-t border-slate-700/70 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-100">Contact</p>
                  <p>hello@wiserconsulting.com</p>
                </div>
                <div className="flex gap-2 text-slate-300">
                  <span>+1-212-456-7890</span>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
