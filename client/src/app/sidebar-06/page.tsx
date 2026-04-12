import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shadcn-space/blocks/sidebar-06/app-sidebar";

const Page = () => {
  return (
    <SidebarProvider className="p-4 bg-muted" style={{ "--sidebar-width": "300px" } as React.CSSProperties}>
      <AppSidebar />
      {/* ---------------- Main ---------------- */}
      <div className="flex flex-1 flex-col gap-4">
        <header className="flex h-14 shrink-0 items-center gap-2 rounded-xl bg-background px-4 shadow-sm">
          <SidebarTrigger className="cursor-pointer" />
        </header>
        <main className="flex-1 rounded-xl bg-background" />
      </div>
    </SidebarProvider>
  );
};

export default Page;

