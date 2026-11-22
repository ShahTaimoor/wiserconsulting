/**
 * Tourist Visa funds check: the staff-only panel about the bank statement figures (section 10F). Admin only.
 *
 * Nothing here is ever sent to an applicant. Reading it is audited (`funds_check_view`: the administrator, the application and the time, never a
 * figure). The panel is worked out by utils/touristVisaFundsCheck.js from the stored answers under the config the application was submitted
 * under (an older application has no such section and gets the grey "Not collected" badge). The exchange rates are the ones the currency helper
 * uses; when they cannot be read the pound figures are left out and the badge is grey.
 */

const defaultAudit = require('../repositories/touristVisaAuditRepository');
const defaultApplications = require('./touristVisaApplicationService');
const defaultAdmin = require('./touristVisaAdminService');
const defaultRates = require('./touristVisaRatesService');
const { buildFundsCheck } = require('../utils/touristVisaFundsCheck');
const logger = require('../utils/logger');

class TouristVisaFundsService {
  constructor({ audit = defaultAudit, applications = defaultApplications, admin = defaultAdmin, rates = defaultRates, now = () => new Date() } = {}) {
    this.audit = audit;
    this.applications = applications;
    this.admin = admin;
    this.rates = rates;
    this.now = now;
  }

  /** The panel for one submitted application. Audited as `funds_check_view`. */
  async view(adminId, id) {
    const application = await this.admin.load(id);
    await this.audit.append([{ adminId, applicationId: application._id, action: 'funds_check_view', at: this.now() }]);
    const cfg = await this.applications.configOf(application);
    let rates = null;
    try {
      rates = await this.rates.get();
    } catch (error) {
      // The rates are only for the pound figures: log that, never an answer.
      logger.warn('Tourist Visa funds check: the exchange rates were not available', { applicationId: String(application._id) });
    }
    return buildFundsCheck({ cfg, answers: application.answers || {}, rates });
  }
}

module.exports = new TouristVisaFundsService();
module.exports.TouristVisaFundsService = TouristVisaFundsService;
