'use strict';

// Starts the REAL backend/index.js in a child process for the wiring tests of step 8j-3. The child runs in a scratch working directory (so the
// developer's real .env is never read) with ONLY the variables the test passes, plus PATH. Nothing here touches a real database.

const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

/**
 * Starts index.js with exactly `env` (and PATH / SystemRoot). Resolves { child, output(), exit() (a promise of the exit code), port, stop() }.
 * Nothing waits for the server to listen: use `waitUntilUp` for that, or `exit()` for a start that is meant to be refused.
 */
async function startIndex(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'index.js')], {
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let exitCode = null;
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code) => { exitCode = code; resolve(code); }));
  return {
    child,
    port,
    output: () => output,
    exit: () => Promise.race([exited, sleep(30000).then(() => { throw new Error(`the backend did not exit:\n${output}`); })]),
    exitCode: () => exitCode,
    async stop() {
      if (exitCode === null) {
        child.kill();
        await Promise.race([exited, sleep(5000)]);
      }
    },
  };
}

/** Waits until GET / answers 200 (or the child exits early, which is an error). */
async function waitUntilUp(app) {
  for (let i = 0; i < 200; i += 1) {
    if (app.exitCode() !== null) throw new Error(`the backend exited early (${app.exitCode()}):\n${app.output()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${app.port}/`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(150);
  }
  throw new Error(`the backend did not start:\n${app.output()}`);
}

/** One request with full control of the headers (fetch may drop Origin and Cookie). Resolves { status, headers, text, json }. */
function rawRequest(port, { method = 'GET', path: urlPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

module.exports = { startIndex, waitUntilUp, rawRequest, freePort, sleep };
