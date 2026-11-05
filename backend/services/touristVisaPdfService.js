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
const { buildReview } = require('../shared/tourist-visa/view');
const { buildHeaderRows, buildAnswersModel, unprintableSection, renderAnswersPdf } = require('../utils/touristVisaAnswersPdf');
const { FILE_SUFFIX } = require('../config/touristVisaPdf');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const fail = (status, code, message, details) => new AppError(message, status, code, details);

/** "TV-X42GYXPS-application-summary.pdf": built only from the reference (never from a name). */
function fileNameFor(reference, type) {
  const safe = typeof reference === 'string' && /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(reference) ? `${reference}-` : '';
  return `${safe}${FILE_SUFFIX[type]}.pdf`;
}

class TouristVisaPdfService {
  constructor({ applications = defaultApplications, admin = defaultAdmin, audit = defaultAudit, now = () => new Date(), render = renderAnswersPdf } = {}) {
    this.applications = applications;
    this.admin = admin;
    this.audit = audit;
    this.now = now;
    this.render = render;
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

    let buffer;
    try {
      buffer = await this.render(model);
    } catch (error) {
      if (error && error.code === 'PDF_TOO_LARGE') throw fail(422, 'PDF_TOO_LARGE', 'This application is too long to print as one PDF. Please contact support.');
      // Nothing of the answers or the error's text is logged: the id of the application and a fixed word.
      logger.error('Tourist Visa PDF could not be made', { applicationId: String(application._id) });
      throw fail(500, 'PDF_FAILED', 'The PDF could not be made. Please try again, or contact support.');
    }
    return { buffer, filename: fileNameFor(application.reference, 'answers') };
  }
}

module.exports = new TouristVisaPdfService();
module.exports.TouristVisaPdfService = TouristVisaPdfService;
module.exports.fileNameFor = fileNameFor;
