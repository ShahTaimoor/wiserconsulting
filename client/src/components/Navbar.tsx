"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Menu, X, Phone, Mail, LogOut, MessageSquare, LayoutDashboard, User as UserIcon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { logout } from "@/redux/slices/auth/authSlice";
import { useSettings } from "@/context/SettingsContext";
import { usePathname, useRouter } from "next/navigation";
import { requestAssessmentForm } from "@/utils/assessmentForm";
import { useTouristVisaEntry } from "@/hooks/useTouristVisaEntry";
import { requestCommentsPanel, useCommentsViewed } from "@/utils/commentsPanel";
import { fetchAdminComments } from "@/redux/slices/formSubmission/formSubmissionSlice";
import { isAdminRole } from "@/utils/authRole";
import { navbarButtonText } from "@/utils/safeRedirect";
import { announceOverlayOpen, subscribeOverlays } from "@/utils/overlays";
import { NAV_LINKS, activeNavHref, avatarMenuItems, highlightBox, isCompact, navbarCompactText, userInitials } from "@/utils/navbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The public site's navbar: ONE floating "glass pill" that sits a few pixels below the top edge on every page that has a navbar. After the page is
 * scrolled the same bar compacts a little and its shadow deepens (no second bar). Its pieces:
 *
 *  - desktop (768 px and up): the logo, the links Home / About / Services / Contact with a highlight that slides to the current page, the orange
 *    primary button, and either a "Sign in" link (signed out) or ONE round avatar menu (signed in: Comments, Admin dashboard for administrators,
 *    Log out). The phone number and the person's name are not in the bar (the number is in the phone menu, the footer and the Contact page);
 *  - phone: the logo, a compact orange button and a menu button; the menu is a full-height sheet (the links, the account actions, the phone number
 *    and email, and the full-width primary button at the bottom) that holds the keyboard focus, closes with Escape and on every page change, and
 *    stops the page behind it from scrolling.
 *
 * Unchanged on purpose: the primary button's words (navbarButtonText: "Apply for UK Tourist Visa" while the Tourist Visa form is open, "Fill
 * Form" otherwise), where it goes (the application when signed in, the sign-up page carrying next when not; the old documents popup while the form
 * is closed), what administrators see, and the Comments logic. Stacking: the names in globals.css (z-(--z-navbar), z-(--z-nav-sheet), z-(--z-popover)).
 * Motion is small (the sliding highlight, the compacting, the sheet opening) and stops for people who ask for reduced motion.
 */
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

