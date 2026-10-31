#!/usr/bin/env node
/**
 * Developer tool: prints a temporary link (valid for 2 minutes) to one uploaded Tourist Visa document.
 *
 *   node scripts/tourist-visa-doc-link.js <applicationId> <documentId> --confirm
 *
 * It exists so a developer can check the private storage by hand (open the link, wait, see it stop working)
 * until the admin screen exists (step 8e), which will hand out links itself behind the admin checks and a
 * log of every view. It is NOT a route and nothing in the application calls it.
 *
 * It will not do anything unless you confirm the intent, either with the --confirm argument or with
 * TOURIST_VISA_DOC_LINK_CONFIRM=yes in the environment: the link opens a real applicant's file for anyone
 * who holds it, for two minutes, so it must never be run by accident or from a pasted command line.
 * When run from the command line it reads backend/.env (the database and Cloudinary settings), but only after the
 * confirmation and the arguments have been accepted. It prints the
 * two ids, the link and when it expires. It never prints a setting or a secret: if the link would contain
 * the API secret it refuses to print it. An error shows only its code or type, never its message.
 *
 * Exit code: 0 a link was printed, 1 it could not be made, 2 refused or used wrongly.
 */

const path = require('path');

const CONFIRM_FLAG = '--confirm';
const CONFIRM_ENV = 'TOURIST_VISA_DOC_LINK_CONFIRM';
const REQUIRED_ENV = ['MONGODB_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DOC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const USAGE = `Usage: node scripts/tourist-visa-doc-link.js <applicationId> <documentId> ${CONFIRM_FLAG}
  applicationId  the application's id (24 hex characters)
  documentId     the document's id (the "id" the document list shows)
  ${CONFIRM_FLAG}      required: you mean to open a real applicant's file (or set ${CONFIRM_ENV}=yes)`;

/**
 * The tool itself, with everything it touches passed in so it can be tested without a database or storage.
 * Returns the exit code.
 */
async function run({ argv, env, out, err, service, connect, disconnect, loadEnv = () => {} }) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const ids = argv.filter((a) => !a.startsWith('--'));

  const unknown = flags.filter((f) => f !== CONFIRM_FLAG);
  if (unknown.length || ids.length !== 2) {
    err(USAGE);
    return 2;
  }
  const confirmed = flags.includes(CONFIRM_FLAG) || env[CONFIRM_ENV] === 'yes';
  if (!confirmed) {
    err(`Refusing to run: this prints a working link to a private document.\nRun it again with ${CONFIRM_FLAG} (or ${CONFIRM_ENV}=yes) if you mean it.\n\n${USAGE}`);
    return 2;
  }
  const [applicationId, documentId] = ids;
  if (!OBJECT_ID.test(applicationId) || !DOC_ID.test(documentId)) {
    err('The application id must be 24 hex characters and the document id a UUID.\n\n' + USAGE);
    return 2;
  }
  // The settings file is read only now: a refused or mistyped run never touches it.
  loadEnv();
  const missing = REQUIRED_ENV.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
  if (missing.length) {
    err(`These settings are missing (names only): ${missing.join(', ')}`);
    return 1;
  }

  try {
    await connect();
    const { url, expiresAt } = await service.getTemporaryLink(applicationId, documentId);
    const secret = env.CLOUDINARY_API_SECRET;
    if (url.includes(secret) || url.includes(env.MONGODB_URI)) {
      err('Refusing to print the link: it contains a secret setting.');
      return 1;
    }
    err(`Link requested by the developer tool at ${new Date().toISOString()}. (Nothing is logged anywhere else until the admin screen exists.)`);
    out(`Application: ${applicationId}`);
    out(`Document:    ${documentId}`);
    out(`Expires:     ${expiresAt.toISOString()} (about 2 minutes from now)`);
    out('Link:');
    out(url);
    return 0;
  } catch (error) {
    // The code or the type only: the message of a database or storage error can contain a setting.
    err(`Could not make a link: ${(error && error.code) || (error && error.name) || 'error'}`);
    return 1;
  } finally {
    try {
      await disconnect();
    } catch {
      // nothing useful to say
    }
  }
}

async function main() {
  const mongoose = require('mongoose');
  const service = require('../services/touristVisaDocumentService');
  const code = await run({
    argv: process.argv.slice(2),
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    service,
    loadEnv: () => require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }),
    connect: () => mongoose.connect(process.env.MONGODB_URI),
    disconnect: () => mongoose.disconnect(),
  });
  process.exit(code);
}

if (require.main === module) {
  main().catch(() => {
    console.error('Could not make a link: error');
    process.exit(1);
  });
}

module.exports = { run, CONFIRM_FLAG, CONFIRM_ENV, REQUIRED_ENV };
