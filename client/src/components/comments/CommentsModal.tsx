"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileCheck2, Loader2, Send, Upload, X } from "lucide-react";
import type { AdminComment, FormSubmission } from "@/redux/slices/formSubmission/formSubmissionService";
import { sendCustomerText, sendCustomerVoice } from "@/services/voiceService";
import { VoicePlayer } from "@/components/voice/VoicePlayer";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  submission: FormSubmission | null;
  adminComments: AdminComment[];
  reuploadFiles: { [docId: string]: File };
  reuploadingDocId: string | null;
  onReuploadFile: (docId: string, file: File) => void;
  onReuploadSubmit: (docId: string) => void;
  onPreviewImage: (url: string) => void;
  /** Called after a reply (text or voice) was sent, so the lists are loaded again. */
  onReplySent: () => void;
};

const CELL = "border border-slate-200 px-3 py-2 align-top";
const HEAD = `${CELL} bg-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-600`;
const dateText = (value: string) => new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/** The customer's comments window: the team's comments per document and the customer's own replies, as two spreadsheet-like tables. */
export function CommentsModal({ isOpen, onClose, submission, adminComments, reuploadFiles, reuploadingDocId, onReuploadFile, onReuploadSubmit, onPreviewImage, onReplySent }: Props) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One group per document that still exists, in the order the first comment arrived.
  const groups = useMemo(() => {
    const byDocument = new Map<string, AdminComment[]>();
    for (const comment of adminComments) {
      if (!submission?.documents.some((d) => d._id === comment.documentId)) continue;
      byDocument.set(comment.documentId, [...(byDocument.get(comment.documentId) ?? []), comment]);
    }
    return Array.from(byDocument.entries()).map(([documentId, comments]) => ({
      documentId,
      document: submission!.documents.find((d) => d._id === documentId)!,
      comments,
    }));
  }, [adminComments, submission]);

  const replies = submission?.customerComments ?? [];
  let rowNumber = 0;

  const sendText = async () => {
    if (!submission || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendCustomerText(submission._id, reply.trim());
      setReply("");
      onReplySent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your reply could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const sendVoice = async (blob: Blob, seconds: number) => {
    if (!submission) throw new Error("Nothing to reply to yet.");
    await sendCustomerVoice(submission._id, blob, seconds);
    onReplySent();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-6 py-4 text-white">
              <div>
                <h3 className="text-lg font-semibold">Comments</h3>
                <p className="mt-1 text-sm text-slate-300">Feedback on your documents, and your replies to our team</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close comments" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-8 overflow-y-auto p-6">
              {/* From our team */}
              <section>
                <h4 className="mb-2 text-sm font-bold text-slate-800">From our team</h4>
                {groups.length === 0 ? (
                  <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 py-10 text-center">
                    <FileCheck2 className="mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-slate-500">No comments yet.</p>
                    <p className="mt-1 text-sm text-slate-400">Check back later for updates</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-sm">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={`${HEAD} w-12 text-center`}>#</th>
                          <th className={`${HEAD} w-[26%]`}>Document</th>
                          <th className={`${HEAD} w-28`}>Date</th>
                          <th className={HEAD}>Comment</th>
                          <th className={`${HEAD} w-[150px] text-center`}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map(({ documentId, document, comments }) =>
                          comments.map((c, index) => {
                            rowNumber += 1;
                            const isImage = document.mimetype.startsWith("image/");
                            return (
                              <tr key={c._id ?? `${documentId}-${index}`} className={rowNumber % 2 ? "bg-white" : "bg-slate-50/60"}>
                                <td className={`${CELL} bg-slate-100 text-center text-xs font-medium text-slate-500`}>{rowNumber}</td>
                                {index === 0 && (
                                  <td rowSpan={comments.length} className={`${CELL} bg-white`}>
                                    <div className="flex items-center gap-2">
                                      {document.cloudinaryUrl && (
                                        <div
                                          onClick={() => isImage && onPreviewImage(document.cloudinaryUrl!)}
                                          className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${isImage ? "cursor-zoom-in" : ""}`}
                                        >
                                          {isImage ? (
                                            <Image src={document.cloudinaryUrl} alt={document.originalname} fill className="object-cover" unoptimized />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center"><FileCheck2 className="h-5 w-5 text-slate-400" /></div>
                                          )}
                                        </div>
                                      )}
                                      <span className="break-all text-xs font-semibold text-slate-800">{document.originalname}</span>
                                    </div>
                                  </td>
                                )}
                                <td className={`${CELL} whitespace-nowrap text-xs text-slate-500`}>{dateText(c.createdAt)}</td>
                                <td className={CELL}>
                                  {c.voiceRef && c._id && submission ? (
                                    <VoicePlayer submissionId={submission._id} kind="admin" commentId={c._id} seconds={c.voiceSeconds} />
                                  ) : (
                                    <p className="break-words text-slate-800">{c.comment}</p>
                                  )}
                                </td>
                                {index === 0 && (
                                  <td rowSpan={comments.length} className={`${CELL} bg-white text-center`}>
                                    <input
                                      type="file"
                                      id={`reupload-${documentId}`}
                                      className="hidden"
                                      accept="image/*,.pdf,.doc,.docx"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) onReuploadFile(documentId, file);
                                      }}
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                      <label htmlFor={`reupload-${documentId}`} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50">
                                        <Upload className="h-3.5 w-3.5" />
                                        Re-upload
                                      </label>
                                      {reuploadFiles[documentId] && (
                                        <>
                                          <span className="max-w-[130px] truncate text-[11px] text-slate-500" title={reuploadFiles[documentId].name}>{reuploadFiles[documentId].name}</span>
                                          <button
                                            type="button"
                                            onClick={() => onReuploadSubmit(documentId)}
                                            disabled={reuploadingDocId === documentId}
                                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                          >
                                            {reuploadingDocId === documentId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {reuploadingDocId === documentId ? "Uploading..." : "Submit"}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* The customer's replies */}
              <section>
                <h4 className="mb-2 text-sm font-bold text-slate-800">Your replies</h4>
                <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-sm">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className={`${HEAD} w-12 text-center`}>#</th>
                        <th className={`${HEAD} w-28`}>Date</th>
                        <th className={HEAD}>Your message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replies.map((r, index) => (
                        <tr key={r._id ?? index} className={index % 2 ? "bg-slate-50/60" : "bg-white"}>
                          <td className={`${CELL} bg-slate-100 text-center text-xs font-medium text-slate-500`}>{index + 1}</td>
                          <td className={`${CELL} whitespace-nowrap text-xs text-slate-500`}>{dateText(r.createdAt)}</td>
                          <td className={CELL}>
                            {r.voiceRef && r._id && submission ? (
                              <VoicePlayer submissionId={submission._id} kind="customer" commentId={r._id} seconds={r.voiceSeconds} />
                            ) : (
                              <p className="break-words text-slate-800">{r.message}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* The row to write in */}
                      <tr className="bg-sky-50/40">
                        <td className={`${CELL} bg-slate-100 text-center text-xs font-medium text-slate-500`}>{replies.length + 1}</td>
                        <td className={`${CELL} whitespace-nowrap text-xs text-slate-400`}>New</td>
                        <td className={CELL}>
                          {submission ? (
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                <textarea
                                  value={reply}
                                  onChange={(e) => setReply(e.target.value)}
                                  rows={2}
                                  maxLength={1000}
                                  placeholder="Write a reply to our team..."
                                  className="min-h-[60px] w-full flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                                />
                                <button
                                  type="button"
                                  onClick={sendText}
                                  disabled={sending || !reply.trim()}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                  Send
                                </button>
                              </div>
                              <VoiceRecorder onSend={sendVoice} disabled={sending} />
                              {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Replies open after you have sent your documents.</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
