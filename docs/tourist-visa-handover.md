# Tourist Visa form: handover

For the engineer who will review and deploy this. It describes what is built, what is not, how to switch it on, what it needs on production, what it changed in existing files, and what still needs a decision.

Branch: `feature/tourist-visa-form`. Question specification: [tourist-visa-form-spec.md](tourist-visa-form-spec.md). Config version at the time of writing: `0.5.0-draft`.

## 1. At a glance

- A signed-in user fills in a UK visitor (tourist) visa application, one section at a time, and can leave and come back. Answers are saved on the server per section ("Save and continue").
- It is **not ready to open to the public**. 13 of the 16 sections still carry open `tbc` items (real unknowns in the spec, for example what to ask after a Yes), and 16 option lists are drafts that need review. Until the `tbc` items are settled, the live site shows "The application isn't open yet" (see section 4).
- Nothing links to the form yet. It can only be reached by typing `/tourist-visa`.
- It adds one new database collection and does not change the data of any existing feature.

## 2. What is built

**Questions: Parts 1 to 8 of the spec, in 16 sections.** Section 4A (spouse or partner) only applies when 2.13 is married, civil partnership or unmarried partner, so an applicant sees 15 or 16 sections, and the dashboard counts only the ones that apply (for example "5 of 15 sections saved").

| Part | Sections |
| --- | --- |
| 1 Travel information | 1 |
| 2 Personal information | 2A name and email, 2B identity, 2C address and living situation, 2D telephone |
| 3 Passport | 3 |
| 4 Family | 4A spouse or partner, 4B dependants, 4C parents |
| 5 Employment | 5 |
| 6 Money, family in the UK, accommodation | 6A income and expenditure, 6B family in the UK, 6C accommodation, 6D public funds |
| 7 Travel history (UK) | 7 |
| 8 Travel history (other countries) | 8 |

114 questions and 7 repeating groups in all.

**One config drives both sides.** The questions live in `shared/tourist-visa/questions.json` and the rules in `shared/tourist-visa/engine.js`. The client form and the server validation both run the same engine, so they cannot disagree. Changing a question, an option list or a condition means editing the JSON, not code.

**Save and resume.** Each section is validated and saved on its own. The dashboard (`/tourist-visa`) shows every section as saved, not started or needs review, and "Continue" goes to the first section that is not done. A saved section is flagged "needs review" automatically when something it depends on changes (for example, moving the leave date in section 1 flags the accommodation dates in 6C).

**Gates (a Yes/No or a choice decides what appears).** When an answer changes and hides questions, the server removes the hidden answers from the database. Examples: 2.13 relationship status shows or hides the whole of section 4A; 5.1 employment status shows 5.2 to 5.9 only for "employed"; 6.1 shows 6.2 for savings; a Yes on 6.5, 6.6, 6.8, 7.3 or 7.6 opens one "Please give details" box; 7.1, 7.4, 7.7 and 8.2 open their questions and groups. A section with no visible question is hidden everywhere (dashboard, progress count, Back and Next, direct address) and cannot be saved.

**Repeating groups.** Add another and Remove for dependants (4B), parents (4C, always open, at least 1), places of stay (6C), immigration problems (7.7) and other-country trips (8.2). The UK visits (7.5a to 7.5c) are count-driven: the number typed at 7.5 decides how many visit entries there are, with no Add or Remove.

**Cross-section and date rules.** Passport expiry (3.4) must be after the issue date and after the planned leave date (1.7). Places of stay must fall inside the travel dates (1.6 to 1.7) and must not overlap. Past-event dates cannot be in the future, and "in the past 10 years" dates cannot be older than 10 years.

**Encryption at rest.** The national identity card number (2.19) and the passport number (3.1) are encrypted before they are stored (AES-256-GCM, stored as `enc:v1:...`). The ciphertext is bound to the application and the field, so it cannot be copied into another field or entry. Everything else is stored as typed. Answers are never written to logs, localStorage, Redux, URLs, the console or analytics.

