"use client";

import type { LeaveDialogProps } from "@/hooks/useUnsavedChangesGuard";
import { UNSAVED_CHANGES_DIALOG } from "@/utils/navigationGuard";
import { ConfirmDialog } from "./ConfirmDialog";

/** Other wording for the same question, for example when a file is still uploading. */
export interface LeaveDialogWording {
  title?: string;
  description?: string;
  stayLabel?: string;
  leaveLabel?: string;
}

/**
 * The "you have unsaved changes" question. Spread the `leaveDialog` that useUnsavedChangesGuard returns into it.
 * The wording can be replaced, for a page whose reason for asking is not unsaved answers.
 */
export function UnsavedChangesDialog({ open, onStay, onLeave, onCloseAutoFocus, title, description, stayLabel, leaveLabel }: LeaveDialogProps & LeaveDialogWording) {
  return (
    <ConfirmDialog
      open={open}
      title={title ?? UNSAVED_CHANGES_DIALOG.title}
      description={description ?? UNSAVED_CHANGES_DIALOG.description}
      cancelLabel={stayLabel ?? UNSAVED_CHANGES_DIALOG.stayLabel}
      confirmLabel={leaveLabel ?? UNSAVED_CHANGES_DIALOG.leaveLabel}
      tone="destructive"
      onCancel={onStay}
      onConfirm={onLeave}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}
