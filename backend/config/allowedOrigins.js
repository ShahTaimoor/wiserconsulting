/**
 * The origins (websites) that may call the API from a browser: the one list shared by CORS (index.js) and by the Tourist Visa origin guard
 * (middleware/touristVisaOriginGuard.js), so they can never disagree. FRONTEND_URL is added when it is set.
 * Exact strings, compared exactly (no wildcards, no trimming, no case folding): an origin that is not in the list is a foreign one.
 */

function getAllowedOrigins(env = process.env) {
  return [
    env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://wiserconsulting.info',
    'https://www.wiserconsulting.info',
  ].filter(Boolean);
}

module.exports = { getAllowedOrigins };
