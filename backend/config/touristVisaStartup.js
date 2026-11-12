/**
 * Safe start-up for the Tourist Visa feature (step 8j-3, finding A11, the feature part).
 *
 * When TOURIST_VISA_ENABLED is exactly "true", the server must not start with a half-configured feature: a missing encryption key would only be
 * noticed when a person first tried to save, a missing token secret means nobody can sign in, and an AI that is switched on without a provider or
 * a key would fail on every letter. This module works out what is wrong; index.js refuses to start (exit code 1) when anything is.
 *
 * When the feature is switched off NOTHING is checked and nothing is logged: a closed deployment needs none of these variables.
 *
 * Problems are named by VARIABLE only. A value, or any part of one, is never put in a message, a log line or a return value.
 *
 * Checked when the feature is on:
 *   FIELD_ENCRYPTION_KEY   present and a valid 32-byte key (base64 or hex)
 *   JWT_SECRET             present (the sign-in token is signed and read with it; without it every Tourist Visa request is refused)
 *   AI_ENABLED = "true"    then AI_PROVIDER must be "groq" and GROQ_API_KEY present
 * Not a refusal, a warning: AI on in production (NODE_ENV anything but exactly "development" or "test") without AI_DATA_TERMS_CONFIRMED = "true".
 * That case was never a start-up refusal: the AI stays OFF for every letter (config/ai.js, AI_TERMS_NOT_CONFIRMED) and the template letter is used,
 * so the site keeps working. This keeps that behaviour and only says it clearly at start-up.
 */

const { isTouristVisaEnabled } = require('../middleware/touristVisaFeatureGate');
const { readFieldEncryptionKey } = require('./fieldEncryption');
const { readAiSettings } = require('./ai');

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

/** { problems: [{ variable, problem }], warnings: [{ variable, warning }] }. Empty lists when the feature is off. */
function inspectTouristVisaStartup(env = process.env) {
  const problems = [];
  const warnings = [];
  if (!isTouristVisaEnabled(env)) return { enabled: false, problems, warnings };

  const { problem } = readFieldEncryptionKey(env);
  if (problem === 'missing') problems.push({ variable: 'FIELD_ENCRYPTION_KEY', problem: 'is not set' });
  else if (problem === 'invalid') problems.push({ variable: 'FIELD_ENCRYPTION_KEY', problem: 'is not a 32-byte base64 or hex key' });

  if (isBlank(env.JWT_SECRET)) problems.push({ variable: 'JWT_SECRET', problem: 'is not set' });

  const ai = readAiSettings(env);
  if (ai.enabled) {
    if (ai.provider !== 'groq') problems.push({ variable: 'AI_PROVIDER', problem: 'must be "groq" when AI_ENABLED is "true"' });
    if (!ai.apiKey) problems.push({ variable: 'GROQ_API_KEY', problem: 'is not set (needed when AI_ENABLED is "true")' });
    if (ai.production && !ai.termsConfirmed) {
      warnings.push({ variable: 'AI_DATA_TERMS_CONFIRMED', warning: 'is not "true" in a production environment, so the AI stays off and the template is used for letters and itineraries' });
    }
  }
  return { enabled: true, problems, warnings };
}

/** The sentence for a refusal to start: the variables by name and what is wrong, never a value. */
function startupMessage(problems) {
  const list = problems.map(({ variable, problem }) => `${variable} ${problem}`).join('; ');
  return `The Tourist Visa feature cannot start: ${list}. Fix the settings, or leave TOURIST_VISA_ENABLED unset to keep the feature off.`;
}

/**
 * Called once by index.js before anything else is loaded. Returns true when the server may start. On a problem it reports through `report`
 * (the logger's error by default) and returns false; the caller exits. Warnings are reported and never stop the start.
 */
function checkTouristVisaStartup({ env = process.env, report = (message) => require('../utils/logger').error(message) } = {}) {
  const { problems, warnings } = inspectTouristVisaStartup(env);
  for (const { variable, warning } of warnings) report(`${variable} ${warning}.`);
  if (problems.length === 0) return true;
  report(startupMessage(problems));
  return false;
}

module.exports = { inspectTouristVisaStartup, startupMessage, checkTouristVisaStartup };
