/**
 * The old Contact screens (/admin/contacts while the chat is off). Opening a message used to mark it read as a side effect of GET /api/contacts/:id;
 * the server no longer does that (reading changes nothing), so the old detail screen asks for it with PATCH /api/contacts/:id/read.
 */

/** Only a message that is still "new" needs the call; any other status (read, responded, archived) is left exactly as it is. */
export function needsMarkRead(status: unknown): boolean {
  return status === "new";
}
