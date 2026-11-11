/**
 * Tourist Visa PDFs (step 8h-1: the application summary). Generated on demand, in memory, and never stored anywhere (not on disk, not in
 * Cloudinary, not in the database): the bytes go to the one response and are gone.
 *
 *  - The ADMINISTRATOR can have the PDF of any submitted or later application; the APPLICANT only of their own application once it is
 *    submitted (a draft is refused with a clear code). Decrypted values are only ever in the generated file.
 *  - It is built from the shared review builder over the config the application was SUBMITTED under, so it shows what the applicant and the
 *    admin Overview show: the answers, file names and sizes, and "Corrected by our team on <date>" (never an old value or a reason). No
 *    note, flag, change record or audit row is read at all.
 *  - If any text has a character the fonts cannot print, the whole PDF is REFUSED (422) with a message that names the section, before
 *    anything is recorded or drawn. The character itself is never in the message.
 *  - The export is written to the audit log (the document type and whether it was the admin or the applicant: ids and fixed words, never
 *    any content) BEFORE the file is made.
 *
 * The cover letter and the itinerary PDFs (step 8h-2) will be added here on the same foundation (utils/pdf/pdfBuilder.js), using the APPROVED
 * version of the text.
 */

const defaultApplications = require('./touristVisaApplicationService');
const defaultAdmin = require('./touristVisaAdminService');
const defaultAudit = require('../repositories/touristVisaAuditRepository');
const defaultLetters = require('../repositories/touristVisaCoverLetterRepository');
const defaultItineraries = require('../repositories/touristVisaItineraryRepository');
const defaultLetterService = require('./touristVisaCoverLetterService');
const defaultItineraryService = require('./touristVisaItineraryService');
const { buildItineraryFacts } = require('../shared/tourist-visa/itineraryFacts');
const { buildReview } = require('../shared/tourist-visa/view');
const { buildHeaderRows, buildAnswersModel, unprintableSection, renderAnswersPdf } = require('../utils/touristVisaAnswersPdf');
const { senderOf, letterDate, buildLetterModel, unprintableIn, renderCoverLetterPdf } = require('../utils/touristVisaCoverLetterPdf');
const itineraryPdf = require('../utils/touristVisaItineraryPdf');
const { FILE_SUFFIX } = require('../config/touristVisaPdf');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const fail = (status, code, message, details) => new AppError(message, status, code, details);

/** "TV-X42GYXPS-application-summary.pdf": built only from the reference (never from a name). A letter that is not approved ends "-draft". */
function fileNameFor(reference, type, { draft = false } = {}) {
  const safe = typeof reference === 'string' && /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(reference) ? `${reference}-` : '';
  return `${safe}${FILE_SUFFIX[type]}${draft ? '-draft' : ''}.pdf`;
}

class TouristVisaPdfService {
  constructor({ applications = defaultApplications, admin = defaultAdmin, audit = defaultAudit, letters = defaultLetters, itineraries = defaultItineraries, letterService = defaultLetterService, itineraryService = defaultItineraryService, now = () => new Date(), render = renderAnswersPdf, renderLetter = renderCoverLetterPdf, renderItinerary = itineraryPdf.renderItineraryPdf } = {}) {
    this.applications = applications;
    this.admin = admin;
    this.audit = audit;
    this.letters = letters;
    this.itineraries = itineraries;
    this.letterService = letterService;
    this.itineraryService = itineraryService;
    this.now = now;
    this.render = render;
    this.renderLetter = renderLetter;
    this.renderItinerary = renderItinerary;
  }

  /** The application summary of any submitted application, for an administrator. A draft or an unknown id is the same 404 as everywhere. */
  async answersForAdmin(adminId, id) {
    const application = await this.admin.load(id);
    return this.answers({ actorId: adminId, by: 'admin', application });
  }

