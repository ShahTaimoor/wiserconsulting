/**
 * Tourist Visa "Your bank activity" (config 1.7.0): every setting in ONE place. None of these numbers is in questions.json or in the client.
 *
 *  - spikePercent: a month of the statement whose total credit (or debit) is more than this percent above the average of the period must be
 *    explained by the applicant ("Why was this month higher?").
 *  - singleTransactionPercent / singleTransactionFloor: the amount above which a single credit (debit) is asked about is this percent of the
 *    average monthly credit (debit), and never less than the floor, in PKR.
 *  - indicator: the thresholds of the STAFF-ONLY "Funds check" (backend only, never sent to an applicant): the closing balance, in pounds,
 *    against the planned spending.
 *
 * The values the form needs (the first three) reach the form through GET /api/tourist-visa/funds-settings; the indicator's never do.
 * Loading this module also hands the first three to the shared engine (engine.setSettings), which is how the server checks the explanations of
 * unusual months: every server module that validates or reads answers requires this file.
 */

const engine = require('../shared/tourist-visa/engine');

const FUNDS = Object.freeze({
  /** The statement's currency. */
  currency: 'PKR',
  spikePercent: 50,
  singleTransactionPercent: 25,
  singleTransactionFloor: 25000,
  indicator: Object.freeze({
    /** Red: the closing balance (in pounds) is below this percent of the planned spending. */
    redBelowPercent: 100,
    /** Amber: at or above the red line but below this percent. Green: at or above it. */
    greenAtOrAbovePercent: 120,
    /** A note (never a colour) when the closing balance is this percent or more below the opening balance. */
    largeNegativeChangePercent: 30,
  }),
});

/** What the form may know: the three numbers behind the explanations and the amounts it shows. Nothing of the indicator. */
function publicSettings() {
  return {
    currency: FUNDS.currency,
    spikePercent: FUNDS.spikePercent,
    singleTransactionPercent: FUNDS.singleTransactionPercent,
    singleTransactionFloor: FUNDS.singleTransactionFloor,
  };
}

/** What the shared engine reads by name. */
function engineSettings() {
  return {
    spikePercent: FUNDS.spikePercent,
    singleTransactionPercent: FUNDS.singleTransactionPercent,
    singleTransactionFloor: FUNDS.singleTransactionFloor,
  };
}

engine.setSettings(engineSettings());

module.exports = { FUNDS, publicSettings, engineSettings };
