"use client";

import type { LeaveDialogProps } from "@/hooks/useUnsavedChangesGuard";
import { UNSAVED_CHANGES_DIALOG } from "@/utils/navigationGuard";
import { ConfirmDialog } from "./ConfirmDialog";

/** The "you have unsaved changes" question. Spread the `leaveDialog` that useUnsavedChangesGuard returns into it. */
export function UnsavedChangesDialog({ open, onStay, onLeave, onCloseAutoFocus }: LeaveDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={UNSAVED_CHANGES_DIALOG.title}
      description={UNSAVED_CHANGES_DIALOG.description}
      cancelLabel={UNSAVED_CHANGES_DIALOG.stayLabel}
      confirmLabel={UNSAVED_CHANGES_DIALOG.leaveLabel}
      tone="destructive"
      onCancel={onStay}
      onConfirm={onLeave}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}