  /** The application summary of the applicant's own application, once it is submitted. */
  async answersForApplicant(userId) {
    const application = await this.applications.repository.findLatestByApplicant(userId);
    if (!application) throw fail(404, 'APPLICATION_NOT_FOUND', 'You have not started a Tourist Visa application yet.');
    if (application.status === 'draft') throw fail(409, 'PDF_NOT_AVAILABLE', 'A copy of your application can be downloaded once it has been submitted.');
    return this.answers({ actorId: userId, by: 'applicant', application });
  }

  // -------------------------------------------------------------------------

  async answers({ actorId, by, application }) {
    const cfg = await this.applications.configOf(application);
    const answers = application.answers || {};
    const documents = (application.documents || []).map((doc) => ({ slot: doc.slot, name: doc.name || doc.originalName, size: doc.bytes !== undefined ? doc.bytes : doc.size }));
    const corrections = await this.applications.correctionMarks(application, cfg);
    const review = buildReview(cfg, answers, documents, application.declarations || {}, corrections);
    const header = buildHeaderRows({ cfg, answers, reference: application.reference, submittedAt: application.submittedAt });
    const model = buildAnswersModel({ review, header, reference: application.reference });

    // Refused before anything is recorded or drawn: a character the fonts cannot print would be a blank or a box on paper.
    const unprintable = unprintableSection(model);
    if (unprintable) {
      const where = unprintable.id === 'header' ? 'The application details at the top of the summary' : `The text in section ${unprintable.id} (${unprintable.title})`;
      throw fail(
        422,
        'PDF_UNSUPPORTED_CHARACTERS',
        `${where} has characters that the PDF cannot print, because it prints Latin letters only. Correct that answer and try again.`,
        { section: unprintable.id, sectionTitle: unprintable.title }
      );
    }

    await this.audit.append([{ adminId: actorId, applicationId: application._id, action: 'pdf_export', at: this.now(), pdfType: 'answers', pdfBy: by }]);

    const buffer = await this.draw(this.render, model, application, 'application');
    return { buffer, filename: fileNameFor(application.reference, 'answers') };
  }

  /**
   * The cover letter of any submitted, in-review or completed application, as a PDF, for an administrator only. It is the NEWEST version
   * of the letter: when that version is approved the letter is printed clean; when it is not, it is still printed, with a DRAFT watermark
   * and banner on every page and "-draft" in the file name, and the audit row says it was not approved. A version that WAS approved but whose answers have changed since is
   * treated the same way, with a banner that says the answers changed since approval, and the audit row also has pdfStale true (step 8j-3, A12).
   * No letter: 404 LETTER_NOT_FOUND.
   * The letter's words are never changed; the sender block (name and home address) comes from the answers and the date from the stored
   * version (the day it was written, or failing that the day it was approved).
   */
  async coverLetterForAdmin(adminId, id) {
    const application = await this.admin.load(id);
    const version = await this.letters.findLatestWithText(application._id);
    if (!version) throw fail(404, 'LETTER_NOT_FOUND', 'There is no cover letter to download yet. Write one first.');
    // An approved version whose answers have changed since is NOT printed as approved (step 8j-3, A12): same staleness check as the admin panel.
    const stale = version.status === 'approved' && (await this.letterService.isStale(application, version));
    const draft = version.status !== 'approved' || stale;
    const when = letterDate(version);
    const model = buildLetterModel({ text: version.text, reference: application.reference, sender: senderOf(application.answers), date: when ? when.date : null, draft, stale });

    // Refused before anything is recorded or drawn; the character itself is never in the message.
    const unprintable = unprintableIn(model);
    if (unprintable) {
      const message = unprintable === 'sender'
        ? "The applicant's name or address, printed at the top of the letter, has characters that the PDF cannot print, because it prints Latin letters only. Correct that answer and try again."
        : 'The text of the cover letter has characters that the PDF cannot print, because it prints Latin letters only. Edit the letter, save it as a new version and try again.';
      throw fail(422, 'PDF_UNSUPPORTED_CHARACTERS', message, { section: unprintable === 'sender' ? 'sender' : 'letter' });
    }

    await this.audit.append([{ adminId, applicationId: application._id, action: 'pdf_export', at: this.now(), pdfType: 'cover_letter', pdfBy: 'admin', version: version.version, pdfApproved: !draft, ...(stale ? { pdfStale: true } : {}) }]);

    const buffer = await this.draw(this.renderLetter, model, application, 'letter');
    return { buffer, filename: fileNameFor(application.reference, 'cover_letter', { draft }) };
  }

