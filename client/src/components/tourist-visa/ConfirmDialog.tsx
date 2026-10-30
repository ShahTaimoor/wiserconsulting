"use client";

import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** The safe choice. It is focused when the dialog opens, and Escape does the same thing. */
  cancelLabel: string;
  confirmLabel: string;
  /** "destructive" paints the confirm button red, for choices that throw something away. */
  tone?: "default" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A two-button question in the site's own style, to use instead of window.confirm.
 *
 * It is a controlled Radix AlertDialog, so the browser-level behaviour comes for free: focus
 * moves into the dialog and is trapped there, Escape cancels, the page behind is inert and
 * hidden from screen readers, and focus goes back to where it was when the dialog closes.
 * Clicking the dark backdrop does not close it, because an alert dialog needs an explicit answer.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  tone = "default",
  onCancel,
  onConfirm,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  // Radix reports "closed" for every way of closing, including the confirm button. Remember
  // that the confirm button was used so that it is not also treated as a cancel.
  const confirmed = useRef(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        onCancel();
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={tone === "destructive" ? "destructive" : "default"}
            // The theme's destructive colours do not give readable text: white on red in light, near-black on the lighter red in dark.
            className={tone === "destructive" ? "text-white dark:text-slate-950" : undefined}
            onClick={() => {
              confirmed.current = true;
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
