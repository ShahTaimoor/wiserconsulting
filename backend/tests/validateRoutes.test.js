'use strict';

// Step 8j-2: one regression test for each route that uses the validation middleware (20 routes). The middleware now replaces req.body with
// the cleaned result, so the test for each route shows that (1) a normal, legitimate request still works, and (2) what the schema does not
// name no longer reaches the controller and the database. For the user routes the schemas are strict, so an unknown key is a 400.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestApp, BACKEND } = require('./helpers/testApp');

let app;
let admin;
let person;
before(async () => {
  app = await startTestApp();
  admin = await app.makeUser({ role: 1, email: 'admin.one@example.com' });
  person = await app.makeUser({ role: 0, email: 'person.one@example.com' });
});
after(async () => {
  await app.stop();
});

const SUBMISSION = { name: 'Made Up Customer', email: 'customer@example.com', phone: '000', destinationCountry: 'United Kingdom', visaType: 'Tourist Visa', fromDate: '2027-01-01', toDate: '2027-01-10', purpose: 'A test' };

test('every route that uses validate() is covered by a test in this file', () => {
  const routesDir = path.join(BACKEND, 'routes');
  const using = [];
  for (const file of fs.readdirSync(routesDir)) {
    const text = fs.readFileSync(path.join(routesDir, file), 'utf8');
    for (const match of text.matchAll(/validate\(/g)) using.push(`${file}:${match.index}`);
  }
  // 19 uses: user 4, admin settings 1, site settings 2, approved visas 2, testimonials 2, assessment 2, form submissions 6.
  assert.equal(using.length, 19);
  const byFile = {};
  for (const entry of using) byFile[entry.split(':')[0]] = (byFile[entry.split(':')[0]] || 0) + 1;
  assert.deepEqual(byFile, { 'adminSettingsRoutes.js': 1, 'approvedVisaRoutes.js': 2, 'assessmentRoutes.js': 2, 'formSubmissionRoutes.js': 6, 'siteSettingsRoutes.js': 2, 'testimonialRoutes.js': 2, 'userRoutes.js': 4 });
});

// ---------------------------------------------------------------------------------------------- users (strict)

test('POST /api/signup: works; the email is cleaned; an unknown key (role) is a 400', async () => {
  const ok = await app.call('POST', '/api/signup', { body: { name: '  New Person  ', email: 'New.Person@Example.com', password: 'Made-Up-Pass-1' } });
  assert.equal(ok.status, 201);
  const user = await app.models.User.findOne({ email: 'new.person@example.com' }).lean();
  assert.ok(user);
  assert.equal(user.role, 0);
  assert.equal(user.name, 'New Person');
  const evil = await app.call('POST', '/api/signup', { body: { name: 'Evil', email: 'evil@example.com', password: 'Made-Up-Pass-1', role: 1 } });
  assert.equal(evil.status, 400);
  assert.equal(await app.models.User.countDocuments({ email: 'evil@example.com' }), 0);
  assert.equal((await app.call('POST', '/api/signup', { body: { name: 'x', email: 'bad', password: 'Made-Up-Pass-1' } })).status, 400);
});

test('POST /api/login: works by email; an unknown key is a 400; neither email nor name is a 400', async () => {
  const ok = await app.call('POST', '/api/login', { body: { email: person.user.email, password: person.password } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.data.token);
  assert.equal(ok.json.data.user.email, person.user.email);
  assert.equal((await app.call('POST', '/api/login', { body: { email: person.user.email, password: person.password, role: 1 } })).status, 400);
  assert.equal((await app.call('POST', '/api/login', { body: { password: person.password } })).status, 400);
  assert.equal((await app.call('POST', '/api/login', { body: { email: person.user.email, password: 'wrong-password-1' } })).status, 400);
});

test('PUT /api/update-profile: the allowed fields work, anything else is a 400 (the full set of tests is in updateProfile.test.js)', async () => {
  assert.equal((await app.call('PUT', '/api/update-profile', { body: { city: 'Testville' }, token: person.token })).status, 200);
  assert.equal((await app.call('PUT', '/api/update-profile', { body: { role: 1 }, token: person.token })).status, 400);
  assert.equal((await app.models.User.findById(person.user._id).lean()).role, 0);
});

test('PUT /api/update-user-role/:userId: an administrator can set 0 or 1; an unknown key or a bad role is a 400; a normal user is a 403', async () => {
  const target = await app.makeUser({ email: 'target@example.com' });
  const url = `/api/update-user-role/${target.user._id}`;
  assert.equal((await app.call('PUT', url, { body: { role: 1 }, token: admin.token })).status, 200);
  assert.equal((await app.models.User.findById(target.user._id).lean()).role, 1);
  assert.equal((await app.call('PUT', url, { body: { role: 0 }, token: admin.token })).status, 200);
  assert.equal((await app.call('PUT', url, { body: { role: 0, password: 'x' }, token: admin.token })).status, 400);
  assert.equal((await app.call('PUT', url, { body: { role: 5 }, token: admin.token })).status, 400);
  assert.equal((await app.call('PUT', url, { body: { role: '1' }, token: admin.token })).status, 400);
  assert.equal((await app.call('PUT', url, { body: { role: 1 }, token: person.token })).status, 403);
  assert.equal((await app.models.User.findById(target.user._id).lean()).role, 0);
});

// ---------------------------------------------------------------------------------------------- settings

test('PUT /api/admin-settings: a legitimate update works; fields the schema does not name are not stored', async () => {
  assert.equal((await app.call('GET', '/api/admin-settings', { token: admin.token })).status, 200); // creates the one settings record
  const res = await app.call('PUT', '/api/admin-settings', { body: { websiteTitle: 'Test Site', email: 'Info@Example.com', siteLogo: 'https://evil.invalid/x.png', isDeleted: true, logoPublicId: 'evil' }, token: admin.token });
  assert.equal(res.status, 200);
  const settings = await app.models.AdminSettings.findOne({}).lean();
  assert.equal(settings.websiteTitle, 'Test Site');
  assert.equal(settings.email, 'info@example.com');
  assert.notEqual(settings.siteLogo, 'https://evil.invalid/x.png');
  assert.equal(settings.isDeleted, false);
  assert.notEqual(settings.logoPublicId, 'evil');
  assert.equal((await app.call('PUT', '/api/admin-settings', { body: {}, token: admin.token })).status, 400);
  assert.equal((await app.call('PUT', '/api/admin-settings', { body: { websiteTitle: 'x' }, token: person.token })).status, 403);
});

for (const method of ['PUT', 'POST']) {
  test(`${method} /api/site-settings: a legitimate update works; fields the schema does not name (logoPublicId and the like) are no longer saved`, async () => {
    const res = await app.call(method, '/api/site-settings', { body: { websiteTitle: `${method} Title`, emailAddress: 'Hello@Example.com', phoneNumber: '123', stat1Value: '10+', logoPublicId: 'evil-public-id', somethingElse: 'x' }, token: admin.token });
    assert.equal(res.status, 200);
    const settings = await app.models.SiteSettings.findOne({}).lean();
    assert.equal(settings.websiteTitle, `${method} Title`);
    assert.equal(settings.emailAddress, 'hello@example.com');
    assert.equal(settings.stat1Value, '10+');
    assert.notEqual(settings.logoPublicId, 'evil-public-id');
    assert.equal(settings.somethingElse, undefined);
    assert.equal((await app.call(method, '/api/site-settings', { body: { websiteTitle: 'x' }, token: person.token })).status, 403);
    assert.equal((await app.call(method, '/api/site-settings', { body: { emailAddress: 'not-an-email' }, token: admin.token })).status, 400);
  });
}

// ---------------------------------------------------------------------------------------------- testimonials and approved visas

test('POST and PUT /api/testimonials: legitimate fields work (numbers and flags read as text); extra fields are not stored', async () => {
  const created = await app.call('POST', '/api/testimonials', { form: { clientName: 'Happy Client', rating: '5', reviewText: 'Very good.', isActive: 'true', displayOrder: '2', clientPhotoUrl: 'https://evil.invalid/p.png', isDeleted: 'true' }, token: admin.token });
  assert.equal(created.status, 201);
  const id = created.json.data._id;
  const row = await app.models.Testimonial.findById(id).lean();
  assert.equal(row.rating, 5);
  assert.equal(row.isActive, true);
  assert.equal(row.displayOrder, 2);
  assert.notEqual(row.clientPhotoUrl, 'https://evil.invalid/p.png');
  const updated = await app.call('PUT', `/api/testimonials/${id}`, { form: { reviewText: 'Updated review.', rating: '4', isActive: 'false', clientPhotoUrl: 'https://evil.invalid/q.png' }, token: admin.token });
  assert.equal(updated.status, 200);
  const after = await app.models.Testimonial.findById(id).lean();
  assert.deepEqual([after.reviewText, after.rating, after.isActive], ['Updated review.', 4, false]);
  assert.notEqual(after.clientPhotoUrl, 'https://evil.invalid/q.png');
  assert.equal((await app.call('POST', '/api/testimonials', { form: { clientName: 'x', rating: '9', reviewText: 'x' }, token: admin.token })).status, 400);
  assert.equal((await app.call('POST', '/api/testimonials', { form: { clientName: 'x', rating: '5', reviewText: 'x' }, token: person.token })).status, 403);
});

test('POST and PUT /api/approved-visas: a legitimate request passes the validation; extra fields are not stored', async () => {
  // A new approved visa needs two image files, which are sent to the file storage service (a network call), so the POST is checked as far as
  // the validation: a request with the right text fields reaches the service, which then asks for the images (its own message); a bad one is
  // stopped by the schema.
  const fields = { clientName: 'Approved Client', countryName: 'Testland', visaType: 'Tourist', approvalDate: '2026-05-01', displayOrder: '3', isActive: 'true', clientPhotoUrl: 'https://evil.invalid/p.png', countryFlagUrl: 'https://evil.invalid/f.png' };
  const reached = await app.call('POST', '/api/approved-visas', { form: fields, token: admin.token });
  assert.equal(reached.status, 400);
  assert.match(reached.json.message, /images are required/, 'it got past the validation to the service');
  const stopped = await app.call('POST', '/api/approved-visas', { form: { ...fields, clientName: '' }, token: admin.token });
  assert.equal(stopped.status, 400);
  assert.match(stopped.json.message, /Client name is required/, 'the schema stopped it');
  assert.equal(await app.models.ApprovedVisa.countDocuments({}), 0);

  const made = await app.models.ApprovedVisa.create({ clientName: 'Approved Client', countryName: 'Testland', clientPhotoUrl: 'https://example.invalid/own.png', clientPhotoPublicId: 'own', countryFlagUrl: 'https://example.invalid/flag.png', countryFlagPublicId: 'flag', displayOrder: 3, isActive: true });
  const id = String(made._id);
  const row = await app.models.ApprovedVisa.findById(id).lean();
  assert.equal(row.clientName, 'Approved Client');
  assert.equal(row.displayOrder, 3);
  assert.equal(row.isActive, true);
  const updated = await app.call('PUT', `/api/approved-visas/${id}`, { form: { note: 'Updated note', isActive: 'false', clientPhotoUrl: 'https://evil.invalid/q.png' }, token: admin.token });
  assert.equal(updated.status, 200);
  const after = await app.models.ApprovedVisa.findById(id).lean();
  assert.deepEqual([after.note, after.isActive], ['Updated note', false]);
  assert.notEqual(after.clientPhotoUrl, 'https://evil.invalid/q.png');
  assert.equal((await app.call('POST', '/api/approved-visas', { form: { clientName: '', countryName: 'x' }, token: admin.token })).status, 400);
  assert.equal((await app.call('POST', '/api/approved-visas', { form: { clientName: 'x', countryName: 'y' }, token: person.token })).status, 403);
});

// ---------------------------------------------------------------------------------------------- the public assessment (no sign-in)

for (const url of ['/api/submit-assessment', '/api/submit-assessment-local']) {
  test(`POST ${url}: a normal assessment is saved; fields the form does not have (isDeleted, status) cannot be set through it`, async () => {
    const res = await app.call('POST', url, { form: { ...SUBMISSION, email: `${url.endsWith('local') ? 'local' : 'cloud'}@example.com`, isDeleted: 'true', status: 'completed' } });
    assert.equal(res.status, 201);
    const row = await app.models.FormSubmission.findById(res.json.data.submissionId).lean();
    assert.equal(row.name, SUBMISSION.name);
    assert.equal(row.status, 'pending');
    assert.equal(row.isDeleted, false, 'isDeleted was in the body and is no longer carried to the database');
    const missing = await app.call('POST', url, { form: { ...SUBMISSION, purpose: '' } });
    assert.equal(missing.status, 400);
  });
}

// ---------------------------------------------------------------------------------------------- form submissions

test('the form submission routes (status, admin comment, customer comment, by email, file link, delete) still work and still refuse bad input', async () => {
  const doc = { fieldName: 'passports', originalname: 'p.pdf', filename: 'p', mimetype: 'application/pdf', size: 10, cloudinaryUrl: 'https://example.invalid/p.pdf', uploadType: 'cloudinary' };
  const submission = await app.models.FormSubmission.create({ ...SUBMISSION, email: 'routes@example.com', documents: [doc] });
  const id = String(submission._id);
  const documentId = String(submission.documents[0]._id);

  // PUT /form-submissions/:id/status (admin)
  assert.equal((await app.call('PUT', `/api/form-submissions/${id}/status`, { body: { status: 'reviewed' }, token: admin.token })).status, 200);
  assert.equal((await app.models.FormSubmission.findById(id).lean()).status, 'reviewed');
  assert.equal((await app.call('PUT', `/api/form-submissions/${id}/status`, { body: { status: 'nonsense' }, token: admin.token })).status, 400);
  assert.equal((await app.call('PUT', `/api/form-submissions/${id}/status`, { body: { status: 'reviewed' }, token: person.token })).status, 403);

  // PUT /form-submissions/:submissionId/documents/:documentId/comment (admin; the e-mail is a fake)
  assert.equal((await app.call('PUT', `/api/form-submissions/${id}/documents/${documentId}/comment`, { body: { comment: 'Please send a clearer copy.' }, token: admin.token })).status, 200);
  assert.equal((await app.call('PUT', `/api/form-submissions/${id}/documents/${documentId}/comment`, { body: { comment: '' }, token: admin.token })).status, 400);

  // POST /form-submissions/:submissionId/customer-comment (no sign-in at the moment: a separate finding, not changed here)
  assert.equal((await app.call('POST', `/api/form-submissions/${id}/customer-comment`, { body: { message: 'Thank you.' } })).status, 200);
  assert.equal((await app.call('POST', `/api/form-submissions/${id}/customer-comment`, { body: { message: '' } })).status, 400);

  // GET /form-submissions/customer-submission/:email
  assert.equal((await app.call('GET', '/api/form-submissions/customer-submission/routes@example.com')).status, 200);
  assert.equal((await app.call('GET', '/api/form-submissions/customer-submission/not-an-email')).status, 400);

  // GET /form-submissions/file/:submissionId/:documentId
  const file = await app.call('GET', `/api/form-submissions/file/${id}/${documentId}`);
  assert.equal(file.status, 200);
  assert.equal(file.json.data.fileUrl, 'https://example.invalid/p.pdf');

  // DELETE /form-submissions/:id (admin)
  assert.equal((await app.call('DELETE', `/api/form-submissions/${id}`, { token: person.token })).status, 403);
  assert.equal((await app.call('DELETE', `/api/form-submissions/${id}`, { token: admin.token })).status, 200);
});
