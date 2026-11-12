/**
 * The page of a letter (steps 8h-2 and 8h-3): the generic designed-document page (documentBuilder.js) with the letter's own settings: margins
 * of 25 mm, the narrow brand edge on every page, and a continuation header that carries the sender's name. The draft banner and watermark, the
 * footer and the page-break behaviour are the document builder's and are the same for the itinerary.
 */

const { DocumentBuilder } = require('./documentBuilder');
const { LETTER_PAGE, TEXT } = require('../../config/touristVisaPdf');

class LetterBuilder extends DocumentBuilder {
  /**
   * @param {string}  options.reference     printed in the footer
   * @param {string}  options.applicantName printed in the continuation header
   * @param {boolean} options.draft         a letter that is not approved: banner and watermark on every page
   * @param {boolean} options.stale         an approved letter whose answers changed since: the banner says so
   */
  constructor({ reference, applicantName, draft = false, stale = false }) {
    super({ reference, applicantName, draft, stale, profile: LETTER_PAGE, info: TEXT.letterInfo, continuation: { left: applicantName, right: '' }, edge: true });
  }
}

module.exports = { LetterBuilder };
