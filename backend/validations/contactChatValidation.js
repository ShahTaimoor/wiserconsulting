/**
 * Contact chat request schemas (Zod). The bodies are STRICT: a key a schema does not name (a "user", "conversation", "sender" or "status"
 * that a caller makes up) is refused with a 400, so nothing but the named fields can reach the service.
 *
 * These schemas check the SHAPE only (right type, a sane upper size, the id formats). The text itself is cleaned, counted and checked by
 * the service, which answers with the chat's own error codes (MESSAGE_EMPTY, MESSAGE_TOO_LONG, INVALID_PHONE, ...).
 */

const { z } = require('zod');
const { CHAT } = require('../config/contactChat');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientMessageId = z.string().regex(UUID, 'clientMessageId must be a UUID');
const seq = z.coerce.number().int().min(0).max(1_000_000_000);
const limit = (max) => z.coerce.number().int().min(1).max(max);

const sendClientMessageSchema = z.object({
  body: z.strictObject({
    body: z.string().max(CHAT.MAX_RAW_MESSAGE, 'MESSAGE_TOO_LONG'),
    clientMessageId,
    subject: z.string().max(CHAT.MAX_SUBJECT * 4, 'SUBJECT_TOO_LONG').optional(),
    phone: z.string().max(CHAT.MAX_PHONE * 4, 'INVALID_PHONE').optional(),
  }),
});

const sendStaffMessageSchema = z.object({
  body: z.strictObject({
    body: z.string().max(CHAT.MAX_RAW_MESSAGE, 'MESSAGE_TOO_LONG'),
    clientMessageId,
  }),
});

const readSchema = z.object({ body: z.strictObject({ upToSeq: seq }) });

const messagesQuerySchema = z.object({
  query: z.object({ after: seq.optional(), before: seq.optional(), limit: limit(CHAT.MAX_PAGE_SIZE).optional() }).strict(),
});

const inboxQuerySchema = z.object({
  query: z
    .object({
      status: z.enum(['open', 'answered', 'closed', 'all']).optional(),
      unread: z.enum(['1', 'true']).optional(),
      q: z.string().max(CHAT.SEARCH_MAX * 3).optional(),
      page: z.coerce.number().int().min(1).max(100000).optional(),
      limit: limit(CHAT.MAX_INBOX_PAGE_SIZE).optional(),
    })
    .strict(),
});

const statusChangeSchema = z.object({ body: z.strictObject({ status: z.enum(['open', 'closed']) }) });

module.exports = {
  sendClientMessageSchema,
  sendStaffMessageSchema,
  readSchema,
  messagesQuerySchema,
  inboxQuerySchema,
  statusChangeSchema,
};
