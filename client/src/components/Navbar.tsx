"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Phone, LogOut, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { useSettings } from "@/context/SettingsContext";

import { usePathname } from "next/navigation";
import { isAdminRole } from "@/utils/authRole";
import { LayoutDashboard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const pathname = usePathname();

  const isLightPage = pathname === '/about' || pathname === '/services' || pathname === '/contact';
  const isLegalPage = pathname === '/privacy' || pathname === '/terms';

  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { settings, loading: settingsLoading } = useSettings();

  const displayLogo = settings.logoUrl || "/logo.png";
  const displayTitle = settings.websiteTitle || "WISER CONSULTING";
  const displayPhone = settings.phoneNumber || "+923709706643";

  useEffect(() => {
    setMounted(true);
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

  const handleLogout = () => {
    dispatch(logout());
    setIsOpen(false);
  };

  // Smooth close handler
  const handleClose = () => {
    setIsOpen(false);
  };

  const baseNavLinks = [
    { id: "home", href: "/#home", label: "Home" },
    { id: "about", href: "/#about", label: "About" },
    { id: "services", href: "/#services", label: "Services" },
    { id: "contact", href: "/#contact", label: "Contact" },
  ];

  const navLinks = baseNavLinks;

  // Smooth-scroll to the matching section when already on the homepage;
  // otherwise let the Link navigate to "/#id" and the browser scrolls after load.
  const handleSectionNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (pathname === "/") {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
    setIsOpen(false);
  };

  // Scroll-spy: highlight whichever section is currently in view, whether the
  // user got there by clicking a nav link or by scrolling manually. Only runs
  // client-side (mounted) and only on the homepage, where the sections exist.
  // Re-runs when `pathname` changes so it (re)attaches after navigating back
  // to "/" from another route (e.g. a "/#about" link clicked from /privacy).
  useEffect(() => {
    if (!mounted || pathname !== "/") {
      setActiveSection(null);
      return;
    }

    const sections = navLinks
      .map((link) => document.getElementById(link.id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      // Active "trigger line" sits just below the fixed navbar and extends
      // through the top ~40% of the viewport - a natural spot for a section
      // to be considered "current" without feeling early or late.
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, pathname]);

  return (
    <>
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? "bg-transparent px-3 py-3 sm:px-4" : (isLightPage || isLegalPage ? "bg-slate-900" : "bg-transparent")}`}>
        {isScrolled ? (
          <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/70 bg-white/95 px-4 py-2 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.2)] backdrop-blur-xl">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <img
                src={displayLogo}
                alt={displayTitle}
                className="h-12 w-auto rounded-2xl object-contain"
              />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className={`whitespace-nowrap text-sm font-semibold uppercase tracking-[0.25em] ${isLegalPage ? 'text-slate-900 font-bold' : 'text-slate-900'}`}>
                  {displayTitle}
                </span>
                <span
                  title="YOUR COMPASS FOR GLOBAL EDUCATION, IMMIGRATION & VISIT"
                  className={`block max-w-[150px] truncate text-[10px] uppercase tracking-[0.15em] sm:max-w-[150px] md:max-w-[140px] lg:max-w-[300px] xl:max-w-[420px] ${isLegalPage ? 'text-emerald-600 font-semibold' : 'text-slate-500'}`}
                >
                  YOUR COMPASS FOR GLOBAL EDUCATION, IMMIGRATION & VISIT
                </span>
              </div>
            </Link>

            <div className="hidden md:flex flex-1 items-center justify-center gap-8 px-4">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleSectionNavClick(e, link.id)}
                    className={`relative pb-1 text-sm font-semibold transition-colors ${isActive ? "text-emerald-600" : "text-slate-700 hover:text-emerald-600"
                      }`}
                  >
                    {link.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active-indicator"
                        className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-emerald-500"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-slate-950 shadow-sm shadow-slate-950/10 dark:bg-slate-950 dark:text-slate-50 dark:shadow-slate-950/20">
                  <Phone size={18} />
                  <span className="font-semibold">{displayPhone}</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2">
                {mounted && user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 transition hover:bg-slate-200">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10">
                          <UserIcon className="text-emerald-600" size={14} />
                        </div>
                        <span className="max-w-[100px] truncate text-xs font-semibold text-slate-800">{user.name}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isAdminRole(user.role) && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin/products" className="flex cursor-pointer items-center gap-2">
                            <LayoutDashboard size={14} />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={handleLogout}
                        className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                      >
                        <LogOut size={14} />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-400"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-emerald-400 hover:text-emerald-600"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>

              <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-950 text-white shadow-md shadow-slate-950/20 transition hover:bg-slate-800 md:hidden"
                aria-label="Toggle menu"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  key={isOpen ? 'close' : 'menu'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  {isOpen ? <X size={24} /> : <Menu size={24} />}
                </motion.div>
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <img
                src={displayLogo}
                alt={displayTitle}
                className="h-11 w-auto rounded-2xl object-contain"
              />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className={`whitespace-nowrap text-sm font-semibold uppercase tracking-[0.25em] ${isLegalPage ? 'text-white' : 'text-slate-100/90'}`}>
                  {displayTitle}
                </span>
                <span
                  title="YOUR COMPASS FOR GLOBAL EDUCATION, IMMIGRATION & VISIT"
                  className={`block max-w-[150px] truncate text-[10px] uppercase tracking-[0.15em] sm:max-w-[150px] md:max-w-[140px] lg:max-w-[300px] xl:max-w-[420px] ${isLegalPage ? 'text-emerald-300' : 'text-slate-300'}`}
                >
                  YOUR COMPASS FOR GLOBAL EDUCATION, IMMIGRATION & VISIT
                </span>
              </div>
            </Link>
            <div className="hidden md:flex flex-1 items-center justify-center gap-8 px-4">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleSectionNavClick(e, link.id)}
                    className={`relative pb-1 text-sm font-semibold transition-colors ${isActive ? "text-emerald-400" : "text-slate-100/90 hover:text-white"
                      }`}
                  >
                    {link.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active-indicator"
                        className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-emerald-400"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-slate-950 shadow-sm shadow-slate-950/10 dark:bg-slate-950 dark:text-slate-50 dark:shadow-slate-950/20">
                  <Phone size={18} />
                  <span className="font-semibold">{displayPhone}</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2">
                {mounted && user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 transition hover:bg-white/20">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20">
                          <UserIcon className="text-emerald-400" size={14} />
                        </div>
                        <span className="max-w-[100px] truncate text-xs font-semibold text-slate-100">{user.name}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isAdminRole(user.role) && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin/products" className="flex cursor-pointer items-center gap-2">
                            <LayoutDashboard size={14} />
                            Admin
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={handleLogout}
                        className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                      >
                        <LogOut size={14} />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:border-emerald-300 hover:text-white"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>

              <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-center h-11 w-11 rounded-2xl border ${isLightPage ? 'border-white/10 bg-slate-800/80 hover:bg-slate-700' : 'border-slate-200/10 bg-slate-950/80 hover:bg-slate-900'} text-slate-100 shadow-2xl shadow-slate-950/30 transition md:hidden`}
                aria-label="Toggle menu"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  key={isOpen ? 'close' : 'menu'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  {isOpen ? <X size={24} /> : <Menu size={24} />}
                </motion.div>
              </motion.button>
            </div>
          </div>
        )}
      </nav>

      <AnimatePresence mode="wait">
        {isOpen && (
          <>
            {/* Backdrop for clicking outside */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              onClick={handleClose}
              onPointerDown={handleClose}
              className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px] cursor-pointer"
              style={{ pointerEvents: 'auto' }}
            />
            <motion.section
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{
                type: 'tween',
                duration: 0.35,
                ease: 'easeInOut',
              }}
              className="fixed inset-y-0 right-0 z-50 w-full md:w-1/2 bg-slate-950/95 backdrop-blur-xl text-slate-100 shadow-2xl shadow-slate-950/30"
              style={{ pointerEvents: 'auto', transformOrigin: 'right' }}
            >
              <div className="relative flex h-full w-full flex-col justify-between px-6 py-8 sm:px-10 sm:py-12">
                <motion.div 
                  className="flex items-center justify-between"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: 0.08, duration: 0.3, ease: "easeOut" }}
                >
                  <Link href="/" className="flex items-center gap-3">
                    <motion.img
                      src={displayLogo}
                      alt={displayTitle}
                      className="h-12 w-auto rounded-2xl object-contain"
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.2 }}
                    />
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.4em] text-emerald-300/90">Wiser</p>
                      <p className="text-sm font-semibold text-slate-100">Consulting</p>
                    </div>
                  </Link>
                  <motion.button
                    onClick={handleClose}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/10 bg-slate-900/80 text-slate-100 transition hover:bg-slate-800"
                    aria-label="Close menu"
                    whileHover={{ scale: 1.08, backgroundColor: "rgb(15, 23, 42)" }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <motion.div
                      initial={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      whileHover={{ rotate: 90 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      <X size={24} />
                    </motion.div>
                  </motion.button>
                </motion.div>

                <div className="flex flex-col justify-center gap-10 px-2 py-6 sm:px-4">
                  <div className="space-y-4 md:hidden">
                    {navLinks.map((link, index) => {
                      const isActive = activeSection === link.id;
                      return (
                        <motion.div
                          key={link.href}
                          initial={{ opacity: 0, x: -40 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -40 }}
                          transition={{
                            delay: 0.12 + index * 0.08,
                            duration: 0.4,
                            ease: "easeOut"
                          }}
                        >
                          <motion.div
                            whileHover={{ x: 10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          >
                            <Link
                              href={link.href}
                              onClick={(e) => handleSectionNavClick(e, link.id)}
                              className={`relative inline-block text-3xl font-semibold transition-all duration-300 ${isActive ? "text-emerald-400" : "text-slate-300 hover:text-emerald-300"
                                }`}
                            >
                              {isActive && (
                                <motion.span
                                  layoutId="mobile-nav-active-indicator"
                                  className="absolute -left-4 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400"
                                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                              )}
                              {link.label}
                            </Link>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <motion.div 
                    className="flex flex-col gap-4"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30 }}
                    transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
                  >
                    {mounted && user ? (
                      <motion.div 
                        className="flex flex-row flex-wrap items-center justify-between gap-3 px-2 py-4 border-t border-slate-800"
                        whileHover={{ scale: 1.01 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* User Info */}
                        <div className="flex items-center gap-3">
                          <motion.div 
                            className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20"
                            whileHover={{ scale: 1.1, boxShadow: "0 0 20px rgba(16, 185, 129, 0.3)" }}
                            transition={{ duration: 0.2 }}
                          >
                            <UserIcon className="text-emerald-400" size={20} />
                          </motion.div>
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-slate-100">{user.name}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[100px]">{user.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isAdminRole(user.role) && (
                            <motion.div
                              whileHover={{ scale: 1.08 }}
                              whileTap={{ scale: 0.92 }}
                              transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            >
                              <Link
                                href="/admin/products"
                                onClick={handleClose}
                                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                              >
                                <LayoutDashboard size={14} />
                                Admin
                              </Link>
                            </motion.div>
                          )}

                          <motion.button
                            onClick={handleLogout}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500 hover:text-white"
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.92 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          >
                            <LogOut size={14} />
                            Logout
                          </motion.button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 0.55, duration: 0.3, ease: "easeOut" }}
                      >
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className="w-full sm:w-auto"
                        >
                          <Link
                            href="/login"
                            onClick={handleClose}
                            className="inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-emerald-500 px-8 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                          >
                            Sign In
                          </Link>
                        </motion.div>
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          className="w-full sm:w-auto"
                        >
                          <Link
                            href="/register"
                            onClick={handleClose}
                            className="inline-flex w-full sm:w-auto items-center justify-center rounded-full border border-emerald-400/40 bg-slate-900/90 px-8 py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-300 hover:text-white"
                          >
                            Sign Up
                          </Link>
                        </motion.div>
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                <motion.div 
                  className="mt-auto flex flex-col gap-4 border-t border-slate-700/70 pt-6 text-sm text-slate-400"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 30 }}
                  transition={{ delay: 0.6, duration: 0.4, ease: "easeOut" }}
                >
                  <motion.div 
                    whileHover={{ x: 5 }} 
                    transition={{ duration: 0.2 }}
                  >
                    <p className="font-semibold text-slate-100">Contact</p>
                    <p className="text-slate-400">{settings.emailAddress || ""}</p>
                  </motion.div>
                  <motion.div 
                    whileHover={{ x: 5 }} 
                    transition={{ duration: 0.2 }}
                  >
                    <p className="font-semibold text-slate-100">Phone</p>
                    <p className="text-slate-400">{settings.phoneNumber || "+923709706643"}</p>
                  </motion.div>
                </motion.div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
