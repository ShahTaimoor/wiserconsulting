"use client";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavItem, NavMain } from "@/components/shadcn-space/blocks/sidebar-06/nav-main";
import { PieChart, CircleUserRound, ClipboardList, Notebook, ExternalLink, Mail, Settings, BadgeCheck, MessageSquareQuote, Plane } from "lucide-react";
import { useTouristVisaAvailability } from "@/hooks/useTouristVisaOpen";

export const navData: NavItem[] = [
  // Admin Section
  { label: "Admin Panel", isSection: true },
  { title: "Users", icon: CircleUserRound, href: "/admin/users" },
  { title: "Form Submissions", icon: ClipboardList, href: "/admin/products" },
  { title: "Contact Submissions", icon: Mail, href: "/admin/contacts" },
  { title: "Approved Visas", icon: BadgeCheck, href: "/admin/approved-visas" },
  { title: "Client Testimonials", icon: MessageSquareQuote, href: "/admin/testimonials" },
  { title: "Merge PDFs", icon: Notebook, href: "/admin/orders" },
  { title: "Settings", icon: Settings, href: "/admin/settings" },

  // Dashboards Section (Placeholders for design)
  { label: "Dashboards", isSection: true },
  { title: "Analytics", icon: PieChart, href: "/admin/analytics" },

  // External Links
  { label: "Website", isSection: true },
  { title: "Switch to Website", icon: ExternalLink, href: "/" },
];

// The Tourist Visa entry is only there while the Tourist Visa feature is open: the server says so (its TOURIST_VISA_ENABLED switch)
// AND this build's own hold passes. While the answer is not known, and when it is closed, there is no entry.
const touristVisaItem: NavItem = { title: "Tourist Visa", icon: Plane, href: "/admin/tourist-visa" };

function itemsForSidebar(touristVisaOpen: boolean): NavItem[] {
  if (!touristVisaOpen) return navData;
  const at = navData.findIndex((item) => item.href === "/admin/contacts");
  return [...navData.slice(0, at + 1), touristVisaItem, ...navData.slice(at + 1)];
}

export function AppSidebar() {
  const items = itemsForSidebar(useTouristVisaAvailability() === "open");
  return (
    <Sidebar variant="floating" className="p-4 h-full [&_[data-slot=sidebar-inner]]:h-full">
      <div className="flex flex-col gap-6 overflow-hidden">
        {/* ---------------- Content ---------------- */}
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-4 pt-4">
              <NavMain items={items} />
            </div>
          </ScrollArea>
        </SidebarContent>
      </div>
    </Sidebar>
  );
}
