"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavItem } from "@/components/shadcn-space/blocks/sidebar-06/nav-main";
import {
  ChartNoAxesCombined,
  FileCheck2,
  GraduationCap,
  Combine,
  Globe,
  MessagesSquare,
  PlaneTakeoff,
  Quote,
  ShieldCheck,
  SlidersHorizontal,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTouristVisaAvailability } from "@/hooks/useTouristVisaOpen";
import { useChatEnabled, useChatUnread } from "@/hooks/useChatAdmin";
import { UnreadBadge } from "@/components/admin/chat/UnreadBadge";
import { useSettings } from "@/context/SettingsContext";
import { useAppSelector } from "@/redux/hooks";

export const navData: NavItem[] = [
  // Admin Section
  { title: "Form Submissions", icon: FileCheck2, href: "/admin/products" },
  { title: "Contact Submissions", icon: MessagesSquare, href: "/admin/contacts" },
  { title: "Approved Visas", icon: ShieldCheck, href: "/admin/approved-visas" },
  { title: "Client Testimonials", icon: Quote, href: "/admin/testimonials" },
  { title: "Merge PDFs", icon: Combine, href: "/admin/orders" },
  { title: "University Finder", icon: GraduationCap, href: "/admin/universities" },

  // Dashboards Section
  { label: "", isSection: true }, // a divider, no heading
  { title: "Analytics", icon: ChartNoAxesCombined, href: "/admin/analytics" },

];

// Settings and the website link live in the account menu at the bottom of the sidebar.
const accountMenu: NavItem[] = [
  { title: "Settings", icon: SlidersHorizontal, href: "/admin/settings" },
  { title: "Switch to Website", icon: Globe, href: "/" },
];

// The Tourist Visa entry is only there while the Tourist Visa feature is open: the server says so (its TOURIST_VISA_ENABLED switch)
// AND this build's own hold passes. While the answer is not known, and when it is closed, there is no entry.
const touristVisaItem: NavItem = { title: "Tourist Visa", icon: PlaneTakeoff, href: "/admin/tourist-visa" };

function itemsForSidebar(touristVisaOpen: boolean): NavItem[] {
  if (!touristVisaOpen) return navData;
  const at = navData.findIndex((item) => item.href === "/admin/contacts");
  return [...navData.slice(0, at + 1), touristVisaItem, ...navData.slice(at + 1)];
}

/** The Contact item. While the chat is switched on it is called "Contact" and carries the yellow badge with the total of unread messages. */
const CONTACT_HREF = "/admin/contacts";

/** The page the visitor is on: the link whose address is the current one (or the start of it). The website link is never "current". */
function isCurrent(pathname: string | null, href?: string) {
  if (!pathname || !href || href === "/") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name?: string) {
  return (name || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppSidebar() {
  const items = itemsForSidebar(useTouristVisaAvailability() === "open");
  const chatOn = useChatEnabled() === "open";
  const chatUnread = useChatUnread(chatOn).unread; // one poller for the whole tab, every 30 seconds while the tab is visible
  const pathname = usePathname();
  const { settings } = useSettings();
  const user = useAppSelector((state) => state.auth.user);

  return (
    <Sidebar variant="floating" className="p-2 h-full [&_[data-slot=sidebar-inner]]:h-full">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo comes from storage */}
          <img src={settings.logoUrl || "/logo.png"} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-0.5" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-slate-900">{settings.websiteTitle || "Wiser Consulting"}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Admin panel</p>
          </div>
        </div>
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Links */}
        <SidebarContent className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <nav aria-label="Admin" className="px-3 pb-4 pt-4">
              {items.map((item, index) => {
                if (item.isSection && !item.label) {
                  return <div key={`divider-${index}`} className="mx-3 my-3 h-px bg-slate-200/80" />;
                }
                if (item.isSection) {
                  return (
                    <p key={item.label || index} className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 first:pt-1">
                      {item.label}
                    </p>
                  );
                }
                const Icon = item.icon;
                const current = isCurrent(pathname, item.href);
                return (
                  <Link
                    key={item.title}
                    href={item.href || "#"}
                    aria-current={current ? "page" : undefined}
                    className={`group mb-1 flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all ${
                      current
                        ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-600/25"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        current ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600"
                      }`}
                    >
                      {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2} />}
                    </span>
                    <span className="flex-1 truncate">{item.href === CONTACT_HREF && chatOn ? "Contact" : item.title}</span>
                    {item.href === CONTACT_HREF && chatOn && <UnreadBadge count={chatUnread} />}
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-all ${current ? "opacity-90" : "opacity-0 group-hover:translate-x-0.5 group-hover:opacity-60"}`} />
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </SidebarContent>

        {/* Signed-in account */}
        {user && (
          <div className="m-3 mt-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{initialsOf(user.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">Administrator</p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-xl p-1.5">
                {accountMenu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.title} asChild className="cursor-pointer gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 focus:bg-emerald-50 focus:text-emerald-700">
                      <Link href={item.href || "#"}>
                        {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2} />}
                        {item.title}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
