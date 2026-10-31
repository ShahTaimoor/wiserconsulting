import type { Review } from "../shared/tourist-visa/view.js";

/** The statuses an administrator sees. A draft is never one of them. */
export type AdminStatus = "submitted" | "in_review" | "completed";

export interface AdminListItem {
  id: string;
  reference: string | null;
  name: string;
  email: string;
  phone: string;
  submittedAt: string | null;
  status: AdminStatus;
  documentCount: number;
}

export interface AdminList {
  applications: AdminListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminListQuery {
  q?: string;
  status?: AdminStatus | "";
  page?: number;
  pageSize?: number;
}

/** Who to call, and on what number, at the top of the Overview. */
export interface CallBlock {
  name: string;
  phone: { display: string; tel: string };
  email: string;
  preferredLanguage: string;
  contact: Array<{ id: string; label: string; value: string }>;
  reference: string | null;
  submittedAt: string | null;
  status: AdminStatus;
}

/** A file of the application: a name and a size, and the id to ask for a link with. Never a link or a storage id. */
export interface AdminFile {
  id: string;
  slot: string;
  name: string;
  size: number;
  type: string;
}

export interface AdminOverview {
  application: { id: string; reference: string | null; status: AdminStatus; submittedAt: string | null; configVersion: string; allowedMoves: AdminStatus[] };
  call: CallBlock;
  review: Review;
  documents: AdminFile[];
  /** Question id of each file question -> its slot, so a row of files can be matched to its documents. */
  fileSlots: Record<string, string>;
}

export type AuditAction = "list_view" | "overview_view" | "document_link" | "status_change";

export interface ActivityRow {
  id: string;
  action: AuditAction;
  at: string;
  admin: { id: string; name: string };
  fromStatus?: AdminStatus;
  toStatus?: AdminStatus;
}
