// Voice notes and written replies on comments. Every call carries the sign-in token: the server checks that the submission is the
// customer's own (or that the caller is an administrator).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export type VoiceKind = "admin" | "customer";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function readJson(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.message || "Something went wrong. Please try again.");
  return json;
}

// The file name only tells the server nothing: it looks at the content. The extension is for a person reading a log.
const extensionOf = (blob: Blob) => (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm");

function voiceForm(blob: Blob, seconds: number) {
  const form = new FormData();
  form.append("seconds", String(Math.max(0, Math.round(seconds))));
  form.append("voice", blob, `voice.${extensionOf(blob)}`);
  return form;
}

/** A short-lived link to listen to one voice note. */
export async function getVoiceUrl(submissionId: string, kind: VoiceKind, commentId: string): Promise<string> {
  const response = await fetch(`${API_URL}/form-submissions/${encodeURIComponent(submissionId)}/voice/${kind}/${encodeURIComponent(commentId)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  const json = await readJson(response);
  return json.data.url as string;
}

export async function sendCustomerVoice(submissionId: string, blob: Blob, seconds: number): Promise<void> {
  const response = await fetch(`${API_URL}/form-submissions/${encodeURIComponent(submissionId)}/customer-voice`, {
    method: "POST",
    headers: authHeaders(),
    body: voiceForm(blob, seconds),
  });
  await readJson(response);
}

export async function sendAdminVoice(submissionId: string, documentId: string, blob: Blob, seconds: number): Promise<void> {
  const response = await fetch(`${API_URL}/form-submissions/${encodeURIComponent(submissionId)}/documents/${encodeURIComponent(documentId)}/voice`, {
    method: "POST",
    headers: authHeaders(),
    body: voiceForm(blob, seconds),
  });
  await readJson(response);
}

export async function sendCustomerText(submissionId: string, message: string): Promise<void> {
  const response = await fetch(`${API_URL}/form-submissions/${encodeURIComponent(submissionId)}/customer-comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ message }),
  });
  await readJson(response);
}
