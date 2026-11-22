/**
 * Makes text safe to put inside an HTML e-mail: what a visitor typed (name, message, a file name, an admin comment) is shown as text,
 * never read as tags. Without it, a contact form message such as <a href="https://evil">Pay here</a> arrives in the administrator's
 * mailbox as a real link.
 */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

module.exports = escapeHtml;
