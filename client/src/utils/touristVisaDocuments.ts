/**
 * Plain functions for the documents page (section 10D): what to say about a refused file, the check the
 * browser makes before sending one, and how a file or the whole section is described.
 *
 * The browser's check is only a courtesy that saves a wasted upload. The server looks at the file's real
 * content and enforces every limit, and its answer always wins. The limits themselves are never written
 * here: they come from the server (GET /applications/me/documents).
 *
 * Type-only imports, so these can be unit tested with `node --test`.
 */

import type { DocumentLimits, TouristVisaDocument } from "@/services/touristVisaService";

/** The codes the server's document routes answer with (backend/config/touristVisaDocuments.js). */
export type DocumentErrorCode =
  | "FILE_REQUIRED"
  | "FILE_EMPTY"
  | "INVALID_SLOT"
  | "INVALID_UPLOAD"
  | "WRONG_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "TOTAL_TOO_LARGE"
  | "DOCUMENTS_LOCKED"
  | "DOCUMENT_NOT_FOUND"
  | "APPLICATION_NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  | "UPLOAD_FAILED"
  | "TOO_MANY_UPLOADS";

export const DOCUMENT_ERROR_CODES: readonly DocumentErrorCode[] = [
  "FILE_REQUIRED",
  "FILE_EMPTY",
  "INVALID_SLOT",
  "INVALID_UPLOAD",
  "WRONG_TYPE",
  "FILE_TOO_LARGE",
  "TOO_MANY_FILES",
  "TOTAL_TOO_LARGE",
  "DOCUMENTS_LOCKED",
  "DOCUMENT_NOT_FOUND",
  "APPLICATION_NOT_FOUND",
  "STORAGE_UNAVAILABLE",
  "UPLOAD_FAILED",
  "TOO_MANY_UPLOADS",
];

const KB = 1024;
const MB = 1024 * 1024;

/** 1536 -> "1.5 KB", 4194304 -> "4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < KB) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (bytes < MB) return `${trim(bytes / KB)} KB`;
  return `${trim(bytes / MB)} MB`;
}

const TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

/** "application/pdf" -> "PDF". Anything else is shown as "File". */
export function typeLabel(mime: string): string {
  return TYPE_LABELS[mime] ?? "File";
}

/** "PDF, JPG or PNG" for the types the server accepts. */
export function allowedTypesText(limits: Pick<DocumentLimits, "allowedTypes"> | null): string {
  const labels = (limits?.allowedTypes ?? Object.keys(TYPE_LABELS)).map(typeLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/** The text of a refusal. The numbers come from the limits when they are known. */
export function documentErrorMessage(
  code: string | undefined,
  options: { limits?: DocumentLimits | null; slot?: string; status?: number } = {}
): string {
  const { limits, slot, status } = options;
  switch (code) {
    case "FILE_REQUIRED":
      return "Choose a file to upload.";
    case "FILE_EMPTY":
      return "That file is empty. Please choose a different file.";
    case "INVALID_SLOT":
      return "We couldn't tell where this file belongs. Please reload the page and try again.";
    case "INVALID_UPLOAD":
      return "We couldn't read that upload. Please try again.";
    case "WRONG_TYPE":
      return `Only ${allowedTypesText(limits ?? null)} files can be uploaded.`;
    case "FILE_TOO_LARGE":
      return limits ? `That file is too large. Each file can be up to ${formatBytes(limits.maxFileBytes)}.` : "That file is too large.";
    case "TOO_MANY_FILES": {
      const max = slot ? limits?.slots[slot]?.max : undefined;
      return max ? `You have already uploaded the most files allowed here (${max}). Remove one to add another.` : "You have already uploaded the most files allowed here. Remove one to add another.";
    }
    case "TOTAL_TOO_LARGE":
      return limits ? `Your files together are too large. All files together can be up to ${formatBytes(limits.maxTotalBytes)}.` : "Your files together are too large.";
    case "DOCUMENTS_LOCKED":
      return "This application has been submitted, so its files can no longer be changed.";
    case "DOCUMENT_NOT_FOUND":
      return "That file was already removed.";
    case "APPLICATION_NOT_FOUND":
      return "Start your application before uploading files.";
    case "STORAGE_UNAVAILABLE":
      return "File storage isn't available right now. This is a problem on our side, not with your file. Please try again later.";
    case "UPLOAD_FAILED":
      return "That file couldn't be stored. Please try again.";
    case "TOO_MANY_UPLOADS":
      return "You've uploaded a lot of files in a short time. Please wait a few minutes and try again.";
    default:
      if (status === 0) return "We couldn't reach the server. Check your internet connection and try again.";
      if (status === 429) return "Too many requests. Please wait a few minutes and try again.";
      if (typeof status === "number" && status >= 500) return "Something went wrong on our side. Please try again in a moment.";
      return "Something went wrong. Please try again.";
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** What the browser can tell about a file before sending it. */
export interface PickedFile {
  name: string;
  size: number;
  /** The type the browser reports; it can be empty, and anyone can rename a file. */
  type: string;
}

/**
 * Would the server obviously refuse this file? Returns its error code, or null when nothing is wrong that
 * the browser can see. The same order as the server (empty, too large, wrong type, no room), and the
 * message comes from documentErrorMessage, so a refusal reads the same wherever it is caught.
 * The type is judged from what the browser reports, or from the extension when it reports nothing; the
 * server then looks at the file's real content.
 */
export function preCheckFile(
  file: PickedFile,
  slot: string,
  limits: DocumentLimits,
  existing: Pick<TouristVisaDocument, "slot" | "size">[]
): DocumentErrorCode | null {
  if (file.size === 0) return "FILE_EMPTY";
  if (file.size > limits.maxFileBytes) return "FILE_TOO_LARGE";

  const reported = file.type.trim().toLowerCase();
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  const guessed = reported === "" || reported === "application/octet-stream" ? EXTENSION_TYPES[extension] : reported;
  if (!guessed || !limits.allowedTypes.includes(guessed)) return "WRONG_TYPE";

  const max = limits.slots[slot]?.max;
  if (max === undefined) return "INVALID_SLOT";
  if (existing.filter((d) => d.slot === slot).length >= max) return "TOO_MANY_FILES";
  if (existing.reduce((sum, d) => sum + d.size, 0) + file.size > limits.maxTotalBytes) return "TOTAL_TOO_LARGE";
  return null;
}

/** The value for the file picker's `accept` attribute: the accepted types and their extensions. */
export function acceptAttribute(limits: Pick<DocumentLimits, "allowedTypes"> | null): string {
  const types = limits?.allowedTypes ?? Object.keys(TYPE_LABELS);
  const extensions = Object.entries(EXTENSION_TYPES)
    .filter(([, mime]) => types.includes(mime))
    .map(([ext]) => `.${ext}`);
  return [...types, ...extensions].join(",");
}

/** When a file was uploaded, for the list. */
export function formatUploadedAt(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
