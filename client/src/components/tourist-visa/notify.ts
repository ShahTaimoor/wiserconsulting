import type { CSSProperties } from "react";
import { toast } from "sonner";

/**
 * Toasts for the Tourist Visa pages. The <Toaster /> is mounted once for the whole site
 * (app/Providers.tsx), so a toast shown just before navigating to the next section stays on screen.
 *
 * Only ever pass fixed wording or a section title here, never anything the applicant typed.
 */

// The site's Toaster is always in its light theme. These variables make a toast follow the page
// tokens instead, so it is dark when the page is.
const THEMED: CSSProperties = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
} as CSSProperties;

// A fixed id means pressing Save again replaces the toast instead of stacking another.
const SAVE_TOAST_ID = "tourist-visa-save";

export function notifySaved(sectionTitle: string) {
  toast.success("Section saved", { id: SAVE_TOAST_ID, description: sectionTitle, duration: 3500, style: THEMED });
}

export function notifySaveFailed(message: string) {
  toast.error(message, { id: SAVE_TOAST_ID, duration: 6000, style: THEMED });
}
