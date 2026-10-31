/**
 * The small summary kept on a submitted application so the admin list never has to decrypt or scan answers:
 * { name, email, phone }. It is worked out once, at submit (or the first time an older submitted application is
 * listed or opened), from answers that are stored as plain text anyway (2.1, 2.2, 2.4 and 2.32 are not
 * encrypted questions). A field with no answer is an empty text.
 */

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function summaryOf(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const name = [text(a.q2_1), text(a.q2_2)].filter(Boolean).join(' ');
  const email = text(a.q2_4).toLowerCase();
  const tel = a.q2_32 && typeof a.q2_32 === 'object' ? a.q2_32 : {};
  const phone = [text(tel.countryCode), text(tel.number)].filter(Boolean).join(' ');
  return { name, email, phone };
}

/** "+44 7700 900123" -> "+447700900123", for a tel: link. Anything that is not digits (after a leading +) is dropped. */
function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

module.exports = { summaryOf, telHref };
