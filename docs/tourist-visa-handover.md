# Tourist Visa form: handover

For the engineer who will review and deploy this. It describes what is built, what is not, how to switch it on, what it needs on production, what it changed in existing files, and what still needs a decision.

Branch: `feature/tourist-visa-form`. Question specification: [tourist-visa-form-spec.md](tourist-visa-form-spec.md). Config version at the time of writing: `0.10.0-draft`. This describes the state after step 8b-2: Parts 1 to 10 are built except the documents (10D); the document upload and everything after the questions are still to build (section 14).

## 1. At a glance

- A signed-in user fills in a UK visitor (tourist) visa application, one section at a time, and can leave and come back. Answers are saved on the server per section ("Save and continue").
- It is **not ready to open to the public**. **No `tbc` item is left anywhere** (every real unknown has been turned into a default), but **21 of the 22 sections carry drafts**: 75 defaults we chose (71 questions and 4 repeating groups), each with a short note, that need senior review (section 10.8 lists them all), and the **wording of the final submit declaration** is a draft too. Only the passport section (3) is free of drafts. **The client opens the form only when no section has a `tbc` item and none has a draft**, so an unreviewed default cannot reach the public by accident. Until then the live site shows "The application isn't open yet".
- **Two switches keep it closed** (section 4): the backend variable `TOURIST_VISA_ENABLED`, which is **off unless it is exactly `true`**, and the client's own gate. With the backend switch off, the whole API is inert: every request gets one fixed "closed" answer and nothing is read, stored or logged. **Production must keep both switches consistent.**
- Nothing links to the form yet. It can only be reached by typing `/tourist-visa`.
- It adds one new database collection and does not change the data of any existing feature.

## 2. What is built

**Questions: Parts 1 to 10 of the spec (without the documents, 10D), in 22 sections.** Section 4A (spouse or partner) only applies when 2.13 is married, civil partnership or unmarried partner, so an applicant sees 21 or 22 sections, and the dashboard counts only the ones that apply (for example "5 of 21 sections saved").

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
| 9 Other history (security and character) | 9A espionage, sabotage and war crimes, 9B terrorism and extremism, 9C other conduct and character |
| 10 Penalties and closing questions | 10A convictions and other penalties, 10B extra information, 10C language and National Insurance number (10D, the documents, is step 8c) |

209 questions and 16 repeating groups in all.

**One config drives both sides.** The questions live in `shared/tourist-visa/questions.json` and the rules in `shared/tourist-visa/engine.js`. The client form and the server validation both run the same engine, so they cannot disagree. Changing a question, an option list or a condition means editing the JSON, not code.

**Save and resume.** Each section is validated and saved on its own. The dashboard (`/tourist-visa`) shows every section as saved, not started or needs review, and "Continue" goes to the first section that is not done. A saved section is flagged "needs review" automatically when something it depends on changes (for example, moving the leave date in section 1 flags the accommodation dates in 6C).

**Gates (a Yes/No or a choice decides what appears).** When an answer changes and hides questions, the server removes the hidden answers from the database. Examples: 2.13 relationship status shows or hides the whole of section 4A; 5.1 employment status shows its own block of questions (employed: 5.2 to 5.9; self-employed, student, retired, and homemaker / not working / other each have theirs, section 10.3); 6.1 shows 6.2 for savings and an optional monthly other-income amount (6.1a) for other income; a Yes on 1.2, 1.3, 2.23, 2.30 or 2.31, or on the new 4.8 ("can you give your parents' details?"), opens its follow-up questions (section 10.2); a Yes on 6.5, 6.6 or 6.8, and a No on 6.7, open structured follow-ups (section 10.3); a Yes on 7.1, 7.3 or 7.6 opens a list of entries (visas, leave-to-remain applications, breaches), and 7.4, 7.7 and 8.2 open their questions and groups; a number above 0 at 8.1 shows the optional tick boxes of 8.1a (section 10.4); each of the ten Yes/No questions of Part 9 (9.1 to 9.10) opens a required details box on a Yes (section 10.5); in 10A **each ticked choice of 10.1 opens its own required details box** and unticking it removes the box and its answer, while the exclusive choice "None of these" cannot be ticked with the others; Other at 10.4 opens a required "which language" box and a Yes at 10.5 opens a required box for the National Insurance number (section 10.6). A section with no visible question is hidden everywhere (dashboard, progress count, Back and Next, direct address) and cannot be saved. **An answer that is hidden only because its gate has never been answered is kept, not removed**: when a new Yes/No is put in front of questions that already hold saved answers (as 4.8 was put in front of the parents), those answers wait, untouched, until the Yes/No is answered.

**Repeating groups.** Add another and Remove for companions (1.3, up to 10), other names (2.3, up to 10), other nationalities (2.23, up to 5), medical treatments (2.31, up to 5), dependants (4B), parents (4C, opened by 4.8, 1 to 4), payers (6.5, up to 5), relatives in the UK (6.6, up to 10), places of stay (6C), public funds received (6.8, up to 5), UK visas issued (7.2, up to 10), leave-to-remain applications (7.3, up to 5), breaches of UK immigration law (7.6, up to 5), immigration problems (7.7) and other-country trips (8.2). The UK visits (7.5a to 7.5c) are count-driven: the number typed at 7.5 (1 to 99) decides how many visit entries there are, with no Add or Remove, **but at most the 20 most recent visits are listed**: a number above 20 asks for exactly 20 entries, the question's help text and a note above the entries say so, and the number typed is stored as given.

**Cross-section and date rules.** Passport expiry (3.4) must be after the issue date and after the planned leave date (1.7). Places of stay must fall inside the travel dates (1.6 to 1.7) and must not overlap. Past-event dates cannot be in the future, and "in the past 10 years" dates cannot be older than 10 years.

**Encryption at rest.** 36 answers are encrypted: the national identity card number (2.19), the UK driving licence number (2.30a), the medical treatment text (2.31b), the passport number (3.1), and, new in step 7d, the UK visa reference number (7.2c), the leave-to-remain application reference number (7.3f) and the breach details (7.6d), and, new in step 8b-1, the ten Yes/No answers of Part 9 (9.1 to 9.10) and their ten details boxes (9.1a to 9.10a), and, new in step 8b-2, the penalties checklist (10.1) and its six details boxes (10.1a to 10.1f), the National Insurance Yes/No (10.5) and the number itself (10.5a). The four declaration ticks (9.11 to 9.14), the two extra-information boxes (10.2, 10.3) and the language (10.4, 10.4a) are not encrypted. A National Insurance number is stored in capitals with no spaces, whatever the applicant typed. The medical text and the three Part 7 answers sit inside group entries, and each entry is encrypted on its own. They are encrypted before they are stored (AES-256-GCM, stored as `enc:v1:...`). The ciphertext is bound to the application and the field, so it cannot be copied into another field or entry. Everything else is stored as typed. Answers are never written to logs, localStorage, Redux, URLs, the console or analytics.

**Interface.** Accessible labels, errors and focus handling, an error summary, light and dark mode, and a layout that works at 375 px. Leaving a section with unsaved changes opens a dialog in the site's own style ("Stay on this page" / "Leave without saving"); saving shows a "Section saved" toast. The feature uses no native browser alert, confirm or prompt.

