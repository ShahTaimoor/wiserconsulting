// Canonical source: shared/tourist-visa/. Do not edit the copies; run
// `node scripts/sync-shared.js` after changing the canonical files.

export const MAX_NAME_LENGTH: number;
export const SLOT_FILE_LABELS: Readonly<Record<string, string>>;
export const FALLBACK_LABEL: string;
export const DOCUMENT_EXTENSIONS: ReadonlyArray<string>;
/** A person's name as a part of a file name (Latin letters, digits and hyphens only; "" when nothing is left). */
export function safeNamePart(fullName: unknown): string;
/** The short label of a slot for a file name ("Bank-Statement"); "Document" for an unknown slot. */
export function slotFileLabel(slot: unknown): string;
export interface NamedDocument {
  id: string;
  slot: string;
  format?: string;
  mime?: string;
  type?: string;
  uploadedAt?: string | number | Date;
  originalName?: string;
  name?: string;
}
/** The lower-case extension of a file ("pdf"), "" when unknown. */
export function extensionOf(doc: Partial<NamedDocument> | null | undefined): string;
/** { documentId: "Roohullah-Shah-Passport.pdf" } for every file of one application. Never reads the file's content. */
export function documentFileNames(input: { documents?: ReadonlyArray<NamedDocument>; name?: string; reference?: string }): Record<string, string>;