  /**
   * The itinerary of any submitted, in-review or completed application, as a PDF, for an administrator only: the same rules as the cover letter. It is
   * the NEWEST version; approved and current, it is printed clean; not approved, or approved but stale (the answers changed since), it is still printed with the DRAFT watermark and banner and "-draft" in the file
   * name. The itinerary's words are never changed. The grid of details at the top is taken from the answers (only the fields the data has).
   * No itinerary: 404 ITINERARY_NOT_FOUND.
   */
  async itineraryForAdmin(adminId, id) {
    const application = await this.admin.load(id);
    const version = await this.itineraries.findLatestWithText(application._id);
    if (!version) throw fail(404, 'ITINERARY_NOT_FOUND', 'There is no itinerary to download yet. Write one first.');
    // Same rule as the letter (step 8j-3, A12): an approved itinerary whose answers have changed since is printed as a draft.
    const stale = version.status === 'approved' && (await this.itineraryService.isStale(application, version));
    const draft = version.status !== 'approved' || stale;
    const sender = senderOf(application.answers);
    const model = itineraryPdf.buildItineraryModel({ text: version.text, reference: application.reference, applicantName: sender.name, details: await this.itineraryDetails(application, sender.name), draft, stale });

    // Refused before anything is recorded or drawn; the character itself is never in the message.
    const unprintable = itineraryPdf.unprintableIn(model);
    if (unprintable) {
      const message = unprintable === 'details'
        ? "The traveller's name or an answer shown in the details at the top of the itinerary has characters that the PDF cannot print, because it prints Latin letters only. Correct that answer and try again."
        : 'The text of the itinerary has characters that the PDF cannot print, because it prints Latin letters only. Edit the itinerary, save it as a new version and try again.';
      throw fail(422, 'PDF_UNSUPPORTED_CHARACTERS', message, { section: unprintable === 'details' ? 'details' : 'itinerary' });
    }

    await this.audit.append([{ adminId, applicationId: application._id, action: 'pdf_export', at: this.now(), pdfType: 'itinerary', pdfBy: 'admin', version: version.version, pdfApproved: !draft, ...(stale ? { pdfStale: true } : {}) }]);

    const buffer = await this.draw(this.renderItinerary, model, application, 'itinerary');
    return { buffer, filename: fileNameFor(application.reference, 'itinerary', { draft }) };
  }

  /** The grid of details: the facts the itinerary is built on (the answers, under the config the application was submitted under). Never fails the PDF. */
  async itineraryDetails(application, name) {
    try {
      const cfg = await this.applications.configOf(application);
      const facts = buildItineraryFacts(cfg, application.answers || {}, { submittedAt: application.submittedAt });
      return itineraryPdf.detailsOf(facts, name);
    } catch (error) {
      // Only the id of the application and a fixed word: never an answer.
      logger.error('Tourist Visa itinerary details could not be built', { applicationId: String(application._id) });
      return itineraryPdf.detailsOf(null, name);
    }
  }

  /** Draws the file. Nothing of the content or of the error's text is logged: the id of the application and a fixed word. */
  async draw(render, model, application, subject) {
    try {
      return await render(model);
    } catch (error) {
      if (error && error.code === 'PDF_TOO_LARGE') throw fail(422, 'PDF_TOO_LARGE', `This ${subject} is too long to print as one PDF. Please contact support.`);
      logger.error('Tourist Visa PDF could not be made', { applicationId: String(application._id) });
      throw fail(500, 'PDF_FAILED', 'The PDF could not be made. Please try again, or contact support.');
    }
  }
}

module.exports = new TouristVisaPdfService();
module.exports.TouristVisaPdfService = TouristVisaPdfService;
module.exports.fileNameFor = fileNameFor;
