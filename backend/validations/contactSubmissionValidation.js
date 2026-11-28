/**
 * Request schemas and the one list of statuses for the OLD contact-form submissions (/api/contacts). The statuses are the ones the model
 * stores (models/ContactSubmission.js); the service and the controller use this list too, so there is only one place to change.
 */

const { z } = require('zod');

const CONTACT_STATUSES = Object.freeze(['new', 'read', 'responded', 'archived']);

const isContactStatus = (value) => typeof value === 'string' && CONTACT_STATUSES.includes(value);

/** The words of the 400 for a status that is not one of the four (also used for a status that is not text at all). */
const INVALID_STATUS_MESSAGE = `Invalid status. Use one of: ${CONTACT_STATUSES.join(', ')}.`;

/** The longest search text the old list accepts (longer text is cut, as it always was). */
const SEARCH_MAX = 100;

// PATCH /:id/read: the id must look like a database id (24 hex characters); nothing is read from the body.
const markReadSchema = z.object({
  params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') }),
});

module.exports = { CONTACT_STATUSES, isContactStatus, INVALID_STATUS_MESSAGE, SEARCH_MAX, markReadSchema };