**Interface.** Accessible labels, errors and focus handling, an error summary, light and dark mode, and a layout that works at 375 px. Leaving a section with unsaved changes opens a dialog in the site's own style ("Stay on this page" / "Leave without saving"); saving shows a "Section saved" toast. The feature uses no native browser alert, confirm or prompt.

**Preview markers.** In preview mode (section 4) a question shows a **TBC** badge when it has a real unknown, and a **Draft options** badge when its option list is a draft.

**Tests.** See section 8.

## 3. What is NOT built

- **Parts 9 and 10** of the spec (security and character questions, penalties, extra information, language, National Insurance, documents).
- **Document upload** (passport copy and proof of funds). The model has a `documents` list for references, but no upload route or screen exists.
- **Review page and final submit.** There is no review step and no way to submit; an application stays a draft.
- **Admin view** of applications and **PDF export** in the printout's layout.
- **Entry points.** No link to `/tourist-visa` was added to the Footer, the Navbar or the Services pages (the Footer's existing "Tourist Visa" link points at `/services/tourist-visa`, which does not exist). Add links only once the form is ready to open.
- **Real follow-up questions** for the Yes paths the spec does not define (see section 10). Each has a plain placeholder text box for now.
- A **help list of EEA countries** for question 8.1 (the printout shows one; it needs a maintained country list).
- **Enforcing the release gate on the server.** The "not open yet" check is in the client only. The API accepts saves from a signed-in user regardless.
- **Key rotation** for the encryption key (section 5).
- **Deleting or exporting** an applicant's data.

## 4. The feature switch

The client decides whether the form is open (`client/src/utils/touristVisaChecklist.ts`):

- The form is **open** when no section has an open `tbc` item, **or** when the build has `NEXT_PUBLIC_TOURIST_VISA_PREVIEW=true`.
- Otherwise a visitor who opens a section sees **"The application isn't open yet. We're still finalising the questions. Please check back soon."** The dashboard still shows, so a signed-in user can see the sections.
- **Off means unset or any value other than the exact text `true`.** Leave it unset in production.
- It is a `NEXT_PUBLIC_` variable, so it is read **when the client is built**, not at run time. Changing it needs a rebuild and redeploy.
- Preview mode also shows the TBC and Draft badges. Use it in development and on a private test deployment only.

Important: **drafts do not close the form, only `tbc` items do.** Once every `tbc` item is resolved, the form opens to the public even if a draft option list has not been reviewed. Run the release check before every production deploy (section 8): it exits 1 while anything is blocked, and 2 when nothing is blocked but drafts still need senior review. Treat 2 as "do not release yet".

## 5. Environment variables for production

**Backend (new):**

| Variable | Required | Notes |
| --- | --- | --- |
| `FIELD_ENCRYPTION_KEY` | Yes | 32 random bytes, as base64 (44 characters) or hex (64 characters). |

Generate one with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rules for the key:

- **Store it safely**, in the host's secret store, and keep a copy in your password manager or vault. It is never in the repository and the feature never logs it.
- **Losing it, or changing it, makes every encrypted answer (2.19 and 3.1) unrecoverable.** There is no recovery and no key rotation yet. Back it up before the first real applicant saves anything.
- Do not reuse the key from a test environment, and use a different key per environment.
- If it is missing or malformed, the server **refuses every section save** with a 503 ("Secure storage is not configured") and logs an error at startup. Nothing is stored in plain text as a fallback. Reading an application only needs the key when it holds encrypted answers.

**Client (new, optional):**

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` | Leave unset in production (section 4). Listed in `client/.env.example`. |

Existing variables the feature relies on and does not change: `JWT_SECRET` (sign-in), `MONGODB_URI`, `NEXT_PUBLIC_API_URL`. Do not leave `SESSION_SECRET` unset (see section 11).

## 6. What changed in existing files

Only six existing files were modified. Everything else is new, including `backend/.env.example` (it did not exist before; it names `FIELD_ENCRYPTION_KEY` only).

| File | Change |
| --- | --- |
| `backend/index.js` | Requires the new routes and two small middlewares; mounts `app.use("/api/tourist-visa", touristVisaRoutes)`; parses Tourist Visa bodies first with log-safe errors (`touristVisaBodyParser`); and wraps the global input sanitizer as `skipPaths(["/api/tourist-visa"], sanitize)`. The sanitizer strips `<` and `>` from every string, which would alter free-text answers, so it is skipped for this one path only. Every other route is sanitized exactly as before. |
| `client/src/components/login-form.tsx` | After sign-in, goes back to the page the visitor came from (`?next=`) when it is a safe same-site path (`client/src/utils/safeRedirect.ts`); otherwise the old defaults (admins to `/admin/users`, others to `/`). |
| `backend/package.json` (and lock file) | `npm test` now runs the backend tests (it was a placeholder), one file at a time (`--test-concurrency=1`); adds the dev dependency `mongodb-memory-server`. |
| `client/package.json` | Adds the `test:unit` script. |
| `client/.env.example` | Documents `NEXT_PUBLIC_TOURIST_VISA_PREVIEW`. |
| `backend/package-lock.json` | Lock file for the dev dependency above. It adds 30 packages (the in-memory database for tests, dev only) and also moved the locked versions of six existing indirect packages: `b4a` 1.6.7 to 1.9.0, `bare-events` 2.6.1 to 2.9.2, `semver` 7.7.2 to 7.8.5, `streamx` 2.22.1 to 2.28.1, `tar-stream` 3.1.7 to 3.2.2 and `text-decoder` 1.2.3 to 1.2.7. These are not used by the Tourist Visa code. If you want the lock file to change by the new packages only, regenerate it from main with `npm install --save-dev mongodb-memory-server@^11.3.0`. |

New at the repository root: `package.json` (scripts only, no dependencies) and `scripts/` (`sync-shared.js`, `check-tourist-visa-release.js`), plus `shared/tourist-visa/`, which is the canonical copy of the config and engine.

New code lives under: `backend/{config,controllers,middleware,models,repositories,routes,services,shared,tests}`, `client/src/app/tourist-visa`, `client/src/components/tourist-visa`, `client/src/components/ui/alert-dialog.tsx`, `client/src/{context,hooks,services,shared,utils}`, and `docs/`. The backend follows the existing layering (routes, controller, service, repository, model).

**API.** Three routes, all behind the existing `isAuthorized` middleware, and each only ever touches the signed-in user's own application:

- `POST /api/tourist-visa/applications` creates the draft, or returns the existing one.
- `GET /api/tourist-visa/applications/me` returns it, with sensitive answers decrypted for the owner.
- `PUT /api/tourist-visa/applications/me/sections/:sectionId` validates and saves one section.

**Shared copies.** The client and backend are deployed separately, so each carries a generated copy of `shared/tourist-visa/` (`client/src/shared/tourist-visa/`, `backend/shared/tourist-visa/`, each with a `GENERATED.txt`). After editing anything in `shared/tourist-visa/`, run `npm run sync:shared` and commit the copies. A test fails if a copy has drifted.

## 7. Database

The feature adds **one new collection**, `touristvisaapplications` (model `TouristVisaApplication`), with three indexes: one live draft per applicant (unique, partial), `applicant + createdAt`, and `status + createdAt`. It does not read or change any existing collection except `users` (to identify the signed-in user, as the rest of the site does).

Each application records the `configVersion` its answers were collected with. When the config changes, saved answers are never rewritten: the server works out the status of each section when it reads the application, and a section whose answers no longer fit shows as **Needs review**.

**Option values changed in `0.5.0-draft`.** Earlier versions stored placeholder values such as `tbc_married`. Those applications keep every answer, but the sections that used a placeholder now show as Needs review until the applicant saves them again. Until they do, a gate that depended on an old value (for example 4A on `tbc_married`) reads as closed, and the next save of any section prunes the answers it hides. This only affects test data from before the draft lists.

## 8. Running the tests and checks

From the repository root:

```
npm run sync:shared                  # after editing shared/tourist-visa/
npm run check:shared                 # fails if the client or backend copy has drifted
npm run test:shared                  # engine and config tests (131)
npm run check:tourist-visa-release   # open tbc items and draft lists; exit 1 blocked, 2 drafts only, 0 clear
```

Backend (needs no database and no `.env`; it starts an in-memory MongoDB):

```
cd backend
npm test                             # runs the test files one at a time
```

The first run downloads a MongoDB binary (about 75 MB, cached in `backend/node_modules/.cache`), so it needs internet. **Keep at least 1 GB free on the drive that holds the temp folder.** MongoDB refuses writes when under 500 MB are free, and the suite was changed to run serially because running six in-memory databases at once used almost 2 GB and failed on a nearly full drive.

Client:

```
cd client
npm run test:unit                    # pure logic tests
npx tsc --noEmit
npx eslint src/utils src/components/tourist-visa src/app/tourist-visa
npx next build
```

All of these were green at the time of writing. The tests use made-up data only.

## 9. Deploying

1. Back up and store `FIELD_ENCRYPTION_KEY`, set it on the backend, and deploy the backend. Check the startup log shows no "FIELD_ENCRYPTION_KEY" error.
2. Build and deploy the client with `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` unset.
3. The form stays closed to visitors while any `tbc` item remains. To test on a private environment, build that environment with the variable set to `true`.
4. Before opening it for real: resolve the `tbc` items (section 10), get the draft lists reviewed, run `npm run check:tourist-visa-release` and expect exit 0, then add the entry-point links.

## 10. Draft options and defaults that need review

### 10.1 Draft option lists

These replaced the earlier `[TBC]` placeholders. They are modelled on the UK online visitor visa application and on the hints in the spec, but they have not been checked against the official form. Each carries a `draft` marker in the config and a "Draft options" badge in preview mode. To finalise one, edit its options in `shared/tourist-visa/questions.json`, delete its `draft` line, run `npm run sync:shared`, and update any test that names its values. The stored value is the first column in each list; the label is what the applicant sees.

| Question | Label | Draft values |
| --- | --- | --- |
| 1.1 | Main reason for the visit | tourism, family_friends, business, study, medical, transit, other |
| 1.4 | Main reason for the holiday visit (shown for `tourism`) | holiday, event, shopping, cruise, other |
| 2.5 | Who the email belongs to | me, family_or_friend, representative, other |
| 2.8 | Who the second email belongs to | me, family_or_friend, representative, other |
| 2.12 | Sex as shown in the passport | female, male, other |
| 2.13 | Relationship status | single, married, civil_partnership, unmarried_partner, separated, divorced, widowed |
| 2.28 | Ownership of the home | owned, rented, with_family_or_friends, employer_provided, other |
| 2.33 | Where the telephone number is used | in_home_country, in_uk, in_other_country |
| 2.35 | Ways to be contacted by telephone | call, sms, messaging_app |
| 4.7a | Relationship of a dependant | son, daughter, stepchild, grandchild, parent, sibling, other_relative, other |
| 4.8a | Relationship of a parent | mother, father, stepmother, stepfather, guardian |
| 5.1 | Employment status | employed, self_employed, retired, student, homemaker, unemployed, other |
| 6.1 | Other income or savings | savings, other_income, savings_and_income, none |
| 7.5a | Why they were in the UK | tourism, family_friends, business, study, work, medical, transit, other |
| 7.7a | What happened (immigration problem) | refused_visa, refused_entry, refused_stay, refused_asylum, deported, removed, required_to_leave, excluded_or_banned |
| 8.2b | Reason for a visit abroad | tourism, family_friends, business, study, work, medical, transit, other |

Values that other questions depend on: `tourism` (1.1) opens 1.4; `other` (2.28) opens 2.29; `married`, `civil_partnership` and `unmarried_partner` (2.13) show section 4A; `employed` (5.1) shows 5.2 to 5.9; `savings` and `savings_and_income` (6.1) show 6.2. Check those mappings first.

2.35 is the only list that starts from the printout (telephone call and text message); the messaging-app choice is our addition.

### 10.2 Open items (`tbc`): spec gaps we defaulted

These are the points in the spec's "Gaps to confirm" that we could not settle. Each has a `tbc` flag, blocks release of its section, and is listed by the release check. The default is what the form does today.

| Question | Default we chose |
| --- | --- |
| 1.2, 1.3, 2.30, 2.31, 6.7 (No), 4.8f (No), 8.1 (above 0) | Nothing further is asked; the answer is recorded and the follow-up is flagged. |
| 2.23, 6.5, 6.6, 6.8, 7.3, 7.6 (Yes) | One required plain text box, "Please give details" (2.23a, 6.5a, 6.6a, 6.8a, 7.3a, 7.6a), as a placeholder. We deliberately ask nothing about identity or passport numbers of another country. |
| 2.3a, 2.3b | The other-names group asks given names and family name; fields to confirm. |
| 2.7 | One additional email address (not several). |
| 2.29 | Shown when 2.28 is `other`; the full condition is to confirm. |
| 4.1 to 4.6 | Show for married, civil partnership and unmarried partner. |
| 4.8 (parents) | No Yes/No question; the group is always shown and needs at least 1 parent, up to 20. |
| 5.1 | Only `employed` shows 5.2 to 5.9; other statuses show nothing more. |
| 5.9 | An optional text box (blank means none) instead of the printout's pick-list. |
| 6.1 | One choice from the list (not several); `savings` and `savings_and_income` show 6.2. |
| 6.7 (stays) | Stays may not overlap; a gap between stays, or two stays meeting on one day, is accepted. |
| 7.2 | One month and year, not one entry per visa. |
| 7.5 | The count must be from 1 to 20, the group limit. |
| 8.1 | A whole number from 0 to 1000; the EEA help list is not built. |

### 10.3 Other choices we made (not flagged `tbc`)

- **Limits:** 200 characters for short text, 5,000 for long text, 20 entries per group (the spec's proposals, marked as unconfirmed in the config).
- **Sensitive fields:** only 2.19 and 3.1 are encrypted, because the spec names passport and ID numbers. Other personal and financial answers (family names, dates of birth, employer, income, savings) are stored as typed. Decide whether any of those should be encrypted too.
- **Sanity rules the spec does not state:** dates of birth and past events cannot be in the future; amounts are in GBP, never negative and capped (5.7, 6.3 and 6.4 at 1,000,000; 6.2 at 100,000,000); the "past 10 years" limit applies to 7.2, 7.5b and 8.2d (the leave date), not to 7.7c ("ever"), and trips abroad in 8.2 may overlap.
- **2.1 to 2.35:** email 2.4 is pre-filled from the account email and can be edited; 2.21 and 2.22 are required whenever 2.18 is Yes; 2.27 is two boxes (years, months, months at most 11); an address needs line 1, town and country.
- **Hidden sections and old answers:** a section that does not apply (4A) cannot be saved, and the server removes its answers when the gate closes.

## 11. Not part of this feature, found while reviewing

These are existing problems in the rest of the application. They were found while reading the code to build this feature, and **none of them was changed**. They are listed so they are not lost. The new Tourist Visa routes do not have these problems.

1. **Unauthenticated routes.** These accept requests without a signed-in user:
   - `/api/submit-assessment`, `/api/submit-assessment-local`, `/api/test-pdf-upload`, `/api/merge-pdfs`, `/api/compress-pdfs`
   - `GET /api/form-submissions/customer-submission/:email`
   - `POST /api/form-submissions/:id/customer-comment`
   - `GET /api/form-submissions/file/:submissionId/:documentId`
2. **Public Cloudinary URLs.** Uploaded documents are stored as public `secure_url` links, with a 10 MB limit and DOC, DOCX and GIF allowed. Anyone who has a link can open the file. The Tourist Visa spec asks for private files with expiring links; that will need `type: "authenticated"` uploads and signed URLs, not the existing middleware.
3. **Global input sanitizer.** `backend/middleware/sanitize.js` strips `<` and `>` from every string on every route except the new Tourist Visa path, which can silently alter user text.
4. **Error logging.** `backend/middleware/errorHandler.js` logs the whole error object for unexpected errors. Database cast errors can include the submitted value, so personal data can end up in logs. The Tourist Visa routes use their own log-safe handler; the rest of the app does not.
5. **Default session secret.** `backend/index.js` falls back to the string `"your-secret-key"` when `SESSION_SECRET` is not set. Set it explicitly on every environment.
6. **A database connection string with credentials in the git history of main.** Two old commits (`2117279` and `6e1ad3a`) added a `mongodb+srv://user:password@...` string to `backend/config/db.js`. It is no longer in the current file, but anyone with access to the repository can read it in the history. Treat that password as exposed: check whether it is still in use, and rotate it if so.
7. **An old `client/.env` in the history of main.** It was committed in `8575276` and removed in `f08eb0f`. It held `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (both are meant to be visible in the browser, so the risk is low).

Items 6 and 7 were already on main before this feature. The feature's own commits were searched and add no secret, no key value, no connection string and no env file.

## 12. Native browser dialogs elsewhere in the client

The Tourist Visa pages use the site's own dialog and toast components and no native dialogs. Six native dialogs remain elsewhere. They were left alone on purpose, and `client/src/components/tourist-visa/ConfirmDialog.tsx` with `client/src/components/ui/alert-dialog.tsx` can replace them:

| File | Line | Call |
| --- | --- | --- |
| `client/src/app/admin/contacts/page.tsx` | 73 | `confirm(...)` before deleting a submission |
| `client/src/app/admin/products/page.tsx` | 159 | `window.confirm(...)` before deleting a document |
| `client/src/app/admin/products/page.tsx` | 169 | `window.confirm(...)` before deleting a submission |
| `client/src/components/signup-form.tsx` | 40 | `alert("Passwords do not match")` |
| `client/src/components/VisaConsultation.tsx` | 217 | `alert(...)` after a successful re-upload |
| `client/src/components/VisaConsultation.tsx` | 220 | `alert(...)` after a failed re-upload |

## 13. Where to look

| To change | Look at |
| --- | --- |
| A question, option list, condition or limit | `shared/tourist-visa/questions.json`, then `npm run sync:shared` |
| A validation or visibility rule, or a new rule type | `shared/tourist-visa/engine.js` (+ `engine.d.ts`, `engine.test.js`) |
| What the server saves, prunes and flags | `backend/services/touristVisaApplicationService.js`, `backend/repositories/touristVisaApplicationRepository.js` |
| Encryption | `backend/config/fieldEncryption.js`, `backend/repositories/fieldCipher.js` |
| How a question or group is drawn | `client/src/components/tourist-visa/` (`QuestionField.tsx`, `RepeatGroupField.tsx`, `fields/`) |
| Section form behaviour and unsaved-changes guard | `client/src/components/tourist-visa/SectionForm.tsx`, `client/src/hooks/useUnsavedChangesGuard.ts` |
| Dashboard and open/closed switch | `client/src/app/tourist-visa/`, `client/src/utils/touristVisaChecklist.ts` |
| The pure form logic (payload, errors, hints) | `client/src/utils/touristVisaForm.ts` |