**Declarations.** A tick the applicant must give (type `ACK`, the four of Part 9) records what was agreed: the SHA-256 hash of the exact words shown (the tick text and its guidance), the time, the user and the config version, on the application as `declarations.<question id>`. No IP address or browser data is kept, and the applicant is never sent the records. If the wording is later changed in the config, a tick given for the old words is shown unticked and its section shows "Needs review" until it is ticked again; the stored answer is not touched. The exact wording of the ticks and of the final submit declaration lives in one place, `shared/tourist-visa/questions.json` (section 10.5).

**Preview markers.** In preview mode (section 4) a question or repeating group shows a **TBC** badge when it has a real unknown, and a **Draft options** badge when it carries a draft (an option list, follow-up questions or a rule we chose).

**Tests.** See section 8.

## 3. What is NOT built

- **Part 10D, the documents** of the spec (the passport copy and the proof of funds). Part 9 and Part 10A to 10C are built as drafts (steps 8b-1 and 8b-2). Everything still to build is planned in order in section 14.
- **Document upload** (passport copy and proof of funds). The model has a `documents` list for references, but no upload route or screen exists.
- **Review page and final submit.** There is no review step and no way to submit; an application stays a draft.
- **Admin view** of applications and **PDF export** in the printout's layout.
- **Entry points.** No link to `/tourist-visa` was added to the Footer, the Navbar or the Services pages (the Footer's existing "Tourist Visa" link points at `/services/tourist-visa`, which does not exist). Add links only once the form is ready to open.
- **Senior review of the drafts.** Nothing is confirmed: all 75 drafts (section 10.8) and the declaration wording still need a decision before release. No question is left open as a `tbc`.
- The **EEA help list** at 8.1 is a fixed list of 30 country codes in the config (27 EU states, Iceland, Liechtenstein and Norway). It is not maintained automatically: update it by hand if membership changes.
- **Tying the server to the client's release gate.** The server switch is one all-or-nothing flag set by a person. It does not look at the open `tbc` items. If someone sets it to `true` while `tbc` items remain, the form still shows "not open yet" but the API accepts calls from a signed-in user. Keep the two consistent (section 4).
- **Key rotation** for the encryption key (section 5). Planned as its own step before any real applicant data is stored (section 14).
- **Deleting or exporting** an applicant's data.

## 4. The feature switches

The form opens only when **both** of these say open.

### 4.1 Server switch: `TOURIST_VISA_ENABLED` (backend)

- The API is **open only when the variable is exactly the text `true`**. Unset, empty, `false`, `TRUE`, ` true`, `1` and anything else keep it closed. The default is closed, so a deployment that forgot to set it is inert.
- While closed, **every request under `/api/tourist-visa`** (any method, any path, with or without a token) gets the same answer: HTTP 404 with `{"success": false, "code": "FEATURE_CLOSED", "message": "The Tourist Visa application is not open."}`. Nothing the caller sent is echoed back.
- It answers **before** sign-in checks, body parsing, rate limiting, sessions and any database access. The gate (`backend/middleware/touristVisaFeatureGate.js`) is mounted in `backend/index.js` straight after the CORS check, and is repeated at the top of the Tourist Visa router. It reads no header, body or token, touches no database and **writes nothing to the log**. A closed deployment does not even complain about a missing `FIELD_ENCRYPTION_KEY`.
- The CORS check still runs first, so a browser on an allowed origin can read the closed answer, and a request from an origin that is not allowed is rejected exactly as it is on every other route.
- The code `FEATURE_CLOSED` is how clients tell it from the API's own 404 "you have not started an application yet", which has no code.
- The value is read on each request, but the host only changes it when the backend is restarted or redeployed. Treat a change as needing a restart.

### 4.2 Client gate (client build)

- The form is **open** when no section is held, **or** when the build has `NEXT_PUBLIC_TOURIST_VISA_PREVIEW=true` (`client/src/utils/touristVisaChecklist.ts`). A section is **held** while it has an open `tbc` item (a real unknown) **or** a `draft` marker (a default awaiting senior review). Preview mode still shows everything for testing.
- **Off means unset or any value other than the exact text `true`.** Leave it unset in production.
- It is a `NEXT_PUBLIC_` variable, so it is read **when the client is built**, not at run time. Changing it needs a rebuild and redeploy.
- Preview mode also shows the TBC and Draft badges. Use it in development and on a private test deployment only.

### 4.3 What an applicant sees

Whichever side says closed, a signed-in applicant sees the **same message**, "The application isn't open yet. We're still finalising the questions. Please check back soon.", with Start and Continue disabled and no error box. The client recognises the server's answer by its code (a 404 with `FEATURE_CLOSED`), and never mistakes it for "not started". If the server is switched off while someone has a section open, their next save replaces the form with the same message.

### 4.4 Combinations

| Backend `TOURIST_VISA_ENABLED` | Client build | Result |
| --- | --- | --- |
| unset or not `true` | anything | **Closed. The API is inert.** Applicants see "isn't open yet". **This is the production default.** |
| `true` | no preview, `tbc` or draft items remain | The client says "isn't open yet", but the API is live. **Avoid in production**: a signed-in user could call the API directly and save answers. |
| `true` | preview `true` | Open, with TBC and Draft badges. **Test builds only.** |
| `true` | no preview, no `tbc` and no draft left | **Open. This is the public release.** |

**Production needs both switches to be consistent.** Keep the backend switch off until the client is ready to open too, and turn it on as the last step of a release (section 9.2). With the backend switch off, the earlier caveat that the API accepted saves while the client showed "not open yet" no longer applies: the API refuses everything.

Important: **a draft keeps the client gate closed, exactly like a `tbc` item.** Nothing is ever confirmed silently: the form opens to the public only after someone has removed every `draft` line (and settled every `tbc`) in `shared/tourist-visa/questions.json`. The release check says the same thing: it exits 1 while anything is blocked by a `tbc`, 2 when nothing is blocked but drafts still need senior review, and **0 only when the client would open**. The declaration wording kept under `declarations` in the config (the final submit declaration) is a draft in the same way: it is listed by the release check and holds the form back until its `draft` line is removed. Run the check before every production deploy (section 8) and treat anything other than 0 as "do not release yet".

## 5. Environment variables for production

**Backend (new):**

| Variable | Required | Notes |
| --- | --- | --- |
| `TOURIST_VISA_ENABLED` | No | **Production default: leave it unset** (closed). Set to exactly `true` to open the API, on test deployments and at release (section 9). Listed in `backend/.env.example`. |
| `FIELD_ENCRYPTION_KEY` | Yes, once `TOURIST_VISA_ENABLED=true` | 32 random bytes, as base64 (44 characters) or hex (64 characters). Not needed, and not warned about, while the switch is off. |

Generate one with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rules for the key:

- **Store it safely**, in the host's secret store, and keep a copy in your password manager or vault. It is never in the repository and the feature never logs it.
- **Losing it, or changing it, makes every encrypted answer (2.19, 2.30a, 2.31b, 3.1, 7.2c, 7.3f, 7.6d, the ten Yes/No answers and ten details boxes of Part 9, and 10.1, 10.1a to 10.1f, 10.5 and 10.5a) unrecoverable.** There is no recovery and no key rotation yet; rotation is planned as its own step before real applicants (section 14). Back it up before the first real applicant saves anything.
- Do not reuse the key from a test environment, and use a different key per environment.
- If the switch is on and it is missing or malformed, the server **refuses every section save** with a 503 ("Secure storage is not configured") and logs an error at startup. Nothing is stored in plain text as a fallback. Reading an application only needs the key when it holds encrypted answers.

**Client (new, optional):**

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` | Leave unset in production (section 4.2). Listed in `client/.env.example`. |

Existing variables the feature relies on and does not change: `JWT_SECRET` (sign-in), `MONGODB_URI`, `NEXT_PUBLIC_API_URL`. Do not leave `SESSION_SECRET` unset (see section 11).

## 6. What changed in existing files

Only six existing files were modified. Everything else is new, including `backend/.env.example` (it did not exist before; it names `FIELD_ENCRYPTION_KEY` only).

| File | Change |
| --- | --- |
| `backend/index.js` | Requires the new routes and three small middlewares; mounts the feature switch (`touristVisaFeatureGate`) straight after CORS, before every other middleware; mounts `app.use("/api/tourist-visa", touristVisaRoutes)`; parses Tourist Visa bodies first with log-safe errors (`touristVisaBodyParser`); and wraps the global input sanitizer as `skipPaths(["/api/tourist-visa"], sanitize)`. The sanitizer strips `<` and `>` from every string, which would alter free-text answers, so it is skipped for this one path only. Every other route is sanitized exactly as before. |
| `client/src/components/login-form.tsx` | After sign-in, goes back to the page the visitor came from (`?next=`) when it is a safe same-site path (`client/src/utils/safeRedirect.ts`); otherwise the old defaults (admins to `/admin/users`, others to `/`). |
| `backend/package.json` (and lock file) | `npm test` now runs the backend tests (it was a placeholder), one file at a time (`--test-concurrency=1`); adds the dev dependency `mongodb-memory-server`. |
| `client/package.json` | Adds the `test:unit` script. |
| `client/.env.example` | Documents `NEXT_PUBLIC_TOURIST_VISA_PREVIEW`. |
| `backend/package-lock.json` | Lock file for the dev dependency above. It adds 30 packages (the in-memory database for tests, dev only) and also moved the locked versions of six existing indirect packages: `b4a` 1.6.7 to 1.9.0, `bare-events` 2.6.1 to 2.9.2, `semver` 7.7.2 to 7.8.5, `streamx` 2.22.1 to 2.28.1, `tar-stream` 3.1.7 to 3.2.2 and `text-decoder` 1.2.3 to 1.2.7. These are not used by the Tourist Visa code. If you want the lock file to change by the new packages only, regenerate it from main with `npm install --save-dev mongodb-memory-server@^11.3.0`. |

New at the repository root: `package.json` (scripts only, no dependencies) and `scripts/` (`sync-shared.js`, `check-tourist-visa-release.js`), plus `shared/tourist-visa/`, which is the canonical copy of the config and engine.

New code lives under: `backend/{config,controllers,middleware,models,repositories,routes,services,shared,tests}`, `client/src/app/tourist-visa`, `client/src/components/tourist-visa`, `client/src/components/ui/alert-dialog.tsx`, `client/src/{context,hooks,services,shared,utils}`, and `docs/`. The backend follows the existing layering (routes, controller, service, repository, model).

**API.** Three routes. While `TOURIST_VISA_ENABLED` is not `true` every one of them (and any other path under the prefix) returns the fixed closed answer (section 4.1). When it is, they are all behind the existing `isAuthorized` middleware, and each only ever touches the signed-in user's own application:

- `POST /api/tourist-visa/applications` creates the draft, or returns the existing one.
- `GET /api/tourist-visa/applications/me` returns it, with sensitive answers decrypted for the owner.
- `PUT /api/tourist-visa/applications/me/sections/:sectionId` validates and saves one section.

**Shared copies.** The client and backend are deployed separately, so each carries a generated copy of `shared/tourist-visa/` (`client/src/shared/tourist-visa/`, `backend/shared/tourist-visa/`, each with a `GENERATED.txt`). After editing anything in `shared/tourist-visa/`, run `npm run sync:shared` and commit the copies. A test fails if a copy has drifted.

## 7. Database

The feature adds **one new collection**, `touristvisaapplications` (model `TouristVisaApplication`), with three indexes: one live draft per applicant (unique, partial), `applicant + createdAt`, and `status + createdAt`. It does not read or change any existing collection except `users` (to identify the signed-in user, as the rest of the site does).

Each application records the `configVersion` its answers were collected with. When the config changes, saved answers are never rewritten: the server works out the status of each section when it reads the application, and a section whose answers no longer fit shows as **Needs review**.

**Config `0.10.0-draft` (step 8b-2) and saved answers.** Nothing is deleted or rewritten. Part 10A to 10C is new, so no saved application has any Part 10 answer: its sections simply show as not started, every earlier section and every declaration record keeps its status, and the resume point moves to 10A once Parts 1 to 9 are saved. Reading an application writes nothing. The new answers are encrypted from the first save, so no migration is needed, and no existing question became encrypted (section 10.9). Covered by tests (`touristVisaPart10.test.js`).

**Config `0.9.0-draft` (step 8b-1) and saved answers.** Nothing is deleted or rewritten. Part 9 is new, so no saved application has any Part 9 answer: its sections 9A, 9B and 9C simply show as not started, every earlier section keeps its status, and the resume point moves to 9A once Parts 1 to 8 are saved. Reading an application writes nothing. The new answers are encrypted from the first save, so no migration is needed (section 10.9). Covered by tests (`touristVisaPart9.test.js`).

**Config `0.8.0-draft` (step 7d) and saved answers.** Nothing is deleted or rewritten. The single "date of your UK visa application" (7.2) became a list of visas (7.2a to 7.2c), and the placeholder boxes 7.3a and 7.6a became lists (7.3b to 7.3f, 7.6b to 7.6d). A saved section 7 where 7.1, 7.3 or 7.6 is **Yes** now shows **Needs review**, because the new list is empty; one where all three are No stays saved. The old values (`q7_2`, `q7_3a`, `q7_6a`) no longer have a question: they stay in the database untouched, are not shown, and saving the section again does not remove them. The 7.5 count used to allow 1 to 20 and now allows 1 to 99, so every saved count is still valid. Reading an application writes nothing. All of this is covered by tests (`touristVisaPart78Followups.test.js`).

**Config `0.7.0-draft` (step 7c) and saved answers.** Nothing is deleted or rewritten. A saved section shows **Needs review** only where an old answer now needs a follow-up: section 5 (status self-employed or student; employed, retired, homemaker, not working and other need nothing new, so an application saved as **employed stays saved and every employer answer is untouched**), 6A (6.5 is Yes), 6B (6.6 is Yes), 6C (6.7 is No) and 6D (6.8 is Yes). The old placeholder boxes 6.5a, 6.6a and 6.8a no longer have a question: their text stays in the database untouched and is not shown, and saving the sections again does not remove it. Employer answers saved without a status (an older shape) are kept, waiting for 5.1, rather than removed. All of this is covered by tests (`touristVisaPart56Followups.test.js`).

**Config `0.6.0-draft` (step 7b) and saved answers.** Nothing is deleted or rewritten. Saved sections where an old Yes now needs a follow-up show **Needs review** until they are saved again: section 1 (1.2 or 1.3 is Yes), 2B (2.23 is Yes), 2C (2.30 or 2.31 is Yes, or 2.28 is `with_family_or_friends` or `employer_provided`) and **4C always**, because the new Yes/No in front of the parents is unanswered. The parents that were saved before 4.8 existed stay stored and are not pruned while 4.8 is unanswered. The old single-box answer to 2.23 (`q2_23a`) no longer has a question: it stays in the database untouched and is not shown. Both behaviours are covered by tests (`touristVisaFollowups.test.js`).

**Option values changed in `0.5.0-draft`.** Earlier versions stored placeholder values such as `tbc_married`. Those applications keep every answer, but the sections that used a placeholder now show as Needs review until the applicant saves them again. Until they do, a gate that depended on an old value (for example 4A on `tbc_married`) reads as closed, and the next save of any section prunes the answers it hides. This only affects test data from before the draft lists.

## 8. Running the tests and checks

From the repository root:

```
npm run sync:shared                  # after editing shared/tourist-visa/
npm run check:shared                 # fails if the client or backend copy has drifted
npm run test:shared                  # engine, config and release-check tests (226)
npm run check:tourist-visa-release   # open tbc items and draft lists; exit 1 blocked, 2 drafts only (expected today), 0 clear
```

Backend (needs no database and no `.env`; it starts an in-memory MongoDB, and the test files set `TOURIST_VISA_ENABLED` themselves, so your own `.env` does not matter):

```
cd backend
npm test                             # runs the test files one at a time
```

Two test files cover the server switch: `touristVisaFeatureSwitch.test.js` (every route and every non-`true` value returns the closed answer with no database connected, no model call and no log line; with `true` the routes behave as before) and `touristVisaFeatureSwitchWiring.test.js` (the real `index.js` started with the switch unset and no encryption key: same answer before sign-in and body parsing, readable cross-origin, rest of the API unaffected, nothing logged).

`touristVisaPart10.test.js` covers Part 10A to 10C (step 8b-2): one test for each of the six penalty choices (ticking it asks for its details, unticking removes them from the database), "None of these" refused with another choice, the ticked list and the details stored as ciphertext, the language and the extra-information boxes stored as typed, the National Insurance number stored in capitals with no spaces and encrypted (and a wrong one refused without repeating it), exactly the expected fields encrypted and no earlier question newly encrypted, a ciphertext that cannot be moved to another question, and an application saved before Part 10 staying untouched.

`touristVisaPart9.test.js` covers Part 9 (step 8b-1): one test per gate (Yes needs details, No removes them from the database), the Yes/No answers and details stored as ciphertext while the ticks are not, a ciphertext that cannot be moved to another question, the declaration record (hash, time, user, config version, no IP address), a changed wording asking for the tick again, and an application saved before Part 9 staying untouched.

`touristVisaPart78Followups.test.js` covers the Parts 7 and 8 follow-ups (step 7d): the visa reference, leave reference and breach details stored as ciphertext inside group entries (and nothing else in Parts 7 and 8 encrypted), the 8.1a gate, the cap of 20 listed visits through the real routes, old applications (a Yes shows "Needs review", the old values stay stored, reading writes nothing) and answers waiting for a gate that was never answered. `touristVisaParts78.test.js` covers every gate of Parts 7 and 8 pruning hidden answers on the server, the date rules and the count-driven visits.

`touristVisaPart56Followups.test.js` covers the Parts 5 and 6 follow-ups (step 7c): every new gate pruning hidden answers through the real routes, an old "employed" application staying saved and untouched, old Yes answers showing "Needs review", the old placeholder boxes staying stored, answers waiting for a missing status being kept, and rejected saves changing nothing.

`touristVisaFollowups.test.js` covers the Parts 1 to 4 follow-ups (step 7b): every new gate pruning hidden answers through the real routes, the licence number and treatment text stored as ciphertext, old Yes answers showing "Needs review", and old values with no question any more (and the parents saved before 4.8 existed) staying in the database untouched.

The first run downloads a MongoDB binary (about 75 MB, cached in `backend/node_modules/.cache`), so it needs internet. **Keep at least 1 GB free on the drive that holds the temp folder.** MongoDB refuses writes when under 500 MB are free, and the suite was changed to run serially because running six in-memory databases at once used almost 2 GB and failed on a nearly full drive.

Client:

```
cd client
npm run test:unit                    # pure logic tests
npx tsc --noEmit
npx eslint src/utils src/components/tourist-visa src/app/tourist-visa
npx next build
```

All of these were green at the time of writing (shared 226 tests, backend 216, client 164). The tests use made-up data only.

## 9. Deploying

### 9.1 Deploy with the switch OFF (the production default)

From the repository root, check the branch first. The release check is expected to exit **2** at present (no `tbc` is left, but the drafts are not reviewed); that is what keeps the client closed too.

```
git fetch && git checkout feature/tourist-visa-form && git pull
npm run check:shared
npm run test:shared
(cd backend && npm ci && npm test)            # keep 1 GB free on the temp drive
(cd client  && npm ci && npm run test:unit && npx tsc --noEmit && npx next build)
npm run check:tourist-visa-release            # expect exit 2
```

Then:

1. Merge through your normal pull request. Check `backend/package-lock.json` (section 6).
2. **Backend environment: do not set `TOURIST_VISA_ENABLED`** (or leave it empty). Confirm `JWT_SECRET` and `SESSION_SECRET` are set. You may already generate and store `FIELD_ENCRYPTION_KEY` (section 5) so that opening it later is a single change; it is not used while the switch is off.
3. Deploy the backend.
4. **Client build: leave `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` unset**, then build and deploy.
5. Check it is inert:
   - `curl -i https://<your-api>/api/tourist-visa/applications/me` returns **404** with `"code":"FEATURE_CLOSED"`, with or without a token, and `POST` and `PUT` to the same prefix answer the same.
   - Other routes still work, for example `GET /api/approved-visas` returns 200.
   - The backend log shows nothing about `/api/tourist-visa` requests and no `FIELD_ENCRYPTION_KEY` error.
   - Signed in, `/tourist-visa` shows "The application isn't open yet" with Start disabled.
   - Nothing links to the form.

### 9.2 Turning it ON later

1. Review every draft (section 10; no `tbc` is left): edit `shared/tourist-visa/questions.json`, run `npm run sync:shared`, update the tests, and remove each reviewed `draft` line. `npm run check:tourist-visa-release` must exit **0**. Exit 1 means something is still blocked and exit 2 means drafts are still unreviewed: either way the client stays closed, and you should not release.
2. Add the entry-point links (Footer, Navbar, Services) as a separate change.
3. Generate `FIELD_ENCRYPTION_KEY` if you have not (section 5), store it in the secret store and back it up. **Do not skip the backup.**
4. In this order:
   1. Deploy the backend with the new config and the key set, **still without `TOURIST_VISA_ENABLED`**. The API is still closed.
   2. Build and deploy the client **without** `NEXT_PUBLIC_TOURIST_VISA_PREVIEW`. Its own gate now opens (no `tbc` left), but while the server answers "closed" applicants still see "isn't open yet", so nothing is exposed.
   3. **Set `TOURIST_VISA_ENABLED=true` on the backend and restart or redeploy it. This is the moment the form opens.**
5. Smoke test with a throwaway account: start an application, save a section, and confirm in the database that the passport and ID numbers are stored as `enc:v1:...`. Look at the backend log for errors.
6. **To close it again, instantly and for everyone:** unset `TOURIST_VISA_ENABLED` and restart or redeploy the backend. No client rebuild is needed. Saved data stays in the database.

**Test deployments** (private, never public): backend `TOURIST_VISA_ENABLED=true` and a client build with `NEXT_PUBLIC_TOURIST_VISA_PREVIEW=true`.

**Your own machine:** add the line `TOURIST_VISA_ENABLED=true` to `backend/.env`, and restart the backend. Without it your local backend answers "closed" to every Tourist Visa request.

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

### 10.2 Drafted follow-ups in Parts 1 to 4 (step 7b)

These replaced the earlier `tbc` items and placeholder boxes. They are modelled on the UK online visitor visa application and on what a visa consultancy intake form asks, but they have not been checked against the official form. Each carries a `draft` marker with a short note in the config, a "Draft options" badge in preview mode, and is listed by the release check under "needs senior review". To sign one off, edit the questions if needed and delete its `draft` line. Follow-ups are required when shown unless marked optional.

| Item | What the draft asks | Encrypted |
| --- | --- | --- |
| 1.2 organised group | Yes: name of the group or organiser (required); kind of group (list, optional). | no |
| 1.3 travelling with someone | Yes: up to 10 companions: relationship (list), given names, family name (required); date of birth and nationality (optional). **No passport numbers.** | no |
| 2.3 other names | Optional reason for each name (list); up to 10 names (was 20). | no |
| 2.7 additional email | One additional address, not several. | no |
| 2.23 other nationality | Yes: up to 5 nationalities: country, how acquired (list), currently held (required); when it ended (optional, only if not held). **No identity or passport numbers of another country.** Replaces the old single details box. | no |
| 2.29 living situation details | Shown when 2.28 is `with_family_or_friends`, `employer_provided` or `other`; required when shown. | no |
| 2.30 UK driving licence | Yes: licence number (optional, up to 30 characters). | **yes** |
| 2.31 medical treatment in the UK | Yes: up to 5 treatments: when, what treatment (required); where (optional); paid in full (required); amount still owing (optional, only if not paid in full, up to 100,000). | **treatment text: yes** |
| 4.1 to 4.6 spouse or partner | Shown for married, civil partnership and unmarried partner (unchanged, now a draft). | no |
| 4.8 parents | **New** Yes/No first: "Are you able to give details of your parents?" Yes opens 1 to 4 parents (was up to 20); No asks an optional reason (4.8g). | no |
| 4.8f parent's nationality | No: previous nationality (required) and when it changed (optional). | no |

### 10.3 Drafted follow-ups in Parts 5 and 6 (step 7c)

Same status as section 10.2: each is a `draft` with a short note in the config, listed by the release check, and never confirmed. No answer in Parts 5 and 6 is encrypted. New long-text questions are limited to 2,000 characters (the older long questions keep 5,000). Follow-ups are required when shown unless marked optional.

| Item | What the draft asks |
| --- | --- |
| 5.1 other statuses (5.1a to 5.1l) | **Self-employed:** business name, start date (month and year, not in the future), business address, what the business does (up to 2,000 characters), monthly income after tax, all required. **Student:** name of the school, college or university (required); its address and what is being studied (optional). **Retired:** when you retired and the monthly pension (both optional). **Homemaker, not working, other:** a list "who or what supports you financially" (optional: spouse or partner, parents or other family, savings, benefits or a pension, something else), and a required description (up to 2,000 characters) when the answer is "something else". Only `employed` shows 5.2 to 5.9. |
| 5.9 previous employment | An optional text box (blank means none). |
| 6.1 other income or savings | One choice with a combined choice; `savings` and `savings_and_income` show 6.2; `other_income` and `savings_and_income` show an optional monthly other-income amount (6.1a, up to 1,000,000). |
| 6.5 who is paying | Yes opens up to 5 payers: who (relative, friend, my employer, a sponsoring organisation, someone else), name, relationship to you (list) and the country they live in, all required; amount (optional, up to 1,000,000) and what it covers (optional tick boxes: travel, accommodation, living costs). Replaces the old details box. |
| 6.6 family in the UK | Yes opens up to 10 relatives: relationship (list), given names, family name, nationality and immigration status in the UK (British citizen, settled, pre-settled, work, student, visitor, protection, other, don't know), all required; date of birth (optional). Replaces the old details box. |
| 6.7 no UK address | A No asks for accommodation plans (required: not decided yet, will book a hotel or other paid stay, staying with family or friends, address not known yet, other) and the area or city you expect to stay in (optional). |
| 6.7 stays | Unchanged: stays may not overlap; a gap between stays, or two stays meeting on one day, is accepted. |
| 6.8 public funds | Yes opens up to 5 entries: type (housing benefit, universal credit, child benefit, council tax reduction, other) and when it started (month and year, not in the future) are required; when it stopped (month and year, on or after the start, not in the future) and the amount are optional. Replaces the old details box. |

### 10.4 Drafted follow-ups in Parts 7 and 8 (step 7d)

These resolved the last open items. Same status as sections 10.2 and 10.3: each is a `draft` with a short note in the config, listed by the release check, and never confirmed. Dates are month and year. Follow-ups are required when shown unless marked optional. **Encrypted** fields are marked.

| Item | What the draft asks | Encrypted |
| --- | --- | --- |
| 7.1 / 7.2 UK visas | Yes opens up to 10 visas: date applied (month and year, not in the future, within 10 years) and type of visa (visitor, student, work, family or partner, transit, other) are required; the visa reference is optional (up to 50 characters). Replaces the single date. | **reference: yes** |
| 7.3 leave to remain | Yes opens up to 5 applications (replaces the old details box): date applied (within 10 years), what it was for (work, study, family or partner, protection, long residence, other) and the outcome (granted, refused, withdrawn, waiting) are required; the decision date (not before the application, not in the future) and the application reference (up to 50 characters) are optional. | **reference: yes** |
| 7.5 visits to the UK | A whole number from 1 to 99 (was 1 to 20). **At most the 20 most recent visits are listed**: above 20, exactly 20 entries are asked for. The help text and a note above the entries say so. | no |
| 7.6 breaches | Yes opens up to 5 entries (replaces the old details box): which of the five listed items applies (list), when it happened (month and year, not in the future, **no 10-year limit** because the question says "ever") and the details (up to 2,000 characters) are all required. | **details: yes** |
| 7.7 immigration problems | Unchanged since step 6c; its list of what happened (7.7a) is a draft. | no |
| 8.1 other places | Still a count from 0 to 1000. New: when it is above 0, an optional tick list (8.1a) of which of the six places (Australia, Canada, New Zealand, USA, Switzerland, European Economic Area). An expandable note under 8.1 lists the 30 EEA countries. | no |

**Why only the new fields are encrypted.** The three encrypted fields are all new, so no saved answer exists in plain text. No existing question was made encrypted (section 10.9).

### 10.5 Drafted Part 9 and declaration wording (step 8b-1)

Same status as sections 10.2 to 10.4: every question has a short draft note in the config, is listed by the release check, and is never confirmed.

| Item | What the draft asks | Encrypted |
| --- | --- | --- |
| 9.1 to 9.10 | Yes/No, all required, in three sections: 9A espionage, sabotage and war crimes (9.1, 9.2); 9B terrorism and extremism (9.3 to 9.7); 9C other conduct and character (9.8 to 9.10). A **Yes opens one required "Please give details" box** (up to 2,000 characters, 9.1a to 9.10a). | **yes** (answer and details) |
| 9.11 to 9.14 | A tick the applicant must give, with its guidance shown above it. Each tick comes **before** the questions it covers (9.11 before 9.1, 9.12 before 9.2, 9.13 before 9.3 to 9.5, 9.14 before 9.6 and 9.7), so the guidance is read first; the printout puts the tick after the group, and moving it is a one-line change of order in the config. | no (the record of the tick is kept, see section 2) |

**Where the declaration wording lives.** All the exact words are in `shared/tourist-visa/questions.json`, so the senior can approve or replace them in one place: the four ticks (the tick text is the question `label`, the guidance is its `help`) and the final submit declaration (`declarations.submit.text`, used by the review page in step 8d). They are our own plain words, not copied from the official guidance. To approve a piece of wording, edit it if needed and delete its `draft` line, then run `npm run sync:shared`. Changing the wording of a tick later makes applicants who ticked the old words tick again (section 2).

Current draft wording (generated from the config at the time of writing; the config wins):

| No. | Tick | Guidance shown above it |
| --- | --- | --- |
| 9.11 | I have read the information above about espionage and sabotage. | Espionage means secretly collecting or passing on sensitive information to help another country or group, against the interests of the country it comes from. Sabotage means deliberately damaging or disrupting property, systems or services in order to harm a country or its people. The question below asks whether you have ever been involved in, suspected of, or convicted of either. |
| 9.12 | I have read the information above about war crimes, crimes against humanity and genocide. | War crimes are serious breaches of the rules of war, such as deliberately attacking civilians or mistreating prisoners. Crimes against humanity are widespread or organised attacks on civilians, such as murder, torture or forcing people from their homes. Genocide is acting with the aim of destroying a national, ethnic, racial or religious group. The question below covers both peace time and war time. |
| 9.13 | I have read the information above about terrorist activities, organisations and views. | Terrorism means using or threatening serious violence, or serious damage to property, to influence a government or frighten the public for a political, religious or ideological cause. Being involved includes planning, carrying out, helping, paying for or encouraging it. Supporting an organisation includes being a member, giving it money or other help, or speaking for it. The three questions below cover activities, organisations, and things you have said or published in any form, including online. |
| 9.14 | I have read the information above about extremist organisations and views. | Extremism means holding or promoting views that reject basic values such as the rule of law, equal treatment of people and respect for other faiths and beliefs, including by encouraging hatred or violence against others. The two questions below cover organisations you have belonged to or supported, and views you have expressed in any form, including online. |

**Final submit declaration (draft, step 8d):** I declare that the information I have given in this application is complete and true to the best of my knowledge. I understand that giving false or incomplete information may lead to my application being refused. I agree that Wiser Consulting may call me on the telephone number I gave, to check my answers.

### 10.6 Drafted Part 10A to 10C (step 8b-2)

Same status as sections 10.2 to 10.5: every question has a short draft note in the config, is listed by the release check, and is never confirmed. Part 10D (the documents) is not part of this step.

| Item | What the draft asks | Encrypted |
| --- | --- | --- |
| 10.1 | A required tick list, "At any time have you ever had any of the following, in the UK or in another country?", with the six choices of the printout and one exclusive "None of these" (it cannot be ticked with the others; ticking it clears them, and ticking another clears it). **Each ticked choice opens its own required "Please give details" box** (up to 2,000 characters, 10.1a to 10.1f); unticking a choice removes its box and its answer. The third choice reads "currently on bail or awaiting trial": the word "bail" was hidden on the printout and is our guess. | **yes** (the list and every box) |
| 10.2, 10.3 | Two optional long-text boxes (up to 2,000 characters each), always shown. **10.3 stands alone** and does not depend on 10.2 (the printout does not say). | no |
| 10.4 | A required dropdown: English, Urdu, Punjabi, Pashto, Hindi, Arabic, Bengali, Chinese (Mandarin), Spanish, French, Other. **Other opens a required "Which language?" box** (10.4a, up to 100 characters). | no |
| 10.5 | A required Yes/No, "Do you have a UK National Insurance number?". **A Yes opens a required box for the number** (10.5a). | **yes** (the Yes/No and the number) |

**The National Insurance number.** It is checked against the standard UK format: two letters, six digits and a last letter A, B, C or D. The first letter cannot be D, F, I, Q, U or V; the second cannot be D, F, I, O, Q, U or V; and the prefixes BG, GB, KN, NK, NT, TN and ZZ are refused. The applicant may type it in capitals or small letters and with spaces (`ab 12 34 56 c`); it is stored as `AB123456C` and shown that way when the section is opened again. The error says "Enter a National Insurance number in the format AB 12 34 56 C" and never repeats what was typed. The letter exclusions go a little beyond the prefixes we were asked to refuse (they are part of the standard format); drop them in the `pattern` of 10.5a if the senior prefers the shorter rule.

**What 8b-2 added to the engine.** One small rule, `rules.normalize`, on short text questions: `uppercase_no_spaces` removes every space and capitalises the answer *before* the pattern is checked and before it is stored. The existing `pattern`, `includes` and `exclusive` features from 8b-1 are used as they were. A config check (`validateConfig`) refuses a `normalize` on any other question type or with an unknown name.

**None of 10.1 to 10.5 feeds the cover letter** (section 14.2). Parts 9 and 10A were already decided; the extra-information boxes, the language and the National Insurance number are kept out as well. Nothing in the cover-letter step may read them.

**Encrypted fields so far: 36.** The 27 of steps 7b to 8b-1 plus nine new ones: 10.1, 10.1a to 10.1f, 10.5 and 10.5a. No existing question was made encrypted (section 10.9).

### 10.7 Open items (`tbc`)

**None.** Every item that was a `tbc` is now a draft (sections 10.2 to 10.6). The release check exits 2 (drafts only), not 1.

### 10.8 Every draft at a glance

All 75 drafts (71 questions and 4 groups) in 21 sections, plus the declaration wording, with the note stored next to each in `shared/tourist-visa/questions.json`. The notes are the defaults. Deleting a note after review is what lets its section open. Generated from the config at the time of writing; if it differs from the config, the config wins.

| Section | Item | Default |
| --- | --- | --- |
| 1 | 1.1 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. The value 'tourism' is the one that opens 1.4. |
| 1 | 1.2 | Yes asks for the name of the group or organiser (required) and the kind of group (optional list: tour, school or college, religious, sports or cultural, business, other). |
| 1 | 1.3 | Yes opens up to 10 companions: relationship (list), given names, family name, date of birth (optional) and nationality (optional). No passport numbers are asked. |
| 1 | 1.4 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 2A | group `otherNames` | given names and family name, plus an optional reason (list: maiden name, married name, deed poll, nickname, other). Up to 10 names. |
| 2A | 2.5 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 2A | 2.7 | one additional email address, not several. |
| 2A | 2.8 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 2B | 2.12 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 2B | 2.13 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. Draft mapping: married, civil_partnership and unmarried_partner show section 4A; single, separated, divorced and widowed do not. |
| 2B | 2.23 | Yes opens up to 5 other nationalities: country, how it was acquired (list), whether it is still held, and when it ended (optional). No identity or passport numbers of another country are asked. |
| 2C | 2.28 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. The value 'other' is the one the printout links to 2.29. |
| 2C | 2.29 | shown when 2.28 is with_family_or_friends, employer_provided or other (the cases where ownership is unclear), and required when shown. |
| 2C | 2.30 | Yes asks for the licence number (optional, stored encrypted). |
| 2C | 2.31 | Yes opens up to 5 treatments: when, what treatment (stored encrypted), where (optional), whether the costs were paid in full, and the amount still owing (optional, up to 100,000). |
| 2D | 2.33 | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 2D | 2.35 | Draft option list. The printout shows telephone call and text message (SMS); the messaging app choice is an addition. Needs senior review. |
| 4A | 4.1 | married, civil_partnership and unmarried_partner show section 4A (4.1 to 4.6); single, separated, divorced and widowed do not. |
| 4B | 4.7a | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 4C | group `parents` | a Yes/No first (4.8, can you give your parents' details?). Yes opens up to 4 parents, at least 1; No asks an optional reason (4.8g). |
| 4C | 4.8a | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 4C | 4.8f | No asks for the previous nationality (required) and when it changed (optional). |
| 5 | 5.1 | option list modelled on the UK online application. Only 'employed' shows 5.2 to 5.9. Self-employed asks the business name, start date, address, what it does and monthly income after tax (all required). Student asks the institution (required), its address and the course (optional). Retired asks when you retired and the monthly pension (both optional). Homemaker, not working and other ask who supports you financially (optional list), with a required description when that answer is 'other'. |
| 5 | 5.9 | an optional text box, so the organisation's name is kept and a blank answer means none. |
| 6A | 6.1 | option list modelled on the UK online application; one choice, with a combined choice. 'savings' and 'savings_and_income' show 6.2. 'other_income' and 'savings_and_income' show an optional monthly other-income amount (6.1a). |
| 6A | 6.5 | Yes opens up to 5 payers: who is paying, name, relationship to you and the country they live in (required); the amount (optional, up to 1,000,000) and what it covers (optional tick boxes). |
| 6B | 6.6 | Yes opens up to 10 relatives: relationship, given names, family name, nationality and immigration status in the UK (required); date of birth (optional). |
| 6C | group `accommodation` | stays may not overlap, but a gap between two stays, or two stays that meet on the same day, is accepted (the spec proposes that the next stay starts when this one ends). |
| 6C | 6.7 | a No asks for your accommodation plans (list, required) and the area or city you expect to stay in (optional). |
| 6D | 6.8 | Yes opens up to 5 entries: type of public funds (list) and when it started (month and year) are required; when it stopped (month and year, on or after the start) and the amount are optional. |
| 7 | group `ukVisas` | Yes opens up to 10 visas: date applied (month and year, within 10 years) and type of visa (list) are required; the visa reference is optional and stored encrypted. |
| 7 | 7.3 | Yes opens up to 5 applications: date applied (month and year, within 10 years), purpose (list) and outcome (list) are required; decision date (optional, on or after the date applied) and application reference number (optional, stored encrypted). |
| 7 | 7.5 | the number can be 1 to 99, but only the 20 most recent visits are listed (when it is more than 20, exactly 20 are asked for). |
| 7 | 7.5a | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 7 | 7.6 | Yes opens up to 5 entries: which of the five items (list), when (month and year, no look-back) and details (up to 2,000 characters, stored encrypted), all required. |
| 7 | 7.7a | Draft option list, modelled on the UK online visitor visa application. Needs senior review. The choices are the eight items listed under 7.7. |
| 8 | 8.1 | a whole number from 0 to 1000; a count above 0 shows an optional tick list of which places (8.1a); the EEA help list (the 27 EU states plus Iceland, Liechtenstein and Norway) is an expandable note. |
| 8 | 8.2b | Draft option list, modelled on the UK online visitor visa application. Needs senior review. |
| 9A | 9.11 | the tick and its guidance are our own plain wording, kept here for the senior to approve or replace. Changing the wording makes applicants tick again. |
| 9A | 9.1 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9A | 9.1a | required details (up to 2,000 characters), stored encrypted. |
| 9A | 9.12 | the tick and its guidance are our own plain wording, kept here for the senior to approve or replace. Changing the wording makes applicants tick again. |
| 9A | 9.2 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9A | 9.2a | required details (up to 2,000 characters), stored encrypted. |
| 9B | 9.13 | the tick and its guidance are our own plain wording, kept here for the senior to approve or replace. Changing the wording makes applicants tick again. |
| 9B | 9.3 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9B | 9.3a | required details (up to 2,000 characters), stored encrypted. |
| 9B | 9.4 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9B | 9.4a | required details (up to 2,000 characters), stored encrypted. |
| 9B | 9.5 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9B | 9.5a | required details (up to 2,000 characters), stored encrypted. |
| 9B | 9.14 | the tick and its guidance are our own plain wording, kept here for the senior to approve or replace. Changing the wording makes applicants tick again. |
| 9B | 9.6 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9B | 9.6a | required details (up to 2,000 characters), stored encrypted. |
| 9B | 9.7 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9B | 9.7a | required details (up to 2,000 characters), stored encrypted. |
| 9C | 9.8 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9C | 9.8a | required details (up to 2,000 characters), stored encrypted. |
| 9C | 9.9 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9C | 9.9a | required details (up to 2,000 characters), stored encrypted. |
| 9C | 9.10 | the Yes/No answer is stored encrypted. A Yes opens a required details box. |
| 9C | 9.10a | required details (up to 2,000 characters), stored encrypted. |
| 10A | 10.1 | the six choices are from the printout; 'on bail' in the third choice was partly hidden on the printout and is our guess. 'None of these' cannot be ticked with the others. Each ticked choice opens its own required details box. The answer is stored encrypted. |
| 10A | 10.1a | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10A | 10.1b | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10A | 10.1c | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10A | 10.1d | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10A | 10.1e | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10A | 10.1f | required details (up to 2,000 characters) for this ticked choice, stored encrypted. Removed if the choice is unticked. |
| 10B | 10.2 | optional, always shown, up to 2,000 characters. Not encrypted. |
| 10B | 10.3 | optional, always shown, up to 2,000 characters. It stands alone and does not depend on 10.2 (the printout does not say, so this is our choice). Not encrypted. |
| 10C | 10.4 | Draft option list (the printout does not give one). 'Other' opens a required box for the language. Needs senior review. |
| 10C | 10.4a | required when 10.4 is Other, up to 100 characters. |
| 10C | 10.5 | the Yes/No answer is stored encrypted. A Yes opens a required box for the number. |
| 10C | 10.5a | required when 10.5 is Yes. Spaces and small letters are accepted; the number is stored in capitals with no spaces. The standard UK format is checked (including the letters never used at the start and the prefixes BG, GB, KN, NK, NT, TN and ZZ). Stored encrypted. |
| declarations | `declarations.submit` | Draft wording in our own plain words for the final declaration on the review page (step 8d). The senior approves or replaces it here. |

### 10.9 Other choices we made (not flagged `tbc`)

- **Limits:** 200 characters for short text, 5,000 for long text, 20 entries per group (the spec's proposals, marked as unconfirmed in the config). The long questions added in step 7c (5.1d and 5.1l) are limited to 2,000 characters; lowering the older ones would make saved answers invalid, so they were left alone.
- **Sensitive fields:** 36 answers are encrypted: the national identity card number (2.19), the passport number (3.1), the UK driving licence number (2.30a), the medical treatment text (2.31b), the UK visa reference (7.2c), the leave-to-remain reference (7.3f) the breach details (7.6d), the ten Yes/No answers and ten details boxes of Part 9 (9.1 to 9.10, 9.1a to 9.10a), and, from step 8b-2, the penalties checklist and its six boxes (10.1, 10.1a to 10.1f), the National Insurance Yes/No (10.5) and the number (10.5a). Other personal and financial answers (family names, dates of birth, employer, income, savings) are stored as typed. Decide whether any of those should be encrypted too, but read the limitation below first.
- **Limitation: an existing question cannot simply be made encrypted.** Marking a question `sensitive` only affects answers saved from then on. If any application already holds that answer as plain text, reading it fails ("Your saved answers could not be read", HTTP 500), because the server expects ciphertext for a sensitive field. Making an existing question encrypted therefore needs a one-off migration that encrypts the stored values first (each value is bound to its application and field, so it must be done by the server's own cipher). For this reason steps 7b, 7d, 8b-1 and 8b-2 encrypt **only new fields** (2.30a, 2.31b, 7.2c, 7.3f, 7.6d, the Part 9 answers and the Part 10 answers listed in section 10.6) and change no existing question. **This is a known limitation, and the immigration-problem text (7.7d), the payer details and the other long free-text answers stay unencrypted for the same reason.** Before any real applicant data exists the change is harmless; after that it needs the migration.
- **Sanity rules the spec does not state:** dates of birth and past events cannot be in the future; amounts are in GBP, never negative and capped (5.7, 5.1e, 5.1j, 6.1a, 6.3, 6.4, 6.5f and 6.8e at 1,000,000; 6.2 at 100,000,000; the medical amount owing 2.31e at 100,000); the "past 10 years" limit applies to 7.2a, 7.3b, 7.5b and 8.2d (the leave date), not to 7.6c or 7.7c ("ever"), and trips abroad in 8.2 may overlap.
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

## 14. Roadmap: what is still to build

Planned, **not built**. The order below is the agreed order; step names are working labels and each step still ends with a report and an approval before the next. Two requirements from the senior (14.1 and 14.2) are recorded here and are not started. The approved decisions are listed after the table.

| Step | What | Steps |
| --- | --- | --- |
| 8b | Parts 9 and 10 questions and declarations (drafts; sensitive answers encrypted; ACK declarations recorded with who, when and wording version). **8b-1 and 8b-2 are built**: 8b-1 added the engine features (`includes` condition, `exclusive` checklist option, `pattern` rule), Part 9 and the declaration records; 8b-2 added the `normalize` rule and Part 10A to 10C (10D, the documents, is the upload step 8c) | 2 |
| 8c | Document upload: passport and funds, private storage, expiring links (2 minutes). Through the server, 4 MB per file, PDF/JPG/PNG only, passport up to 3 files, funds up to 10, 40 MB in total; assumes the backend runs on Vercel serverless until the hosting is confirmed, which comes before this step | 2 |
| 8d | Review page and submit (read-only view and lock after submit) | 2 |
| 8e | Admin list and Overview (call details first, view logging) | 2 |
| 8f | Admin edit with an audit trail (reason required, validated by the same engine, old and new values encrypted) | 3 |
| 8g | **Automatic cover letter** (14.2) | 3 |
| 8h | PDF export of the application (Latin text only; no printout is needed as a reference) | 2 |
| 8i | Entry points: links (the Footer points at `/tourist-visa`), and the **assessment modal change** (14.1) | 2 |
| 8j | Security review | 2 |
| 8k | **Key rotation** for the field encryption key (its own step, **before any real applicant data is stored**; it can be done earlier) | 1 |

About 21 steps in all. Earlier drafts of this plan called the PDF export 8g, the entry points 8h and the security review 8i; the cover letter is new, so those three moved down one letter. The order of the other steps is unchanged.

**Approved decisions** (all still drafts until the senior signs them off):

- Uploads, links and PDF: see the rows 8c and 8h above. A document link lasts 2 minutes.
- Part 9 and 10.1: one required details box per Yes (per ticked choice for 10.1); Part 9, 10.1, the 10.5 Yes/No and the National Insurance number are encrypted.
- Declaration record: wording hash, time, user and config version; no IP address.
- Admin edit: only for `submitted` and `in_review` applications, with a reason of at least 10 characters (encrypted), old and new values always encrypted, written in a transaction, with a revision check between admins and a "corrected by our team" marker for the applicant that never shows old values. One admin role sees everything and every view is logged. Notes and flags are in the first version.
- Admins do not see drafts. One application per account. The config is snapshotted at submit. A confirmation email (no answers in it) comes last and is optional. The admin API follows the same switch as the applicant API.

### 14.1 "Get Free Assessment" modal: UK + Tourist Visa goes to the new form (step 8i)

Today the button opens the assessment modal (`client/src/components/AssessmentForm/`, opened from `VisaConsultation.tsx`): personal details, then destination country and visa type, then documents, sent to the old assessment API.

- **Keep** the modal's destination-and-visa-type step.
- **UK + Tourist Visa** no longer continues inside the modal. It leaves the modal for the new form page (`/tourist-visa`):
  - Logged-in users go straight there.
  - Logged-out users go to log in or sign up and **come back to the form**. The login page already honours `?next=`. The **sign-up pages do not yet** (`/register` and the `signup-form` component, and the link from the login page to `/register`), so the link and the page must carry the `next` value through sign-up and use it after registering, with the same same-site check (`safeRedirect`) that login uses.
- **Every other country and visa type keeps the old assessment, unchanged**, including its API.
- The form ends with the document upload step (8c), then the review and submit page (8d).
- **Decided:** the modal keeps its current step order (personal details, then destination and visa type). At the destination step, choosing UK + Tourist Visa turns the button into **"Continue to your full application"**, which leaves the modal for the new form. To confirm when it is built: the exact option values that mean UK and Tourist Visa.
- **Decided:** the new branch is active only once the form is open (the same rule as the entry links, so nothing changes before release); until then UK + Tourist Visa keeps the old assessment.
- Tests: the routing decision for UK + Tourist Visa and for a few other combinations (unchanged), `next` surviving sign-up, an unsafe `next` ignored, and a browser check of the logged-in and logged-out paths.

### 14.2 Automatic cover letter (step 8g, after the admin edit step and before the PDF export)

A cover letter is generated from the applicant's answers when the application is submitted.

- **Deterministic template.** No AI, no invented facts. Every sentence is built only from an answer; text that depends on an answer shows only when that answer exists. A missing answer leaves a visible placeholder (for example "[not provided: planned arrival date]"), never a guess. The same answers always give the same letter.
- **Approval.** The senior approves the template wording before it is built. Like the questions, the template carries a draft marker with a version and is listed by the release check until it is approved. **Decided:** Parts 9 and 10A (the security and penalty answers) never feed the cover letter, and neither do the rest of 10.1 to 10.5 (the extra-information boxes, the language and the National Insurance number). The senior still decides which of the other answers do.
- **Stored encrypted** with the same field cipher, bound to the application. Each generation or edit is a new version; earlier versions stay in the history.
- **Regenerated** when the admin corrects answers (8f). **Decided:** a letter the admin has edited by hand is kept in the history, a new generated version is added, and the admin sees a notice.
- **Editable by the admin**, with a required reason; every edit is logged in the audit trail (admin, time, old and new text encrypted), and two admins cannot overwrite each other (revision check).
- **Downloadable as a PDF** by admins only, and each download is logged. This adds the first PDF output; step 8h reuses it.
- Proposed: admin-only in the first version (the applicant does not see the letter).
- Tests: the same answers give the same text, a missing answer gives a placeholder and nothing is invented, regeneration after a correction, ciphertext in the database, edits logged, and the PDF.

### 14.3 Recommendation for the senior (not part of this feature): MFA for admin accounts

Admins will be able to read every applicant's decrypted answers, including passport numbers and the security-history answers, and to change them. Admin sign-in today is email and password only, with a token kept in the browser. It is recommended to add **multi-factor authentication for admin accounts** before the admin Overview (step 8e) is used with real applicants. It is a change to the existing login, outside the Tourist Visa code, so it is recorded here rather than planned as a step; the view log and the audit trail (steps 8e and 8f) show who looked at or changed what, but do not stop a stolen password.
