import type { AdminStatus } from "@/services/touristVisaAdminTypes";
import { statusLabel } from "@/utils/touristVisaAdmin";

const BADGE: Record<AdminStatus, string> = {
  submitted: "bg-sky-100 text-sky-900 ring-sky-600/30 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
  in_review: "bg-amber-100 text-amber-900 ring-amber-600/30 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  completed: "bg-emerald-100 text-emerald-900 ring-emerald-600/30 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
};

/** The status of an application as a small coloured label. The words carry the meaning; the colour only helps. */
export function AdminStatusBadge({ status }: { status: AdminStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE[status] ?? BADGE.submitted}`}>
      {statusLabel(status)}
    </span>
  );
}
