"use client";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavItem, NavMain } from "@/components/shadcn-space/blocks/sidebar-06/nav-main";
import { PieChart, CircleUserRound, ClipboardList, Notebook, ExternalLink } from "lucide-react";

export const navData: NavItem[] = [
  // Admin Section
  { label: "Admin Panel", isSection: true },
  { title: "Users", icon: CircleUserRound, href: "/admin/users" },
  { title: "Form Submissions", icon: ClipboardList, href: "/admin/products" },
  { title: "Merge PDFs", icon: Notebook, href: "/admin/orders" },

  // Dashboards Section (Placeholders for design)
  { label: "Dashboards", isSection: true },
  { title: "Analytics", icon: PieChart, href: "/admin/analytics" },

  // External Links
  { label: "Website", isSection: true },
  { title: "Switch to Website", icon: ExternalLink, href: "/" },
];

export function AppSidebar() {
  return (
    <Sidebar variant="floating" className="p-4 h-full [&_[data-slot=sidebar-inner]]:h-full">
      <div className="flex flex-col gap-6 overflow-hidden">
        {/* ---------------- Content ---------------- */}
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-4 pt-4">
              <NavMain items={navData} />
            </div>
          </ScrollArea>
        </SidebarContent>
      </div>
    </Sidebar>
  );
}
