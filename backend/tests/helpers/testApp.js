'use strict';

// A small test app for the older routes (users, sign-in, settings, testimonials, approved visas, assessments), built from the
// repository's own route modules over an in-memory MongoDB. Made-up data only; nothing here touches a real database, a real key or
// the network (the e-mail sender is replaced by a fake).

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-real';

const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

// The comment e-mail must never try to reach a mail server.
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async () => ({ messageId: 'fake' }) });

const BACKEND = path.join(__dirname, '..', '..');
const load = (relative) => require(path.join(BACKEND, relative));

/** Starts the in-memory database and an app with every older route mounted as index.js mounts them. */
async function startTestApp() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const models = {
    User: load('models/User'),
    FormSubmission: load('models/FormSubmission'),
    AdminSettings: load('models/AdminSettings'),
    SiteSettings: load('models/SiteSettings'),
    Testimonial: load('models/Testimonial'),
    ApprovedVisa: load('models/ApprovedVisa'),
  };
  await Promise.all(Object.values(models).map((model) => model.init()));

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(load('middleware/sanitize')); // as in index.js
  app.use('/api', load('routes/userRoutes'));
  app.use('/api', load('routes/assessmentRoutes'));
  app.use('/api', load('routes/formSubmissionRoutes'));
  app.use('/api/admin-settings', load('routes/adminSettingsRoutes'));
  app.use('/api/site-settings', load('routes/siteSettingsRoutes'));
  app.use('/api/approved-visas', load('routes/approvedVisaRoutes'));
  app.use('/api/testimonials', load('routes/testimonialRoutes'));
  app.use(load('middleware/errorHandler').errorHandler);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  /**
   * One request. `body` is sent as JSON, `form` as multipart/form-data (text fields only); `token` as the Bearer header.
   * Resolves { status, json }.
   */
  async function call(method, url, { body, form, token } = {}) {
    const headers = {};
    let payload;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (form) {
      payload = new FormData();
      for (const [key, value] of Object.entries(form)) payload.append(key, String(value));
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(base + url, { method, headers, body: payload });
    let json = null;
    try {
      json = await response.json();
    } catch {
      // not JSON
    }
    return { status: response.status, json };
  }

  let counter = 0;
  /** A user straight in the database (cheap hash), with a valid sign-in token. */
  async function makeUser({ role = 0, name, email, password = 'Made-Up-Pass-1' } = {}) {
    counter += 1;
    const user = await models.User.create({
      name: name || `Test Person ${counter}`,
      email: email || `person${counter}@example.com`,
      password: await bcrypt.hash(password, 4),
      role,
    });
    const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return { user, token, password };
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  }

  return { call, makeUser, models, stop, base };
}

module.exports = { startTestApp, BACKEND, load };
