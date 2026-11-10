'use strict';

// Preloaded (node -r) into the child process that runs the real index.js in googleGithubRemoved.test.js: the real settings file
// (backend/.env) must not be read by a test, so `require('dotenv')` is replaced by a version that loads nothing. The test passes every
// setting the app needs through the environment of the child instead.

const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  return originalLoad.call(this, request, ...rest);
};