const Navbar = () => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // the avatar menu
  const pathname = usePathname();
  const router = useRouter();
  const sheetId = useId();

  // The primary button goes to the Tourist Visa application (its Documents section has the uploads) while that form is open; otherwise it
  // opens the documents popup as before.
  const touristVisaEntry = useTouristVisaEntry();
  const applyText = navbarButtonText(touristVisaEntry.open);
  const compactText = navbarCompactText(touristVisaEntry.open);
  const openAssessment = () => {
    if (touristVisaEntry.open) {
      router.push(touristVisaEntry.href);
      return;
    }
    requestAssessmentForm(pathname, (url) => router.push(url));
  };

  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { settings } = useSettings();
  const commentsViewed = useCommentsViewed();
  const adminComments = useAppSelector((state) => state.formSubmission.adminComments);
  const currentSubmission = useAppSelector((state) => state.formSubmission.currentSubmission);
  // Only the comments on this customer's own documents are counted.
  const commentCount = adminComments.filter((c) => currentSubmission?.documents.some((d) => d._id === c.documentId)).length;
  const showCommentCount = commentCount > 0 && !commentsViewed;
  // The home page loads the comments itself; on any other page the navbar does, so the red counter is right everywhere.
  useEffect(() => {
    if (user?.email && pathname !== "/" && !isAdminRole(user.role)) {
      dispatch(fetchAdminComments(user.email));
    }
  }, [user?.email, user?.role, pathname, dispatch]);
  const openComments = () => requestCommentsPanel(pathname, (url) => router.push(url));

  const displayLogo = settings.logoUrl || "/logo.png";
  const displayTitle = settings.websiteTitle || "WISER CONSULTING";
  const displayPhone = settings.phoneNumber || "+923709706643";

  // The signed-in person is only known in the browser (the store is read from localStorage), so the account parts wait for the page to mount.
  useEffect(() => {
    setMounted(true);
  }, []);
  const signedIn = mounted && Boolean(user);
  const items = signedIn ? avatarMenuItems(user) : [];

  // ---------------------------------------------------------------- one bar that compacts
  useEffect(() => {
    const update = () => setCompact(isCompact(window.scrollY));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // ---------------------------------------------------------------- the highlight that slides to the current page
  const activeHref = activeNavHref(pathname);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [box, setBox] = useState<{ x: number; width: number } | null>(null);
  const [slide, setSlide] = useState(false); // false until the first measurement is on screen, so the highlight does not fly in from the left on load
  useEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      const link = activeHref ? linkRefs.current[activeHref] : null;
      setBox(row && link ? highlightBox(link.getBoundingClientRect(), row.getBoundingClientRect()) : null);
    };
    measure();
    const frame = requestAnimationFrame(() => setSlide(true));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer && rowRef.current) observer.observe(rowRef.current);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeHref]);

  // ---------------------------------------------------------------- the phone menu sheet
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const openSheet = () => {
    announceOverlayOpen("nav-sheet"); // an open chat panel closes: one floating layer at a time
    setSheetOpen(true);
  };

  // One floating layer at a time: when the chat panel opens, an open avatar menu or phone sheet closes WITHOUT handing the focus back to its
  // button (the chat panel has just taken it). Closing by the person (Escape, a link, the X) still returns the focus as before.
  const menuOpenRef = useRef(false);
  const sheetOpenRef = useRef(false);
  const skipMenuFocus = useRef(false);
  const skipSheetFocus = useRef(false);
  menuOpenRef.current = menuOpen;
  sheetOpenRef.current = sheetOpen;
  useEffect(
    () =>
      subscribeOverlays("avatar-menu", () => {
        if (menuOpenRef.current) skipMenuFocus.current = true;
        setMenuOpen(false);
      }),
    [],
  );
  useEffect(
    () =>
      subscribeOverlays("nav-sheet", () => {
        if (sheetOpenRef.current) skipSheetFocus.current = true;
        setSheetOpen(false);
      }),
    [],
  );

  // A new page closes it (a link to the page you are already on is closed by its own click).
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  // While it is open: Escape closes it, and the page behind does not scroll. The keyboard focus goes in, and back to the menu button after.
  useEffect(() => {
    if (!sheetOpen) {
      if (wasOpen.current && !skipSheetFocus.current) menuButtonRef.current?.focus();
      skipSheetFocus.current = false;
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;
    const saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = saved;
    };
  }, [sheetOpen]);

  // Tab and Shift+Tab stay inside the open sheet.
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !sheetRef.current) return;
    const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    setSheetOpen(false);
  };

  const initials = user ? userInitials(user.name) : "";
  const slideClass = slide ? "transition-[transform,width,opacity] duration-300 ease-out motion-reduce:transition-none" : "";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-(--z-popover) focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
      >
        Skip to main content
      </a>

      <header className={`pointer-events-none fixed inset-x-0 top-0 z-(--z-navbar) px-3 transition-[padding] duration-300 motion-reduce:transition-none sm:px-4 ${compact ? "pt-2" : "pt-3"}`}>
        <nav
          aria-label="Main"
          className={`pointer-events-auto relative mx-auto flex max-w-[1240px] items-center justify-between gap-3 rounded-full border border-white/70 bg-white/95 px-3 ring-1 ring-slate-900/5 backdrop-blur-xl transition-[height,box-shadow] duration-300 motion-reduce:transition-none supports-[backdrop-filter]:bg-white/85 md:px-4 ${
            compact ? "h-14 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]" : "h-[68px] shadow-[0_8px_28px_-14px_rgba(15,23,42,0.28)]"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center justify-start">
            <Link href="/" className={`flex min-h-11 min-w-0 items-center gap-3 rounded-full ${FOCUS}`} aria-label={`${displayTitle} home`}>
              <img src={displayLogo} alt="" className="h-10 w-auto shrink-0 rounded-xl object-contain" />
              <span className="hidden min-w-0 flex-col leading-tight lg:flex">
                <span className="truncate whitespace-nowrap text-sm font-semibold uppercase tracking-[0.2em] text-slate-900">{displayTitle}</span>
                <span className="hidden max-w-[380px] truncate text-[10px] uppercase tracking-[0.14em] text-slate-600 xl:block">Your compass for global education, immigration &amp; visit</span>
              </span>
            </Link>
          </div>

          <div ref={rowRef} className="relative hidden items-center gap-1 md:flex">
            <span
              aria-hidden
              className={`pointer-events-none absolute left-0 top-1/2 h-9 rounded-full bg-emerald-600/10 ring-1 ring-emerald-600/15 ${slideClass}`}
              style={box ? { width: box.width, transform: `translate(${box.x}px, -50%)`, opacity: 1 } : { width: 0, transform: "translate(0px, -50%)", opacity: 0 }}
            />
            {NAV_LINKS.map((link) => {
              const isActive = activeHref === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  ref={(element) => {
                    linkRefs.current[link.href] = element;
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative z-10 inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold transition-colors motion-reduce:transition-none ${FOCUS} ${isActive ? "text-emerald-800" : "text-slate-700 hover:text-slate-950"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={openAssessment}
              className={`hidden h-10 items-center justify-center whitespace-nowrap rounded-[12px] bg-orange-300 px-4 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-orange-200 motion-reduce:transition-none md:inline-flex ${FOCUS}`}
            >
              {applyText}
            </button>
            <button
              type="button"
              onClick={openAssessment}
              aria-label={applyText}
              className={`inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[12px] bg-orange-300 px-4 text-sm font-semibold text-slate-950 shadow-sm transition-colors hover:bg-orange-200 motion-reduce:transition-none md:hidden ${FOCUS}`}
            >
              {compactText}
            </button>

            {signedIn && user ? (
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(next) => {
                  setMenuOpen(next);
                  if (next) announceOverlayOpen("avatar-menu"); // an open chat panel closes
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Account menu for ${user.name}`}
                    className={`relative hidden h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 motion-reduce:transition-none md:flex ${FOCUS}`}
                  >
                    {initials || <UserIcon size={18} aria-hidden />}
                    {showCommentCount && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-600" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={12}
                  className="z-(--z-popover) w-64 rounded-2xl p-2"
                  onCloseAutoFocus={(event) => {
                    // Closed because the chat panel opened: the panel has the focus, the avatar button must not take it.
                    if (skipMenuFocus.current) {
                      skipMenuFocus.current = false;
                      event.preventDefault();
                    }
                  }}
                >
                  <DropdownMenuLabel className="px-3 py-2">
                    <span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span>
                    {user.email && <span className="block truncate text-xs font-normal text-slate-600">{user.email}</span>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {items.map((item) =>
                    item.id === "admin" ? (
                      <DropdownMenuItem key={item.id} asChild className="min-h-11 cursor-pointer rounded-xl px-3 text-sm">
                        <Link href={item.href ?? "/admin/products"} className="flex items-center gap-2">
                          <LayoutDashboard aria-hidden /> {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ) : item.id === "comments" ? (
                      <DropdownMenuItem key={item.id} onSelect={openComments} className="min-h-11 cursor-pointer gap-2 rounded-xl px-3 text-sm">
                        <MessageSquare aria-hidden /> {item.label}
                        {showCommentCount && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{commentCount}</span>}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={item.id} onSelect={handleLogout} className="min-h-11 cursor-pointer gap-2 rounded-xl px-3 text-sm text-red-700 focus:bg-red-50 focus:text-red-800">
                        <LogOut aria-hidden /> {item.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/login"
                className={`hidden h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-900/5 hover:text-slate-950 motion-reduce:transition-none md:inline-flex ${FOCUS}`}
              >
                Sign in
              </Link>
            )}

            <button
              ref={menuButtonRef}
              type="button"
              onClick={openSheet}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-controls={sheetOpen ? sheetId : undefined}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 motion-reduce:transition-none md:hidden ${FOCUS}`}
            >
              <Menu size={22} aria-hidden />
              {signedIn && showCommentCount && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-600" />}
            </button>
          </div>
        </nav>
      </header>

      {sheetOpen && (
        <div
          ref={sheetRef}
          id={sheetId}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onKeyDown={trapTab}
          className="fixed inset-0 z-(--z-nav-sheet) flex flex-col bg-white pt-[env(safe-area-inset-top)] animate-in fade-in-0 slide-in-from-top-3 duration-200 motion-reduce:animate-none"
        >
          <div className="flex h-[76px] shrink-0 items-center justify-between px-4">
            <Link href="/" onClick={closeSheet} className={`flex min-h-11 min-w-0 items-center gap-3 rounded-full ${FOCUS}`} aria-label={`${displayTitle} home`}>
              <img src={displayLogo} alt="" className="h-10 w-auto shrink-0 rounded-xl object-contain" />
              <span className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">{displayTitle}</span>
            </Link>
            <button
              ref={closeRef}
              type="button"
              onClick={closeSheet}
              aria-label="Close menu"
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-900 transition-colors hover:bg-slate-200 motion-reduce:transition-none ${FOCUS}`}
            >
              <X size={22} aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <nav aria-label="Menu links">
              <ul className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => {
                  const isActive = activeHref === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={closeSheet}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex min-h-14 items-center rounded-2xl px-4 text-xl font-semibold ${FOCUS} ${isActive ? "bg-emerald-600/10 text-emerald-800" : "text-slate-800 hover:bg-slate-100"}`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="mt-4 border-t border-slate-200 pt-4">
              {signedIn && user ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">{initials || <UserIcon size={18} aria-hidden />}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold text-slate-900">{user.name}</span>
                      {user.email && <span className="block truncate text-sm text-slate-600">{user.email}</span>}
                    </span>
                  </div>
                  {items.map((item) =>
                    item.id === "admin" ? (
                      <Link key={item.id} href={item.href ?? "/admin/products"} onClick={closeSheet} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-base font-semibold text-slate-800 hover:bg-slate-100 ${FOCUS}`}>
                        <LayoutDashboard size={20} aria-hidden /> {item.label}
                      </Link>
                    ) : item.id === "comments" ? (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          closeSheet();
                          openComments();
                        }}
                        className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-base font-semibold text-slate-800 hover:bg-slate-100 ${FOCUS}`}
                      >
                        <MessageSquare size={20} aria-hidden /> {item.label}
                        {showCommentCount && <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{commentCount}</span>}
                      </button>
                    ) : (
                      <button key={item.id} type="button" onClick={handleLogout} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-base font-semibold text-red-700 hover:bg-red-50 ${FOCUS}`}>
                        <LogOut size={20} aria-hidden /> {item.label}
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/login" onClick={closeSheet} className={`flex min-h-14 items-center justify-center rounded-2xl border border-slate-300 text-base font-semibold text-slate-900 hover:bg-slate-100 ${FOCUS}`}>
                    Sign in
                  </Link>
                  <Link href="/register" onClick={closeSheet} className={`flex min-h-14 items-center justify-center rounded-2xl border border-emerald-600 text-base font-semibold text-emerald-800 hover:bg-emerald-50 ${FOCUS}`}>
                    Create account
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1 border-t border-slate-200 pt-4">
              <a href={`tel:${displayPhone.replace(/[^+\d]/g, "")}`} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-base text-slate-800 hover:bg-slate-100 ${FOCUS}`}>
                <Phone size={20} aria-hidden className="shrink-0 text-emerald-700" />
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Phone</span>
                  <span className="block font-semibold">{displayPhone}</span>
                </span>
              </a>
              {settings.emailAddress && (
                <a href={`mailto:${settings.emailAddress}`} className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-base text-slate-800 hover:bg-slate-100 ${FOCUS}`}>
                  <Mail size={20} aria-hidden className="shrink-0 text-emerald-700" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Email</span>
                    <span className="block truncate font-semibold">{settings.emailAddress}</span>
                  </span>
                </a>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => {
                closeSheet();
                openAssessment();
              }}
              className={`inline-flex h-14 w-full items-center justify-center rounded-[12px] bg-orange-300 px-6 text-base font-semibold text-slate-950 shadow-sm transition-colors hover:bg-orange-200 motion-reduce:transition-none ${FOCUS}`}
            >
              {applyText}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
