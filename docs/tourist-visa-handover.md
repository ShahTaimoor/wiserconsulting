# Tourist Visa form: handover

For the engineer who will review and deploy this. It describes what is built, what is not, how to switch it on, what it needs on production, what it changed in existing files, and what still needs a decision.

Branch: `feature/tourist-visa-form`. Question specification: [tourist-visa-form-spec.md](tourist-visa-form-spec.md). Config version at the time of writing: `0.12.0-draft`. This describes the state after step 8f: the applicant's whole journey is built (fill in the sections, upload the documents, review, submit; sections 2.1 and 2.2), and so is the admin side: a list, an Overview with the call details first, files by a 2-minute link, a status and an activity log (section 2.3), and the **correction of a submitted application's answers with a full audit trail, notes, a call log and flags** (section 2.4). The cover letter, the PDF, the entry points and everything after are still to build (section 14).

## 1. At a glance

- A signed-in user fills in a UK visitor (tourist) visa application, one section at a time, and can leave and come back. Answers are saved on the server per section ("Save and continue").
- It is **not ready to open to the public**. **No `tbc` item is left anywhere** (every real unknown has been turned into a default), but **22 of the 23 sections carry drafts**: 77 defaults we chose (73 questions and 4 repeating groups), each with a short note, that need senior review (section 10.8 lists them all), and the **wording of the final submit declaration** and of **the text shown after submitting** are drafts too. Only the passport section (3) is free of drafts. **The client opens the form only when no section has a `tbc` item and none has a draft**, so an unreviewed default cannot reach the public by accident. Until then the live site shows "The application isn't open yet".
- **Two switches keep it closed** (section 4): the backend variable `TOURIST_VISA_ENABLED`, which is **off unless it is exactly `true`**, and the client's own gate. With the backend switch off, the whole API is inert: every request gets one fixed "closed" answer and nothing is read, stored or logged. **Production must keep both switches consistent.**
- Nothing links to the form yet. It can only be reached by typing `/tourist-visa`.
- It adds five new database collections (`touristvisaapplications`, `touristvisaconfigsnapshots`, `touristvisaaudit`, `touristvisachanges`, `touristvisanotes`) and does not change the data of any existing feature. The only existing collection it reads is `users`.

## 2. What is built

**Questions: Parts 1 to 10 of the spec, in 23 sections** (10D, the documents, is a section of two file questions). Section 4A (spouse or partner) only applies when 2.13 is married, civil partnership or unmarried partner, so an applicant sees 22 or 23 sections, and the dashboard counts only the ones that apply (for example "5 of 22 sections saved").

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
| 10 Penalties and closing questions | 10A convictions and other penalties, 10B extra information, 10C language and National Insurance number, 10D documents (passport and funds files) |

211 questions and 16 repeating groups in all.

**One config drives both sides.** The questions live in `shared/tourist-visa/questions.json` and the rules in `shared/tourist-visa/engine.js`. The client form and the server validation both run the same engine, so they cannot disagree. Changing a question, an option list or a condition means editing the JSON, not code.

**Save and resume.** Each section is validated and saved on its own. The dashboard (`/tourist-visa`) shows every section as saved, not started or needs review, and "Continue" goes to the first section that is not done. A saved section is flagged "needs review" automatically when something it depends on changes (for example, moving the leave date in section 1 flags the accommodation dates in 6C).

**Gates (a Yes/No or a choice decides what appears).** When an answer changes and hides questions, the server removes the hidden answers from the database. Examples: 2.13 relationship status shows or hides the whole of section 4A; 5.1 employment status shows its own block of questions (employed: 5.2 to 5.9; self-employed, student, retired, and homemaker / not working / other each have theirs, section 10.3); 6.1 shows 6.2 for savings and an optional monthly other-income amount (6.1a) for other income; a Yes on 1.2, 1.3, 2.23, 2.30 or 2.31, or on the new 4.8 ("can you give your parents' details?"), opens its follow-up questions (section 10.2); a Yes on 6.5, 6.6 or 6.8, and a No on 6.7, open structured follow-ups (section 10.3); a Yes on 7.1, 7.3 or 7.6 opens a list of entries (visas, leave-to-remain applications, breaches), and 7.4, 7.7 and 8.2 open their questions and groups; a number above 0 at 8.1 shows the optional tick boxes of 8.1a (section 10.4); each of the ten Yes/No questions of Part 9 (9.1 to 9.10) opens a required details box on a Yes (section 10.5); in 10A **each ticked choice of 10.1 opens its own required details box** and unticking it removes the box and its answer, while the exclusive choice "None of these" cannot be ticked with the others; Other at 10.4 opens a required "which language" box and a Yes at 10.5 opens a required box for the National Insurance number (section 10.6). A section with no visible question is hidden everywhere (dashboard, progress count, Back and Next, direct address) and cannot be saved. **An answer that is hidden only because its gate has never been answered is kept, not removed**: when a new Yes/No is put in front of questions that already hold saved answers (as 4.8 was put in front of the parents), those answers wait, untouched, until the Yes/No is answered.

**Repeating groups.** Add another and Remove for companions (1.3, up to 10), other names (2.3, up to 10), other nationalities (2.23, up to 5), medical treatments (2.31, up to 5), dependants (4B), parents (4C, opened by 4.8, 1 to 4), payers (6.5, up to 5), relatives in the UK (6.6, up to 10), places of stay (6C), public funds received (6.8, up to 5), UK visas issued (7.2, up to 10), leave-to-remain applications (7.3, up to 5), breaches of UK immigration law (7.6, up to 5), immigration problems (7.7) and other-country trips (8.2). The UK visits (7.5a to 7.5c) are count-driven: the number typed at 7.5 (1 to 99) decides how many visit entries there are, with no Add or Remove, **but at most the 20 most recent visits are listed**: a number above 20 asks for exactly 20 entries, the question's help text and a note above the entries say so, and the number typed is stored as given.

**Cross-section and date rules.** Passport expiry (3.4) must be after the issue date and after the planned leave date (1.7). Places of stay must fall inside the travel dates (1.6 to 1.7) and must not overlap. Past-event dates cannot be in the future, and "in the past 10 years" dates cannot be older than 10 years.

**Encryption at rest.** 36 answers, and the original file name of every uploaded document, are encrypted: the national identity card number (2.19), the UK driving licence number (2.30a), the medical treatment text (2.31b), the passport number (3.1), and, new in step 7d, the UK visa reference number (7.2c), the leave-to-remain application reference number (7.3f) and the breach details (7.6d), and, new in step 8b-1, the ten Yes/No answers of Part 9 (9.1 to 9.10) and their ten details boxes (9.1a to 9.10a), and, new in step 8b-2, the penalties checklist (10.1) and its six details boxes (10.1a to 10.1f), the National Insurance Yes/No (10.5) and the number itself (10.5a). The original name of each uploaded file (section 2.1) is encrypted the same way. The four declaration ticks (9.11 to 9.14), the two extra-information boxes (10.2, 10.3) and the language (10.4, 10.4a) are not encrypted. A National Insurance number is stored in capitals with no spaces, whatever the applicant typed. The medical text and the three Part 7 answers sit inside group entries, and each entry is encrypted on its own. They are encrypted before they are stored (AES-256-GCM, stored as `enc:v1:...`). The ciphertext is bound to the application and the field, so it cannot be copied into another field or entry. Everything else is stored as typed. Answers are never written to logs, localStorage, Redux, URLs, the console or analytics.

**Interface.** Accessible labels, errors and focus handling, an error summary, light and dark mode, and a layout that works at 375 px. Leaving a section with unsaved changes opens a dialog in the site's own style ("Stay on this page" / "Leave without saving"); saving shows a "Section saved" toast. The feature uses no native browser alert, confirm or prompt.

**Declarations.** A tick the applicant must give (type `ACK`, the four of Part 9) records what was agreed: the SHA-256 hash of the exact words shown (the tick text and its guidance), the time, the user and the config version, on the application as `declarations.<question id>`. No IP address or browser data is kept, and the applicant is never sent the records. If the wording is later changed in the config, a tick given for the old words is shown unticked and its section shows "Needs review" until it is ticked again; the stored answer is not touched. The exact wording of the ticks and of the final submit declaration lives in one place, `shared/tourist-visa/questions.json` (section 10.5).

**Documents (steps 8c-1 and 8c-2).** The passport copy and the proof of funds are uploaded through the server to private storage, from the documents page (section 10D). Details in section 2.1.

**Preview markers.** In preview mode (section 4) a question or repeating group shows a **TBC** badge when it has a real unknown, and a **Draft options** badge when it carries a draft (an option list, follow-up questions or a rule we chose).

**Tests.** See section 8.

### 2.1 Document uploads (backend step 8c-1, page step 8c-2)

The backend was built in step 8c-1 and the page in step 8c-2. Nothing outside the application links to it yet. It sits behind the same switches as everything else (section 4): while `TOURIST_VISA_ENABLED` is not `true`, all three routes answer the fixed 404 `FEATURE_CLOSED`, before any file is read.

**Routes** (under `/api/tourist-visa`, signed-in user, own application only):

| Route | What it does |
| --- | --- |
| `POST /applications/me/documents` | One file per request, `multipart/form-data` with two parts: `slot` (`passport` or `funds`) and `file`. Answers 201 with the new file's metadata. |
| `GET /applications/me/documents` | The applicant's files (metadata only) and the limits, so the screen can show them. |
| `DELETE /applications/me/documents/:docId` | Deletes one file from the draft and from storage. |

The applicant is only ever sent `id`, `slot`, `name`, `size`, `type` and `uploadedAt`. **No link, no URL and no storage id (public id) is ever returned**; `GET /applications/me` shows the same metadata in its `documents` list. The routes are `/applications/me/documents` (not `/application/documents`) to match the existing `/applications/me/...` routes.

**Limits** live in one file, `backend/config/touristVisaDocuments.js`; change a number there and everything follows.

| Limit | Value |
| --- | --- |
| Types | PDF, JPG, PNG, decided by the file's first bytes, never by its name or the type the browser declared. A text file renamed `.pdf` is refused; a real PNG named `.pdf` is accepted as a PNG. |
| Size of one file | **4 MB**. Empty files are refused. |
| Files | passport (10.6): up to 3; funds (10.7): up to 10. Total of all files of one application: 40 MB. |
| Temporary link | 2 minutes |
| Upload rate | 40 uploads per hour per signed-in user (in memory per server process, like the other limiters here) |

**Why 4 MB, and the Vercel note.** The backend may run on Vercel serverless, where a request body cannot be larger than 4.5 MB; a 4 MB file plus its multipart wrapper stays under that. **On a normal server (not serverless) the limit can be raised to 5 MB:** change `MAX_FILE_BYTES` in that one file. The route reads one file per request, in memory, with multer's limits set so an oversize file is stopped as it arrives (the declared length is checked first). Hosting is still to be confirmed before 8c-2; if the backend does not run serverless, a larger limit and direct-to-storage uploads can be reconsidered.

**Error codes** (sent as `code` next to the usual `message`; the messages are fixed text, so nothing the caller sent comes back): `WRONG_TYPE` (415), `FILE_TOO_LARGE` (413), `FILE_EMPTY`, `FILE_REQUIRED`, `INVALID_SLOT`, `INVALID_UPLOAD` (400), `TOO_MANY_FILES`, `TOTAL_TOO_LARGE`, `DOCUMENTS_LOCKED` (409), `DOCUMENT_NOT_FOUND`, `APPLICATION_NOT_FOUND` (404), `TOO_MANY_UPLOADS` (429), `UPLOAD_FAILED` (502), `STORAGE_UNAVAILABLE` (503). `AppError` gained an optional `code` for this; responses of every other route are unchanged.

**Section 10D, the page (step 8c-2).** Section 10D "Documents" is the last section of Part 10 and has two `FILE` questions, both drafts: **10.6 "Your passport or travel document"** (slot `passport`, up to 3 files; a clear scan or photo of the page with your photo and personal details) and **10.7 "Evidence of funds"** (slot `funds`, up to 10 files; documents showing money you can clearly access, for example recent bank statements). "Save and continue" on 10C goes to 10D; the dashboard lists it as the last row of Part 10. The page shows each slot with its guidance, the accepted types and limits (read from `GET .../documents`, never written in the client), the files uploaded so far (name, type, size, time), an Upload button per slot and a Remove button per file. One file goes up per request; the browser first checks type and size and says why in plain words, and the server (which looks at the real content) stays the authority: every code of section 2.1 has its own message. Removing a file asks first, in the site's own dialog. If the applicant tries to leave while a file is still uploading, the site's own "unsaved changes" dialog asks (the upload is cancelled if they leave). Results are announced in a live region and as toasts (fixed wording, never a file name), keyboard focus moves to the new file or back to the slot's Upload button, and the layout holds at 375 px in light and dark. No native alert, confirm or prompt is used, and the applicant never sees a link, a URL or a storage id.

**The file question type.** `FILE` was already in the engine's type list; 8c-2 gave it its rules. A `FILE` question needs a `slot` (lower-case letters, one question per slot) and may have no options, rules, condition, group or encryption. It stores **nothing** in the answers: its id is not an answer key (a request that sends one is refused like any unknown key), pruning ignores it, and `required` means "at least one file before the application can be submitted". The engine gained `getFileQuestions`, `isFilesOnlySection`, `documentsStatus` and `documentsComplete` (all in `shared/tourist-visa/engine.js`, with types).

**Status of 10D.** It is worked out from the files, never stored: **Not started** (no file), **In progress** (one slot has a file), **Saved** (both slots have at least one). The server computes it when it reads the application (a new `in_progress` status) and the dashboard computes the same from the file list, so they agree; "Saved" counts in "x of y sections saved". A draft can always be saved and left without files: `PUT /applications/me/sections/10D` is refused (400, "This section has no answers to save") because there is nothing to save. The resume point stays on 10D until another section needs attention, and 10D is the last section, so it is also where an applicant with everything saved resumes.

**For the submit step (8d).** The rule "both documents are required" is enforced at submit, not on save. The application the applicant reads has `documentsComplete` (true when every file question has at least one file), and the same rule is `engine.documentsComplete(config, documents)`. Step 8d must refuse to submit until it is true.

**Developer tool: `backend/scripts/tourist-visa-doc-link.js`.** Before the admin Overview existed (step 8e, section 2.3) this was the only way to open an uploaded file; it is still there for testing the private storage by hand, and the only way to do that without the admin pages. It is not a route and nothing calls it. `node scripts/tourist-visa-doc-link.js <applicationId> <documentId> --confirm` prints the two ids, the time the link expires and a signed link that works for 2 minutes (the ids are in the database, or the document id is the `id` that `GET .../documents` shows). It **refuses to run without `--confirm`** (or `TOURIST_VISA_DOC_LINK_CONFIRM=yes`), because the link opens a real applicant's file for anyone who holds it; it reads `backend/.env` only after that check, prints only the ids, the expiry and the link (the link carries the API key and a signature, never the secret, and the tool refuses to print a link that contains one), and shows only an error's code or type on failure, never its message. It writes nothing anywhere: it is not a record of who opened a file, which is why the admin route (section 2.3) writes an audit row for every link it makes. It is for developer machines; do not use it on a pasted command line.

**Locking and limits.** Uploads and deletes are allowed only while the application is a draft; a submitted (or later) application answers `DOCUMENTS_LOCKED`. The per-slot count, the total size and the draft status are checked **in the same database write that adds the file**, so two uploads at the same moment cannot both pass a check that only one should. The server also checks before it stores anything, so a refused file is never uploaded.

**No file is left behind.** If the database write does not happen (a limit hit by a parallel upload, the application submitted a moment ago, or a database error), the stored file is deleted again. Deleting a file removes the reference first and then the stored file (best effort); a failed delete is logged with the application and file id only, never a file name or any personal detail.

**Storage: Cloudinary, private.** Files are uploaded as type `authenticated` (no plain delivery URL exists), into the folder `tourist-visa/<applicationId>/`, with a random 32-character public id plus the extension of the detected type. **The original file name is never part of the storage id.** The resource type is **`raw`** for all three file types. Reason: a raw file is stored exactly as sent and never processed, and Cloudinary's account setting that restricts delivery of PDFs (and ZIPs) as images does not apply to raw files, so one path works for PDF, JPG and PNG alike. Delivery is a **signed download link with an expiry** (Cloudinary's `private_download_url` with `expires_at`), not a delivery URL: the signature covers the expiry, so it cannot be extended. The module is `backend/config/touristVisaStorage.js`; it passes its credentials with every call and does not change the global Cloudinary setup that the public assessment uploads use.

**Temporary links (admin only).** `touristVisaDocumentService.getTemporaryLink(applicationId, docId)` returns `{ url, expiresAt }` for a link that works for 2 minutes. It is **not reachable from any applicant route**. Since step 8e exactly one route calls it, `GET /api/tourist-visa/admin/applications/:id/documents/:docId/link`, behind the admin checks and with an audit row written first (section 2.3). It is covered by tests, including that no applicant path hands out a link.

**Data.** `documents[]` on the application now holds `id` (our own random id, the only identifier an applicant sees), `slot`, `publicId`, `resourceType`, `format`, `bytes`, `mime`, `uploadedAt` and `originalName`. **The original name is encrypted** with the field cipher, bound to the application and the document (`<applicationId>:documents.<docId>.originalName`), so a name cannot be moved to another file. The name is cleaned for display (no folders, control or direction-changing characters, at most 150 characters; an empty name becomes `document.<ext>`). The earlier `documents` shape (`kind`, `size`, `mimetype`) was never written by any code, so nothing needs migrating.

**Where it lives.** `backend/config/touristVisaDocuments.js` (limits, types, error codes), `backend/config/touristVisaStorage.js` (Cloudinary), `backend/services/touristVisaDocumentService.js`, `backend/controllers/touristVisaDocumentController.js`, `backend/middleware/touristVisaUpload.js` (multer and the rate limiter), `backend/utils/{detectFileType,documentError,touristVisaDocumentView}.js`, and the three routes in `backend/routes/touristVisaRoutes.js`. The repository gained the guarded add and remove.

**Parsers.** `touristVisaBodyParser` refuses any body that is not JSON; it now lets exactly `POST /applications/me/documents` through when the body is multipart, and multer reads it. The global JSON and URL-encoded parsers ignore multipart bodies, and the HTML sanitizer was already skipped for `/api/tourist-visa`. Every other Tourist Visa route still answers 415 to a multipart body. This is tested through the same middleware order as `index.js` and through the real `index.js`.

**What is not yet proven.** Neither step ran against real Cloudinary: the tests and the browser check use a fake storage, and the real adapter is tested for what it asks of the SDK and for the signed link's shape and expiry. One real upload of each type, one real signed download (with the developer tool above), the 2-minute expiry and one real delete must be done against the test Cloudinary account before the upload page is trusted; the steps are in section 14.4. The choice of `raw` is the one to watch: if Cloudinary refuses `authenticated` raw files on the account's plan, the fallback is `image` for JPG and PNG and `raw` for PDF, which is a change in `touristVisaStorage.js` only (the stored `resourceType` already travels with each file).

**Not covered here (security review, step 8j).** Files are not scanned for malware, and a PDF can contain active content: they must only ever be offered as downloads from the private link, never displayed inline from our own site. The rate limit is per server process.

### 2.2 Review and submit (step 8d)

**The applicant's flow.** The dashboard shows a "Review and submit" card. It is enabled only when every section that applies is complete and both documents are uploaded; otherwise it says what is still missing, section by section, with a link to each. "Review and submit" opens `/tourist-visa/review`: every part and section in order with an **Edit** link back to it, the files by name and size, the Part 9 ticks as given (with the date), then the **final declaration** (the wording of `declarations.submit`, with a Draft badge in preview mode), a required tick and a **Submit application** button. Submit opens the site's own dialog ("Submit your application? You will not be able to change it afterwards."); no native alert, confirm or prompt is used. The page can be visited by address at any time; while something is missing it shows the review and the list of what is missing, and Submit stays disabled. After a submit the page shows the **confirmation** (focus moves to its heading, and a live region and a toast announce it): the application's reference, "Submitted on <date>", "What happens next" and the declaration, followed by the same review with every edit control gone. The dashboard then shows the reference and a "View your application" link, with no Continue button and no section links.

**Read only after submit.** Any section address (`/tourist-visa/2A`, `/tourist-visa/10D` and so on) goes straight to the review page for a submitted application, never to a form. The server enforces it too: saving a section, uploading and deleting a file all answer the locked error (409), and a second submit answers 409 `ALREADY_SUBMITTED`. There is no withdraw or reopen: that is for an admin only (step 8f).

**One builder for every view: `shared/tourist-visa/view.js`** (with `view.d.ts`; synced to the client and the backend like the engine, and covered by the drift check). `buildReview(config, answers, documents, declarations)` is a pure function with no UI or server code in it. It returns the ordered parts, sections and rows: only questions that are visible, option labels instead of codes, dates written out ("1 March 2027"), amounts ("£1,500"), Yes and No, each repeating-group entry as its own numbered item ("Parent 1"), files as a name and a size, and a declaration tick as "Confirmed on <date>". Sensitive answers pass through as plain text, because the server decrypts before it calls the builder. It can never contain a link, a URL or a storage id: it is only ever given a file's name and size. The applicant's review page uses it now; **the admin Overview (8e) and the PDF (8h) must use the same function**, so the three always agree.

**The review is built on the server** (`GET /applications/me/review`), from the decrypted answers, and sent to the owner only. For a draft it uses the live config; for a submitted application it uses **the config it was submitted under** (below), so a later change to a question, an option label or the declaration wording never changes what the applicant sees of what they submitted. The answer carries `review`, `status`, `reference`, `submittedAt`, `configVersion`, `documentsComplete` and `declaration` (its wording and when it was accepted). The ordinary `GET /applications/me` also returns the status, `submittedAt` and the `reference`.

**The submit: `POST /applications/me/submit`**, body `{ "declarationAccepted": true }`, behind the feature gate and sign-in. The server first re-checks **everything against the current config**, and nothing is submitted unless all of it passes:

- every section that applies is saved and its stored answers still pass the rules (a section that was never saved, needs another look, or whose answers no longer validate counts);
- the documents are complete (`documentsComplete`: a file in every slot);
- every Part 9 tick still matches the current wording (a tick given for other words counts against its section);
- `declarationAccepted` is exactly `true`.

If anything fails, the answer is **422 `NOT_READY`** with `sections: [{ id, problems }]` (a section id and how many things in it need attention, in form order) and `declarationMissing`. It never contains an answer or a value. Other answers: 400 `INVALID_REQUEST` (the body is not exactly that shape), 404 `APPLICATION_NOT_FOUND`, 409 `ALREADY_SUBMITTED`, 409 `APPLICATION_CHANGED` (it changed three times while being submitted), 503 `REFERENCE_UNAVAILABLE` (no free reference found; nothing was submitted). The client turns each into plain words (`client/src/utils/touristVisaReview.ts`); for a 422 it lists the sections that need attention, each linking to its section.

**One atomic write.** draft -> submitted is a single conditional database write that matches only if the application is still the applicant's draft **and has not changed since it was checked** (it compares `updatedAt`), so what was checked is what is submitted. Of two submits at the same moment exactly one wins; the other is told 409 `ALREADY_SUBMITTED`. If the application changed between the check and the write, the server checks again (up to three times) instead of submitting something it did not check.

**What the submit records.** `status: submitted`, `submittedAt`, a **reference**, `configSha256` and `configVersion`, and `declarations.submit`: the same record as the Part 9 ticks (the SHA-256 of the exact wording of `declarations.submit`, the time, the user, the config version; **no IP address**). Nothing else changes: the answers, the files and the Part 9 records are left exactly as they were.

**The reference** is `TV-` and eight characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 characters: no 0, O, 1, I or L, so it can be read out over the phone), for example `TV-K7M2QX9P`: about 850 billion possibilities, drawn with `crypto.randomInt`. It has a **unique index** (applications without one are not in it); if a reference is already taken the server draws another (up to five times, then answers 503 and submits nothing). The reference is a label to quote, not a secret and not a credential: nothing is ever looked up by it from the applicant side.

**The config snapshot.** The exact `questions.json` the application was submitted under is stored as text in its own collection, `touristvisaconfigsnapshots`, with the SHA-256 of that text as its `_id` (plus `version` and `createdAt`). It is written once per distinct config (an upsert that only inserts), never changed, and holds only the form's questions: no answer and nothing about an applicant. The application stores `configSha256` and `configVersion`. **Later views (the admin Overview, the PDF) must render a submitted application with its snapshot** (`touristVisaApplicationService.configOf(application)` does this; it falls back to the live config only for a draft) and must not use the live config for a submitted application.

**Logging.** A submit writes one log line at most (in development only) with the application's id and nothing else; a refusal's response and the log carry section ids and counts only, never an answer, and a database error is turned into a plain 500 by the same log-safe handler as the other routes.

**Draft wording.** The final declaration (`declarations.submit`) and the steps shown after submitting (`afterSubmit`) are our own plain words, kept in `questions.json`, both with a draft note: the release check lists them and the client form stays closed until the senior approves or replaces them. The release check also proves the review page can be built from the config.

**Not built in this step:** the admin screens (built in 8e, section 2.3), withdrawing or reopening (8f, admin only), the cover letter (8g), the PDF (8h) and a confirmation email.

### 2.3 The admin side: list, Overview, files, status and activity (step 8e)

Read only, plus a status. **Correcting answers, notes, calls and flags were added in step 8f and are described in section 2.4**; this section describes what step 8e built, with the small changes 8f made to it noted in place.

**Who gets in.** Every route is under `/api/tourist-visa/admin/*` and sits behind, in this order: the feature switch (the same fixed 404 `FEATURE_CLOSED` as every other route while `TOURIST_VISA_ENABLED` is not `true`), `noStore`, `isAuthorized` (no or a bad token: 401) and `isAdmin` (a signed-in user who is not an admin: 403). The role is read from the database on every request (`role` is the number `1`), so taking the role away from an account works at once, even for a token that was already issued. **Every admin answer, including the refusals, carries `Cache-Control: no-store`.** Errors are log-safe like the rest of the feature: the response and the log hold a code, never an answer, a name, a file name or a link.

| Route | What it does |
| --- | --- |
| `GET /admin/applications` | The list. Query: `status` (`submitted`, `in_review` or `completed`), `flag` (one of the five admin flags, 8f), `q` (search, at most 100 characters), `page`, `pageSize` (default 20, at most 50). A bad value is 400 `INVALID_QUERY`. |
| `GET /admin/applications/:id` | The Overview. |
| `GET /admin/applications/:id/documents/:docId/link` | A link to one file that works for 2 minutes. |
| `PATCH /admin/applications/:id/status` | Moves the status. Body `{ "status": "in_review" }`. |
| `GET /admin/applications/:id/activity` | The activity log of one application, newest first (up to 100). |

**Drafts are invisible to admins.** The list never contains a draft, and a draft's id, an unknown id and an id that is not an id all answer the same 404 `APPLICATION_NOT_FOUND`. Only `submitted`, `in_review` and `completed` applications can be listed, opened, linked or moved.

**The list.** Newest submission first. A row holds the id, the reference, the applicant's name, email and telephone number, `submittedAt`, the status, the number of files and (8f) the admin flags. Search is a case-insensitive match: a text of the shape `TV-` plus eight letters or digits is matched as a whole **reference**; anything else is matched as "contains" against the name and the email. **The typed text is escaped before it is used**, so `.*` or `(` match only themselves, and the query is a plain string (never an object). The list is one aggregation that counts and pages in the same query.

**The summary on the application.** To keep the list from decrypting or scanning answers, the application carries a small copy of who the applicant is: `summary: { name, email, phone }` (name is "given family", email in lower case, phone as "+44 7700 900123"). It is written **at submit** by the same write that submits. An application submitted before 8e has none: the list fills it in **lazily, once**, the first time it is listed or opened (at most 50 per request, and the write only happens if `summary` does not exist yet, so it can never overwrite one). **These four answers (2.1, 2.2, 2.4 and 2.32) are not encrypted fields**, so the summary stores no plain copy of a secret; it is a second plain copy of data that is already stored plain. If any of them is ever made an encrypted field, the summary must stop storing it. **Step 8f refreshes the summary in the same transaction whenever an admin corrects one of those answers** (section 2.4), so the list never shows an old name, email or number.

**The Overview.** Built on the server from the decrypted answers with the shared `buildReview` (section 2.2), using **the config snapshot the application was submitted under** (`configOf`), never the live config. It returns:

- `application`: id, reference, status, `submittedAt`, `configVersion` and `allowedMoves` (the status moves open from here);
- `call`: the **call block** for the first phone call: name, telephone (shown, and as a `tel:` value), email, **preferred language** (10.4, or the language typed at 10.4a for "Other"), the contact preferences (where the applicant is, the kind of number, how they want to be contacted: 2.33, 2.34, 2.35 and the email check 2.9), the reference, `submittedAt` and the status;
- `review`: every part and section as the applicant gave it, in words;
- `documents`: each file's id, slot, **name**, size and type, and `fileSlots` (which file question each slot belongs to);

and **never a link, a URL, a storage id or an encrypted value**. The decrypted answers go to admins only, and only through this route.

**Files.** The page shows each file by name and size with an **Open** button. Pressing it asks the server for `/documents/:docId/link`, which calls the existing `documentService.getTemporaryLink` (the storage's signed link, **2 minutes**); that is **the only way a link leaves the server**. The page opens the link in a new tab straight away, does not show or keep it, and does not log it. If the browser blocks the new tab, a link appears next to the file for 90 seconds. A file that is not on the application is 404 `DOCUMENT_NOT_FOUND`.

**Status.** Only these moves are allowed: `submitted` to `in_review`, `in_review` to `completed`, and `completed` back to `in_review`. Anything else is 409 `INVALID_STATUS_MOVE`, a body that is not exactly `{ "status": <one of the three> }` is 400 (`INVALID_REQUEST`, `INVALID_STATUS`), and a status that changed between the check and the write is 409 `STATUS_CHANGED` (the write is conditional on the status the move started from, so two admins cannot both win). A draft cannot be moved. The page asks first, in the site's own dialog ("Start reviewing this application?" and so on); there is no native confirm. The status is not a lock: the applicant side already treats every non-draft as read only.

**The audit log: collection `touristvisaaudit`** (model `TouristVisaAudit`). One row for each of:

| `action` | Written when | Extra fields |
| --- | --- | --- |
| `list_view` | An application was shown on a page of the list. **One row for each application on the page**, so a page of 20 writes 20 rows (a default we chose: the alternative is one row per list request). | none |
| `overview_view` | The Overview was opened. Exactly one row for each view. | none |
| `document_link` | A file link was requested. | `documentId` (the id only, never the name, the link or the storage id) |
| `status_change` | The status was moved. | `fromStatus`, `toStatus` |

Every row has `adminId`, `applicationId`, `action` and `at`. **A row never holds an answer, a name, a file name, a link or an IP address**, and a test checks the exact set of fields and scans the stored rows for values. **Fail closed:** the audit row is written *before* the data leaves the server, and if it cannot be written the admin gets a plain 500 and no data (for a status change the move is undone). **Append only, as far as the application can make it so:** the model refuses every update and delete operation and every save of an existing row; the repository has two functions, `append` and `findByApplication`; and no route can change or remove a row. **The database itself does not enforce this** (anyone with write access to the collection can still change it): see section 14.5. Reading the activity log is **not** itself audited.

**The pages** (admin area, same layout and menu as the other admin pages):

- `/admin/tourist-visa`: a table on wide screens and one card per application on a phone, a search box, a status filter, Clear, previous and next with the page count, and loading, empty and error states. A result count is announced to screen readers.
- `/admin/tourist-visa/<id>`: the call block first (a large `tel:` button, a Copy number button, language, contact preferences, reference, date, status), the status buttons, a jump list to every section and to Activity, the whole application, and the Activity panel (who opened the Overview, a file, or changed the status, and when).
- **The menu entry "Tourist Visa" appears only when the Tourist Visa form is open or in preview mode** (the applicant pages' rule), and both pages say "isn't open yet" otherwise.
- The pages reuse the applicant's `ReviewSummary` (with an optional way to draw the files), the site's `ConfirmDialog` and toasts, and add no native alert, confirm or prompt.

**Not in step 8e (8f built the first three, section 2.4):** editing answers, notes and flags, and a "corrected" marker. Still to build: the cover letter (8g), the PDF (8h), a confirmation email, admin MFA, and retention of the audit log (section 14.5).

### 2.4 Correcting answers, notes, the call log and flags (step 8f)

An administrator can correct the answers of a **submitted** application, keep notes and a call log, and flag it. Everything is behind the same chain as section 2.3 (feature switch, `noStore`, `isAuthorized`, `isAdmin`), every answer carries `Cache-Control: no-store`, and every read of decrypted answers, of the history or of the notes is written to the audit log **before** it is returned.

| Route | What it does |
| --- | --- |
| `GET /admin/applications/:id/edit-form` | What the Edit forms need: the **config the application was submitted under**, its decrypted answers and its `revision`. Audited as `edit_open`. A completed application is 409. |
| `PUT /admin/applications/:id/changes` | Body `{ expectedRevision, reason, changes, dryRun? }`. A dry run previews; a real call corrects. |
| `GET /admin/applications/:id/changes` | The history, newest first, with the reason and the old and new values in words. Audited as `changes_view`. |
| `GET`, `POST /admin/applications/:id/notes` | The notes and the call log; add a note or a call. Audited as `notes_view` and `notes_add`. |
| `PUT /admin/applications/:id/flags` | Body `{ flags: [...] }`. Audited as `flags_change` with the old and the new list. |

There is still **no route that updates or deletes** an audit row, a change record or a note.

**The revision.** Every application has a numeric `revision` (0 for every application saved before 8f: a missing field counts as 0). Every successful correction adds one. The request quotes the revision the admin was looking at (`expectedRevision`); if it is not the current one the answer is **409 `REVISION_CHANGED`** and nothing is written, so two admins cannot overwrite each other. The write itself is conditional on the revision too, so of two corrections sent at the same moment with the same revision exactly one wins and the other is told 409.

**When it is allowed.** Only while the status is `submitted` or `in_review`. A completed application answers **409 `STATUS_NOT_EDITABLE`** (reopen it first); a draft is not visible to an admin at all, so it answers the same 404 `APPLICATION_NOT_FOUND` as an unknown id (8e's rule, kept).

**The request.** `changes` is a list of at most **30** items `{ questionId, index?, value }`; `value` null clears an answer. `questionId` is a question, with `index` (the entry number, from 0) for an answer inside a repeating group's entry. A repeating group can also be sent **as a whole** (`questionId` is the group's id, no `index`, `value` the list of entries): that is how entries are added or removed. Entries must be added one after the other. `reason` is required for a real correction: **10 to 1000 characters after trimming**. A dry run does **not** need one (the reason is asked for after the preview has been read) and never keeps one. Any other field in the body is refused.

**What an admin cannot change**, each with its own 400 code: the Part 9 ticks (`NOT_EDITABLE_DECLARATION`, as is `declarations.submit`), the documents (`NOT_EDITABLE_DOCUMENTS`, also any file question), `status` (`NOT_EDITABLE_STATUS`: use the status buttons), `reference`, `submittedAt` and who the application belongs to (`NOT_EDITABLE_REFERENCE`, `NOT_EDITABLE_SUBMITTED_AT`, `NOT_EDITABLE_IDENTITY`). A question that does not exist is 400 `UNKNOWN_QUESTION`. The applicant's *answers* about themselves (name, email, telephone) **can** be corrected; the account itself cannot.

**How it is checked** (`backend/utils/touristVisaChanges.js`, pure functions, tested without a database):

- It uses **the config snapshot the application was submitted under** (`configOf`), never today's config, for validation and for the words in the preview.
- The same shared engine as a normal save checks **every section the change touches, as a whole** (so changing the email alone fails while the email choices of 2A still name the old one).
- Answers the change **hides are pruned** from the whole application (including whole repeating groups) and listed separately.
- Answers that become **newly required must be supplied in the same request**: a section the change makes necessary elsewhere (single to married needs 4A), a follow-up (other names Yes needs an entry), or a rule it newly breaks in a section it did not touch, is refused. A problem that was *already* there in a section the request did not touch (a date rule that has lapsed with time) is **not** blamed on the change.
- Refusal: **422 `CHANGES_INVALID`** with `sections: [{ id, problems }]` and `errors` (the engine's own fixed messages per field, for example "Enter a valid answer"). **Never a value.**

**Dry run.** `dryRun: true` runs everything above and returns `{ dryRun: true, revision, sections, changes, removed, required }` and writes **nothing except one audit row** (`changes_preview`, no values). Each line is `{ sectionId, sectionTitle, questionId, index?, number, label, old, new }` with the values written by the shared view builder (`describeValue`: "1 March 2027", "£1,500", an option's label). `changes` are the answers set or cleared (an added entry shows "New entry" as its old value), `removed` the answers removed because they became hidden, and `required` the questions the change made necessary together with what was supplied for them. A dry run that does not pass writes no audit row.

**The real correction is one database transaction** (`touristVisaChangeRepository.applyEdit`): it checks the revision and the status, updates the answers (the sensitive ones re-encrypted with the field cipher, bound to this application and question, see section 2 "Encryption"), adds one to `revision`, refreshes the `summary` (name, email, telephone) when those answers changed, inserts the change record and inserts the `changes_apply` audit row. If anything fails **nothing is written** (tests make the record and the audit row fail). **This needs a MongoDB that supports transactions: a replica set. Atlas always is; a standalone local MongoDB answers 503 `TRANSACTIONS_UNAVAILABLE`.** The tests and the browser check use an in-memory replica set.

**The change record: collection `touristvisachanges`** (model `TouristVisaChange`), append only in the same way as the audit log (the model refuses every update and delete, the repository has `applyEdit` and reads only): `applicationId`, `adminId`, `at`, `revisionBefore`, `revisionAfter`, `reason` and `changes`. Every item is `{ sectionId, questionId, index?, kind, old?, new? }`; `kind` is `edited` (set or cleared by the admin), `pruned` (removed because the change hid it) or `structure` (a repeating group got more or fewer entries; old and new are the counts). **The reason and the old and new value of every item are encrypted** with the field cipher, bound to the record and the item (`touristvisachanges:<record id>:<item>.old`), **whether or not the question is itself a sensitive one**. The ids, section, kind and times are plain. A test scans the database for every value, reason and note used and finds none.

**The "corrected by our team" marker** (applicant-visible). The shared review builder takes an optional fifth argument, `corrections`: a map from a *correction key* to a time. The key is the question id, `questionId[index]` for an answer inside a repeating group's entry (for example `q4_8b[1]`), or the group's id when its entries were added or removed (which also forgets the older entry marks of that group, because the numbers shifted). A marked row gets `correctedByTeam`: **the date in words and nothing else**, so the applicant's review and the read-only page show "Corrected by our team on 5 October 2026". It carries **no old value and no reason**, and answers that were *pruned* are not shown at all. The markers are read from the change records **without their values** (`findCorrectionMarks` selects only ids, kinds and times). The applicant's `GET /applications/me` carries them as `corrections` (key to time) for a submitted application, and `GET /applications/me/review` as `correctedByTeam` on the rows; both are empty for an application nobody corrected. The admin Overview shows the same marker. Nothing else of this step ever reaches an applicant response: not the revision, the reason, the old values, the change record, the notes, the call log or the flags (a test scans every applicant response).

**Notes and the call log: collection `touristvisanotes`** (model `TouristVisaNote`), append only: `applicationId`, `adminId`, `at`, `kind` (`note` or `call`), `text` (**encrypted**, bound to the note's own id, at most 2000 characters) and for a call an `outcome` (`reached`, `no_answer`, `wrong_number`, `call_back`). A note needs words; a call needs an outcome and may have none. Body `{ kind, text, outcome? }`, anything else is 400. Who wrote it always comes from the signed-in admin. Adding is audited **first** (`notes_add`), then written.

**Flags.** `adminFlags` on the application: any of `needs_call`, `called`, `awaiting_applicant`, `verified`, `concern`, kept in that fixed order. They are admin only and are in no applicant response. Changing them is audited as `flags_change` with the old and the new list (the words are not sensitive); a change whose audit row cannot be written is undone. The list route has a `flag` filter and shows each row's flags.

**The audit log**, additions to the table in section 2.3: `edit_open`, `changes_preview`, `changes_apply`, `changes_view`, `notes_view`, `notes_add` (ids only) and `flags_change` (`fromFlags`, `toFlags`). A row still never holds an answer, a reason, a note, a file name, a link or an address.

**The pages.** On the Overview (`/admin/tourist-visa/<id>`):

- Each section has an **Edit** button (none on the files section; none while the application is completed, where a note says why). It opens the **same field components the applicant form uses**, filled with the current answers and built from the snapshot config; the Part 9 ticks are shown, disabled, with a note.
- The flow is **Review changes** (a dry run) -> a diff of old and new values, the answers that will be removed and the questions that now apply -> a **Reason** box (10 to 1000, a counter) -> **Apply changes** -> the site's own confirm dialog -> applied. Several sections can be edited in one go (a chip for each, and a "Edit another section" list); a 422 lists the sections to fix, each as a button, marks the fields, and a 409 offers **Load the latest version**. Cancel with unsaved changes asks first. After a save the Overview reloads, the changed rows say "Corrected by our team", and the **Changes** panel lists the history.
- **Notes and calls**: add a note or log a call (four outcome buttons), newest first. **Flags**: five toggle buttons that save at once. The list page has a flag filter and shows each row's flags.
- 375 px, light and dark, keyboard and screen-reader use, focus management (to the editor's heading on open, to the diff, back to the section's Edit button on close) and the site's own dialogs and toasts; no native alert, confirm or prompt.

**Things we decided that you may want to change.** (1) A dry run needs no reason, because the reason is asked for after the preview; a real correction needs one. (2) `CHANGES_INVALID` carries the engine's fixed field messages as well as the section counts. (3) `pruned` answers are kept (encrypted) in the change record so nothing an admin's change removes is lost. (4) The old value of an answer is shown to the admin in the preview and in the Changes panel; it is never shown to the applicant. (5) Restricting the *number of entries* of a repeating group follows the engine's rules (a count-driven group has exactly the number its count question says). (6) Leaving the page with unsaved edits is not guarded by the browser's own prompt (we use no native dialogs); the editor's own Cancel asks.

**Rule for step 8g (the cover letter).** A correction that touches an answer the cover letter uses **must create a new letter version**. The change records say which answers each correction touched (`changes[].questionId`, with `kind` and `revisionAfter`), so the letter step can compare them with the answers its template reads; a letter edited by hand is kept in the history as before.

## 3. What is NOT built

- **Part 10D, the documents** of the spec (the passport copy and the proof of funds). Part 9 and Part 10A to 10C are built as drafts (steps 8b-1 and 8b-2). Everything still to build is planned in order in section 14.
- **Real Cloudinary has not been exercised.** The upload page and its backend are built (steps 8c-1 and 8c-2) and tested with a fake storage; the first real upload, signed download, expiry and delete are still to be checked by hand (section 14.4).
- **Withdrawing or reopening** a submitted application for the applicant to edit (admin only, step 8f), **editing answers as an admin** (8f), the **cover letter** (8g), the **PDF export** in the printout's layout (8h) and a **confirmation email**. A submitted application is locked for the applicant for good.
- **Entry points.** No link to `/tourist-visa` was added to the Footer, the Navbar or the Services pages (the Footer's existing "Tourist Visa" link points at `/services/tourist-visa`, which does not exist). Add links only once the form is ready to open.
- **Senior review of the drafts.** Nothing is confirmed: all 77 drafts (section 10.8) and the wording of the final declaration and of the text shown after submitting still need a decision before release. No question is left open as a `tbc`.
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
| `CLOUDINARY_CLOUD_NAME` | Yes, once `TOURIST_VISA_ENABLED=true` | Already used by the existing assessment uploads, so a deployment that has those has this. The document uploads (section 2.1) need it. |
| `CLOUDINARY_API_KEY` | Yes, once `TOURIST_VISA_ENABLED=true` | As above. |
| `CLOUDINARY_API_SECRET` | Yes, once `TOURIST_VISA_ENABLED=true` | As above. Never logged or put in a link (the signed link carries the key and a signature, not the secret). |

The three Cloudinary names are the **same ones the rest of the backend already reads** (`backend/config/cloudinary.js`), so nothing new has to be invented. If any is missing while the switch is on, the server logs the **names** of the missing ones at startup (never a value) and every upload answers `STORAGE_UNAVAILABLE` (503); a closed deployment does not complain. Use the same account for test and production only if you are sure the `tourist-visa/` folder is private there; a separate test account is safer.

Generate one with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rules for the key:

- **Store it safely**, in the host's secret store, and keep a copy in your password manager or vault. It is never in the repository and the feature never logs it.
- **Losing it, or changing it, makes every encrypted answer (2.19, 2.30a, 2.31b, 3.1, 7.2c, 7.3f, 7.6d, the ten Yes/No answers and ten details boxes of Part 9, and 10.1, 10.1a to 10.1f, 10.5 and 10.5a, and the original name of every uploaded file) unrecoverable.** There is no recovery and no key rotation yet; rotation is planned as its own step before real applicants (section 14). Back it up before the first real applicant saves anything.
- Do not reuse the key from a test environment, and use a different key per environment.
- If the switch is on and it is missing or malformed, the server **refuses every section save** with a 503 ("Secure storage is not configured") and logs an error at startup. Nothing is stored in plain text as a fallback. Reading an application only needs the key when it holds encrypted answers.

**Client (new, optional):**

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` | Leave unset in production (section 4.2). Listed in `client/.env.example`. |

Existing variables the feature relies on and does not change: `JWT_SECRET` (sign-in), `MONGODB_URI`, `NEXT_PUBLIC_API_URL`. Do not leave `SESSION_SECRET` unset (see section 11).

## 6. What changed in existing files

Only eight existing files were modified. Everything else is new, including `backend/.env.example` (it did not exist before; it names the switch, `FIELD_ENCRYPTION_KEY` and the three Cloudinary variables, with no values).

| File | Change |
| --- | --- |
| `backend/index.js` | Requires the new routes and three small middlewares; mounts the feature switch (`touristVisaFeatureGate`) straight after CORS, before every other middleware; mounts `app.use("/api/tourist-visa", touristVisaRoutes)`; parses Tourist Visa bodies first with log-safe errors (`touristVisaBodyParser`); and wraps the global input sanitizer as `skipPaths(["/api/tourist-visa"], sanitize)`. The sanitizer strips `<` and `>` from every string, which would alter free-text answers, so it is skipped for this one path only. Every other route is sanitized exactly as before. |
| `client/src/components/login-form.tsx` | After sign-in, goes back to the page the visitor came from (`?next=`) when it is a safe same-site path (`client/src/utils/safeRedirect.ts`); otherwise the old defaults (admins to `/admin/users`, others to `/`). |
| `backend/package.json` (and lock file) | `npm test` now runs the backend tests (it was a placeholder), one file at a time (`--test-concurrency=1`); adds the dev dependency `mongodb-memory-server`. |
| `backend/middleware/errorHandler.js` | `AppError` takes an optional third argument, `code`, and a fourth, `details` (ids and counts only, for a refused submit), and the error response carries them when they are set (steps 8c-1 and 8d). Nothing changes for an error without them. |
| `client/package.json` | Adds the `test:unit` script. |
| `client/src/components/shadcn-space/blocks/sidebar-06/app-sidebar.tsx` | Adds the "Tourist Visa" entry to the admin menu, only while the Tourist Visa form is open or in preview mode (step 8e). |
| `client/.env.example` | Documents `NEXT_PUBLIC_TOURIST_VISA_PREVIEW`. |
| `backend/package-lock.json` | Lock file for the dev dependency above. It adds 30 packages (the in-memory database for tests, dev only) and also moved the locked versions of six existing indirect packages: `b4a` 1.6.7 to 1.9.0, `bare-events` 2.6.1 to 2.9.2, `semver` 7.7.2 to 7.8.5, `streamx` 2.22.1 to 2.28.1, `tar-stream` 3.1.7 to 3.2.2 and `text-decoder` 1.2.3 to 1.2.7. These are not used by the Tourist Visa code. If you want the lock file to change by the new packages only, regenerate it from main with `npm install --save-dev mongodb-memory-server@^11.3.0`. |

New at the repository root: `package.json` (scripts only, no dependencies) and `scripts/` (`sync-shared.js`, `check-tourist-visa-release.js`), plus `shared/tourist-visa/`, which is the canonical copy of the config and engine.

New code lives under: `backend/{config,controllers,middleware,models,repositories,routes,services,shared,tests}`, `client/src/app/tourist-visa`, `client/src/components/tourist-visa`, `client/src/components/ui/alert-dialog.tsx`, `client/src/{context,hooks,services,shared,utils}`, and `docs/`. The backend follows the existing layering (routes, controller, service, repository, model).

**API.** These routes. While `TOURIST_VISA_ENABLED` is not `true` every one of them (and any other path under the prefix) returns the fixed closed answer (section 4.1). When it is, they are all behind the existing `isAuthorized` middleware, and each only ever touches the signed-in user's own application:

- `POST /api/tourist-visa/applications` creates the draft, or returns the existing one.
- `GET /api/tourist-visa/applications/me` returns it, with sensitive answers decrypted for the owner.
- `PUT /api/tourist-visa/applications/me/sections/:sectionId` validates and saves one section.
- `GET`, `POST` and `DELETE /api/tourist-visa/applications/me/documents` (and `/:docId`) list, upload and delete files (section 2.1).
- `GET /api/tourist-visa/applications/me/review` returns the application as a readable review (section 2.2).
- `POST /api/tourist-visa/applications/me/submit` submits the draft (section 2.2).
- `GET /api/tourist-visa/admin/applications`, `GET .../admin/applications/:id`, `GET .../admin/applications/:id/documents/:docId/link`, `PATCH .../admin/applications/:id/status` and `GET .../admin/applications/:id/activity` are the admin routes (section 2.3). They sit behind the feature switch, `isAuthorized` **and** `isAdmin`, and send `Cache-Control: no-store`.
- Step 8f adds `GET .../admin/applications/:id/edit-form`, `PUT` and `GET .../admin/applications/:id/changes`, `GET` and `POST .../admin/applications/:id/notes` and `PUT .../admin/applications/:id/flags` (section 2.4), behind the same chain.

**Shared copies.** The client and backend are deployed separately, so each carries a generated copy of `shared/tourist-visa/` (`client/src/shared/tourist-visa/`, `backend/shared/tourist-visa/`, each with a `GENERATED.txt`). Step 8d added `view.js` and `view.d.ts` (the review builder) to the shared set. After editing anything in `shared/tourist-visa/`, run `npm run sync:shared` and commit the copies. A test fails if a copy has drifted.

## 7. Database

The feature adds **one new collection**, `touristvisaapplications` (model `TouristVisaApplication`), with three indexes: one live draft per applicant (unique, partial), `applicant + createdAt`, and `status + createdAt`. It does not read or change any existing collection except `users` (to identify the signed-in user, as the rest of the site does).

**Step 8f: what is new in the database.** Two new collections, **`touristvisachanges`** (the correction records, index `applicationId + at`) and **`touristvisanotes`** (notes and the call log, index `applicationId + at`), both append only by the application's own rules (section 2.4). Each application gains two optional fields: `revision` (a number; a missing one counts as 0, so nothing needs migrating) and `adminFlags`. The audit collection gains seven action names and the `fromFlags` and `toFlags` fields. **On a deployment where automatic index building is switched off, create them once by hand**: `db.touristvisachanges.createIndex({ applicationId: 1, at: -1 })` and `db.touristvisanotes.createIndex({ applicationId: 1, at: -1 })`. **Correcting an application needs a MongoDB that supports transactions (a replica set).** Atlas does; a standalone local MongoDB cannot (the route answers 503 `TRANSACTIONS_UNAVAILABLE` and writes nothing). No existing application is rewritten by this step.

**Step 8e: what is new in the database.** There is one new collection, **`touristvisaaudit`** (section 2.3): append only by the application's own rules, with indexes on `applicationId + at` and `adminId + at`. Each application gains an optional `summary` (`{ name, email, phone }`, plain text, written at submit and filled in once for older submitted applications) and one new index, `status + submittedAt`, for the list. **On a deployment where automatic index building is switched off, create them once by hand**: `db.touristvisaapplications.createIndex({ status: 1, submittedAt: -1 })`, `db.touristvisaaudit.createIndex({ applicationId: 1, at: -1 })` and `db.touristvisaaudit.createIndex({ adminId: 1, at: -1 })`. No existing application is rewritten except by the one-time summary fill. **Applications submitted before 8e have no `summary` until an admin lists or opens them.**

Each application records the `configVersion` its answers were collected with. When the config changes, saved answers are never rewritten: the server works out the status of each section when it reads the application, and a section whose answers no longer fit shows as **Needs review**.

**Step 8d: what is new in the database.** Each application gains two optional fields, `reference` and `configSha256` (set only at submit), and `declarations.submit`. There is one new collection, `touristvisaconfigsnapshots` (section 2.2), and one new index: a **unique, partial index on `reference`** (only documents that have a text reference are in it). Mongoose builds it when the server starts; **on a deployment where automatic index building is switched off, create it once by hand**: `db.touristvisaapplications.createIndex({ reference: 1 }, { unique: true, partialFilterExpression: { reference: { $type: "string" } } })`. Existing drafts are not touched and need no migration. Config `0.12.0-draft` only adds the `afterSubmit` wording, so no saved answer changes.

**Config `0.11.0-draft` (step 8c-2) and saved answers.** Nothing is deleted or rewritten. Section 10D is new and has no answers: its status is worked out from the uploaded files and is never stored, so no saved application changes. An applicant who had saved Parts 1 to 10C now resumes on 10D. Reading an application writes nothing. Covered by tests (`touristVisaDocuments.test.js`).

**Documents (step 8c-1).** The `documents` list on the application changed shape (section 2.1). The old shape was never written (there was no upload code), so no saved application holds one and nothing is migrated. No Tourist Visa answer or section status is affected.

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
npm run test:shared                  # engine, config, review-builder and release-check tests (255)
npm run check:tourist-visa-release   # open tbc items and draft lists; exit 1 blocked, 2 drafts only (expected today), 0 clear
```

Backend (needs no database and no `.env`; it starts an in-memory MongoDB, and the test files set `TOURIST_VISA_ENABLED` themselves, so your own `.env` does not matter):

```
cd backend
npm test                             # runs the test files one at a time
```

Two test files cover the server switch: `touristVisaFeatureSwitch.test.js` (every route and every non-`true` value returns the closed answer with no database connected, no model call and no log line; with `true` the routes behave as before) and `touristVisaFeatureSwitchWiring.test.js` (the real `index.js` started with the switch unset and no encryption key: same answer before sign-in and body parsing, readable cross-origin, rest of the API unaffected, nothing logged).

`touristVisaDocuments.test.js` covers the document uploads (step 8c-1) with a fake Cloudinary and no network: valid PDF, JPG and PNG; a fake file renamed `.pdf`, an oversize, an empty and a wrong-slot file; the per-slot caps, the total cap, parallel uploads at both caps; locking after submit; delete removing the stored file; a database failure cleaning up the stored file; the encrypted original name; no URL or storage id in any applicant response; another user unable to touch my files; the closed feature gate; the rate limit; `getTemporaryLink` and its 2-minute expiry; and the real Cloudinary adapter's upload options and signed link (offline). `touristVisaSubmit.test.js` covers the submit (step 8d): a successful submit and everything it records, each kind of refusal (a section never saved or needing another look, saved answers that no longer pass, missing documents, a stale Part 9 tick, a missing declaration, a bad request), five submits at the same moment (one winner), a change between the check and the write, the lock after submit (save, upload, delete), the config snapshot (stored once, never rewritten, used to show a submitted application after the live config changes), the reference (format, uniqueness, retry on a collision, giving up cleanly), ownership, sign-in, the closed feature gate, and that no answer reaches a response or a log line. `shared/tourist-visa/view.test.js` covers the review builder (hidden questions, option labels, dates and amounts, groups and their per-entry conditions, files without anything but a name and a size, an input that already holds decrypted values, and that the client and backend copies match the source). On the client, `touristVisaReview.test.mjs` covers the plain words for every way a submit can be refused, and the checklist and service tests cover the readiness rules and the review and submit calls. `touristVisaAdmin.test.mjs` (14 tests) covers the admin pages' logic: status labels and the words for each move, the plain words for every way an admin call can fail, the list's result and empty texts, the pager, date formatting, the activity lines, the jump list, matching files to their questions, the query string, and the five admin service calls (path, method, token, encoded ids, the refusal's status and code kept, a strange answer rejected).

`touristVisaAdmin.test.js` covers the admin side (step 8e, 34 tests, fake storage, no network): the authorization matrix for every route (no token 401, a non-admin 403, an admin allowed, the closed feature gate 404 first), drafts never listed and never openable, search (reference, name, email, any case, the typed text escaped so regular-expression characters match only themselves, an object in the query refused or ignored), the status filter and paging, the one-time summary fill for applications submitted before the summary existed (and that it never overwrites), an Overview built from the snapshot even after the live config changed, decrypted values only for admins, exactly one audit row for each Overview view and one `list_view` row for each application shown, a file link that lasts 2 minutes with an audit row that holds the document id and no link, every valid and every invalid status move, a status changed behind the page's back, an audit failure returning no data (and undoing a status change), audit rows holding no value, no update or delete of an audit row through the model, `Cache-Control: no-store` on every answer, and that no answer, name, file name or link reaches an error response or a log line.

`touristVisaChangesLogic.test.js` (24 tests, no database) covers the rules of a correction: every kind of request that is refused and its code, the reason lengths, the section validated as a whole, hidden answers pruned, follow-ups and whole sections that become required, a problem that was already there not being blamed on the change, repeating groups (add, remove, replace), the preview wording, the "corrected" marks and the review builder's use of them. `touristVisaAdminEdit.test.js` (43 tests, an in-memory **replica set**, fake storage, no network) covers the routes: the authorization matrix (no token 401, a non-admin 403, an admin allowed, the closed gate 404, a demoted admin refused at once), drafts invisible, the status gates, the revision (a stale one 409, two corrections at the same moment give exactly one winner), every part an admin cannot change, the snapshot config used when today's config differs, the dry run writing no data change and one value-free audit row, a failure in the record or the audit row rolling everything back, the summary refreshing for a name, an email or a phone, encrypted fields never plaintext at rest (answers, change records, reasons, notes), what an applicant's responses hold (only the date marker), the history, the form, the notes, the flags and their filter, append-only change records and notes, audit rows holding ids and fixed words only, and no value, reason or note in an error or a log line. `shared/tourist-visa/view.test.js` gained tests for the corrections input and `describeValue`. On the client, `touristVisaAdminEdit.test.mjs` (27 tests) covers the diff that turns edited sections into changes, the form helpers, the reason and note rules, the flags and outcomes, the plain words for every refusal, and the eight new service calls.

`touristVisaDocLinkScript.test.js` covers the developer tool (it refuses without confirmation, never prints a secret or an error message, and the link it prints expires 2 minutes after it is asked for). The 8c-2 additions to `touristVisaDocuments.test.js` cover the 10D status following the files (not started, in progress, saved, and back), the refusal to save 10D as a section, the resume point, a locked application keeping its files, and a test that fails if any production file could swap the storage for a fake. On the client, `touristVisaDocuments.test.mjs` covers the browser's check of a file (type, size, caps, in the server's order), the plain-words message for every code the server can send (and that none is missing), and the formatting; the checklist and service tests cover the 10D row and the three document calls.

`touristVisaDocumentsWiring.test.js` boots the real `index.js` to check that a multipart upload gets through the real parser order and that the startup warning gives names only; `touristVisaFeatureSwitchWiring.test.js` also checks the three document routes while the feature is closed.

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

All of these were green at the time of writing (shared 255 tests, backend 407, client 249). The tests use made-up data only.

**Browser check of the admin pages (step 8e).** The same fake-storage method, against a throwaway database with a real submitted application (two files), 25 more submitted rows and a draft: a non-admin is sent away and the API says 403; the menu entry appears in preview mode and is absent when the form is closed; the list (20 a page, newest first, no drafts), search by reference, name and email in any case, special characters matching nothing without an error, the status filter, Clear, paging with focus moved to the results, and 375 px as cards with no sideways scroll in light and dark; the Overview (call block with the `tel:` link and Copy number, all sections, files by name and size, a jump list, no link or storage id anywhere in the page, exactly one Overview request and one view row); Open pointing a new tab at the link and writing a row with the document id only, and the blocked-tab fallback; the status dialog (Go back changes nothing and returns focus, then Start review, Mark as completed and Reopen for review, each with its audit row), a status changed behind the page; a draft and an unknown id giving "could not be found" with no row; the keyboard (the dialog keeps focus, Escape cancels) and labelled headings; `no-store` on the answers; audit rows with no value in them; and nothing sensitive in storage, the console or the address bar.

**Browser check of the admin edit (step 8f).** The same fake-storage method against a throwaway **replica-set** database with a real submitted application: Edit on every section but the files; the form opening filled in with the heading focused (opened with the keyboard); the diff with old and new values and nothing saved by the dry run; the reason rules and counter; the confirm dialog (Go back and Escape change nothing, then Apply saves and focus returns to the section's Edit button); the new phone number in the call block, the list and the history; "No" on a Yes/No removing the follow-ups (listed separately and kept in the history); a question that becomes required (refused with the fields marked, then accepted with its answers); an encrypted field stored as ciphertext; a stale revision after another admin's change (and loading the latest version); Cancel with unsaved changes; a completed application offering no Edit; notes and a logged call (encrypted at rest); the flags, the list showing them and the flag filter; the applicant's own review page showing only "Corrected by our team on <date>" (no reason, old value, note or flag); 375 px in light and dark for the Overview, the form and the diff with no sideways scroll; audit rows with ids only; and nothing sensitive in storage or the console (18 of 18 checks passed).

**Browser check of review and submit.** The same fake-storage method drives the incomplete path (the dashboard's disabled button and list, the review page by address), the fix on the documents page, a refusal by the server after the page loaded (listing the section, never the answer), the confirm dialog (cancelled, then confirmed), the confirmation, the read-only review, a direct visit to section addresses after submit, the locked server answers, and 375 px in light and dark.

**Browser check with a fake storage.** Real Cloudinary is not available to the automated check, so the 10D page is driven in a real browser (375 px, light and dark) against a throwaway database and a **fake storage**. The fake is put in place by a small wrapper script that lives outside the repository and starts the real `backend/index.js` afterwards; nothing in the repository can do that. The document service's storage defaults to the Cloudinary adapter, no setting or request can change it, and a backend test fails if any production file assigns the storage or reads a "fake" or "mock" setting. A production start (`node index.js`) therefore always uses Cloudinary.

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

**Text shown after submitting (draft, step 8d, `afterSubmit` in the config):** "Our team will review your application. We may call you on the telephone number you gave, to check your answers with you. Keep your reference number. You can quote it if you contact us. Your application can no longer be changed. If something needs correcting, tell us when we call or contact us." The senior approves or replaces it in the config, like the declaration.

**Final submit declaration (draft, step 8d):** I declare that the information I have given in this application is complete and true to the best of my knowledge. I understand that giving false or incomplete information may lead to my application being refused. I agree that Wiser Consulting may call me on the telephone number I gave, to check my answers.

### 10.6 Drafted Part 10A to 10D (steps 8b-2 and 8c-2)

Same status as sections 10.2 to 10.5: every question has a short draft note in the config, is listed by the release check, and is never confirmed. Part 10D (the documents, step 8c-2) is the last two rows of the table.

| Item | What the draft asks | Encrypted |
| --- | --- | --- |
| 10.1 | A required tick list, "At any time have you ever had any of the following, in the UK or in another country?", with the six choices of the printout and one exclusive "None of these" (it cannot be ticked with the others; ticking it clears them, and ticking another clears it). **Each ticked choice opens its own required "Please give details" box** (up to 2,000 characters, 10.1a to 10.1f); unticking a choice removes its box and its answer. The third choice reads "currently on bail or awaiting trial": the word "bail" was hidden on the printout and is our guess. | **yes** (the list and every box) |
| 10.2, 10.3 | Two optional long-text boxes (up to 2,000 characters each), always shown. **10.3 stands alone** and does not depend on 10.2 (the printout does not say). | no |
| 10.4 | A required dropdown: English, Urdu, Punjabi, Pashto, Hindi, Arabic, Bengali, Chinese (Mandarin), Spanish, French, Other. **Other opens a required "Which language?" box** (10.4a, up to 100 characters). | no |
| 10.5 | A required Yes/No, "Do you have a UK National Insurance number?". **A Yes opens a required box for the number** (10.5a). | **yes** (the Yes/No and the number) |
| 10.6 | **File question:** "Your passport or travel document", slot `passport`, up to 3 files. Required to submit (not to save). The guidance is our own wording. | no answer is stored; the files are private (section 2.1), only the file name is encrypted |
| 10.7 | **File question:** "Evidence of funds", slot `funds`, up to 10 files. Required to submit (not to save). The guidance is our own wording. | as 10.6 |

**The National Insurance number.** It is checked against the standard UK format: two letters, six digits and a last letter A, B, C or D. The first letter cannot be D, F, I, Q, U or V; the second cannot be D, F, I, O, Q, U or V; and the prefixes BG, GB, KN, NK, NT, TN and ZZ are refused. The applicant may type it in capitals or small letters and with spaces (`ab 12 34 56 c`); it is stored as `AB123456C` and shown that way when the section is opened again. The error says "Enter a National Insurance number in the format AB 12 34 56 C" and never repeats what was typed. The letter exclusions go a little beyond the prefixes we were asked to refuse (they are part of the standard format); drop them in the `pattern` of 10.5a if the senior prefers the shorter rule.

**What 8b-2 added to the engine.** One small rule, `rules.normalize`, on short text questions: `uppercase_no_spaces` removes every space and capitalises the answer *before* the pattern is checked and before it is stored. The existing `pattern`, `includes` and `exclusive` features from 8b-1 are used as they were. A config check (`validateConfig`) refuses a `normalize` on any other question type or with an unknown name.

**None of 10.1 to 10.5 feeds the cover letter** (the uploaded files are not part of the cover letter either) (section 14.2). Parts 9 and 10A were already decided; the extra-information boxes, the language and the National Insurance number are kept out as well. Nothing in the cover-letter step may read them.

**Encrypted fields so far: 36.** The 27 of steps 7b to 8b-1 plus nine new ones: 10.1, 10.1a to 10.1f, 10.5 and 10.5a. No existing question was made encrypted (section 10.9).

### 10.7 Open items (`tbc`)

**None.** Every item that was a `tbc` is now a draft (sections 10.2 to 10.6). The release check exits 2 (drafts only), not 1.

### 10.8 Every draft at a glance

All 77 drafts (73 questions and 4 groups) in 22 sections, plus the declaration wording, with the note stored next to each in `shared/tourist-visa/questions.json`. The notes are the defaults. Deleting a note after review is what lets its section open. Generated from the config at the time of writing; if it differs from the config, the config wins.

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
| 10D | 10.6 | the guidance is our own wording. At least one file is needed before the application can be submitted (checked at submit, step 8d); a draft can be saved without it. Files are stored privately, up to 3, as PDF, JPG or PNG. |
| 10D | 10.7 | the guidance is our own wording. At least one file is needed before the application can be submitted (checked at submit, step 8d); a draft can be saved without it. Files are stored privately, up to 10, as PDF, JPG or PNG. |
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
| The documents page (10D) | `client/src/components/tourist-visa/DocumentsSection.tsx`, the browser's file check and messages in `client/src/utils/touristVisaDocuments.ts`, the dashboard row in `client/src/utils/touristVisaChecklist.ts` |
| The document status rules and the file question type | `shared/tourist-visa/engine.js` (`documentsStatus`, `documentsComplete`, `isFilesOnlySection`) |
| Opening an uploaded file by hand (developer only) | `backend/scripts/tourist-visa-doc-link.js` (section 2.1) |
| The review page, the Submit button and the confirmation | `client/src/app/tourist-visa/review/page.tsx`, `client/src/components/tourist-visa/ReviewSummary.tsx`, the plain words for a refusal in `client/src/utils/touristVisaReview.ts`, the readiness rule in `client/src/utils/touristVisaChecklist.ts` |
| How an application is turned into a readable review (the applicant now, the admin and the PDF later) | `shared/tourist-visa/view.js` (`buildReview`) |
| The submit rules, the reference and the config snapshot | `backend/services/touristVisaApplicationService.js` (`submit`, `submitProblems`, `getReview`, `configOf`), `backend/repositories/touristVisaApplicationRepository.js` (`submitApplication`, `saveConfigSnapshot`), `backend/models/TouristVisaConfigSnapshot.js` |
| File limits, allowed types, document error codes | `backend/config/touristVisaDocuments.js` (one file; section 2.1) |
| Where uploaded files are stored, and how links are made | `backend/config/touristVisaStorage.js` (Cloudinary), `backend/services/touristVisaDocumentService.js` |
| The admin routes, the list, the Overview, the status moves and the audit | `backend/routes/touristVisaAdminRoutes.js`, `backend/controllers/touristVisaAdminController.js`, `backend/services/touristVisaAdminService.js` (`STATUS_MOVES`, `callBlock`), `backend/repositories/touristVisaApplicationRepository.js` (`listForAdmin`, `findForAdmin`, `changeStatus`), `backend/models/TouristVisaAudit.js`, `backend/repositories/touristVisaAuditRepository.js`, `backend/utils/touristVisaSummary.js`, `backend/middleware/noStore.js` |
| The admin pages and their words | `client/src/app/admin/tourist-visa/page.tsx` (list), `client/src/app/admin/tourist-visa/[id]/page.tsx` (Overview), `client/src/utils/touristVisaAdmin.ts`, `client/src/services/touristVisaAdminTypes.ts`, the admin calls in `client/src/services/touristVisaService.ts`, the menu entry in `client/src/components/shadcn-space/blocks/sidebar-06/app-sidebar.tsx` |
| Correcting answers: the rules, the routes, the transaction and the history | `backend/utils/touristVisaChanges.js` (pure rules), `backend/services/touristVisaAdminEditService.js`, `backend/repositories/touristVisaChangeRepository.js` (`applyEdit`), `backend/models/TouristVisaChange.js`, `backend/controllers/touristVisaAdminEditController.js`, `backend/routes/touristVisaAdminRoutes.js` |
| Notes, the call log and flags | `backend/services/touristVisaAdminNotesService.js`, `backend/repositories/touristVisaNoteRepository.js`, `backend/models/TouristVisaNote.js`, `backend/repositories/touristVisaApplicationRepository.js` (`setAdminFlags`) |
| The "corrected by our team" marker | `shared/tourist-visa/view.js` (`buildReview`'s fifth argument, `correctionKey`), `backend/services/touristVisaApplicationService.js` (`correctionMarks`), `client/src/components/tourist-visa/ReviewSummary.tsx` |
| The admin edit screens | `client/src/components/tourist-visa/AdminEditor.tsx`, `AdminNotesPanel.tsx`, `AdminChangesPanel.tsx`, `AdminFlags.tsx`; the diff and form helpers in `client/src/utils/touristVisaForm.ts` (`buildChanges`), the words in `client/src/utils/touristVisaAdmin.ts` |
| How a question or group is drawn | `client/src/components/tourist-visa/` (`QuestionField.tsx`, `RepeatGroupField.tsx`, `fields/`) |
| Section form behaviour and unsaved-changes guard | `client/src/components/tourist-visa/SectionForm.tsx`, `client/src/hooks/useUnsavedChangesGuard.ts` |
| Dashboard and open/closed switch | `client/src/app/tourist-visa/`, `client/src/utils/touristVisaChecklist.ts` |
| The pure form logic (payload, errors, hints) | `client/src/utils/touristVisaForm.ts` |

## 14. Roadmap: what is still to build

Planned, **not built**. The order below is the agreed order; step names are working labels and each step still ends with a report and an approval before the next. Two requirements from the senior (14.1 and 14.2) are recorded here and are not started. The approved decisions are listed after the table.

| Step | What | Steps |
| --- | --- | --- |
| 8b | Parts 9 and 10 questions and declarations (drafts; sensitive answers encrypted; ACK declarations recorded with who, when and wording version). **8b-1 and 8b-2 are built**: 8b-1 added the engine features (`includes` condition, `exclusive` checklist option, `pattern` rule), Part 9 and the declaration records; 8b-2 added the `normalize` rule and Part 10A to 10C (10D, the documents, is the upload step 8c) | 2 |
| 8c | Document upload: passport and funds, private storage, expiring links (2 minutes). **8c-1 and 8c-2 are built**: the backend (4 MB per file, PDF/JPG/PNG only, passport up to 3 files, funds up to 10, 40 MB in total, Cloudinary private storage, the Vercel serverless assumption) and the upload page (section 10D, section 2.1). Still to do by hand: the check against real Cloudinary (section 14.4) | 2 |
| 8d | Review page and submit (read-only view and lock after submit). **Built** (section 2.2): the shared review builder, the atomic submit with its checks, the reference and the config snapshot, the review and confirmation pages | 2 |
| 8e | Admin list and Overview (call details first, view logging). **Built** (section 2.3): the list, the Overview with the call block, files by a 2-minute link, the status moves, the append-only audit log and the activity panel; read only | 2 |
| 8f | Admin edit with an audit trail (reason required, validated by the same engine, old and new values encrypted). **Built** (section 2.4): the revision rule, the dry run and the single transaction, the encrypted change records, the "corrected by our team" marker for the applicant, notes, a call log and flags | 3 |
| 8g | **Automatic cover letter** (14.2) | 3 |
| 8h | PDF export of the application (Latin text only; no printout is needed as a reference) | 2 |
| 8i | Entry points: links (the Footer points at `/tourist-visa`), and the **assessment modal change** (14.1) | 2 |
| 8j | Security review (the list so far is in section 14.5) | 2 |
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
- **Regenerated** when the admin corrects answers (8f). **A correction that touches an answer the letter uses must create a new letter version**: the change records (section 2.4) list the answers each correction touched. **Decided:** a letter the admin has edited by hand is kept in the history, a new generated version is added, and the admin sees a notice.
- **Editable by the admin**, with a required reason; every edit is logged in the audit trail (admin, time, old and new text encrypted), and two admins cannot overwrite each other (revision check).
- **Downloadable as a PDF** by admins only, and each download is logged. This adds the first PDF output; step 8h reuses it.
- Proposed: admin-only in the first version (the applicant does not see the letter).
- Tests: the same answers give the same text, a missing answer gives a placeholder and nothing is invented, regeneration after a correction, ciphertext in the database, edits logged, and the PDF.

### 14.3 Recommendation for the senior (not part of this feature): MFA for admin accounts

Admins will be able to read every applicant's decrypted answers, including passport numbers and the security-history answers, and to change them. Admin sign-in today is email and password only, with a token kept in the browser. It is recommended to add **multi-factor authentication for admin accounts** before the admin Overview (built in step 8e, section 2.3) is used with real applicants. It is a change to the existing login, outside the Tourist Visa code, so it is recorded here rather than planned as a step; the view log and the audit trail (steps 8e and 8f) show who looked at or changed what, but do not stop a stolen password.

### 14.4 Step 8c-2: the upload page (built) and the check against real Cloudinary (to do)

**Built:** the 10D section and its two draft file questions, the file question type and the document status rules in the engine, the derived 10D status on the server and the dashboard, the documents page, the developer tool for opening a file, and the tests and browser check described in sections 2.1 and 8.

**To do by hand, with your own test Cloudinary account in `backend/.env`** (nothing in the automated checks reaches Cloudinary):

1. Start the backend with `TOURIST_VISA_ENABLED=true` and the client in preview mode, sign in, and open section 10D.
2. Upload a real PDF, JPG and PNG through the page.
3. In the Cloudinary console, find them under `tourist-visa/<applicationId>/`: the type should be **authenticated**, the resource type **raw**, and the name a random string with the extension (no part of the file's own name).
4. Run `node scripts/tourist-visa-doc-link.js <applicationId> <documentId> --confirm` from `backend/` and open the link within 2 minutes: the file should download. Wait until it has expired and open it again: it should stop working.
5. Remove a file on the page (confirm in the dialog): it should disappear from the page and, within a moment, from the Cloudinary console.
6. If any of this fails, note the exact message the page gives and the console's settings for the asset; the fallback for PDFs is in section 2.1 ("What is not yet proven").

**Not in 8c-2:** the admin route and viewer for files (8e, with every view logged), the review page and submit (8d), and malware scanning (8j).

### 14.5 For the security review (step 8j)

Things to look at, collected as the steps were built:

- **The reference** (8d): the format `TV-` + 8 characters of a 31-character alphabet (about 850 billion), drawn with `crypto.randomInt`, unique-indexed, shown to the applicant and meant to be quoted. It must never be used to look an application up or to authorise anything. It can be read out loud, so a person may guess a mistyped one: nothing should confirm that a reference exists to anyone but its owner or an admin.
- **The config snapshot** (8d): stored as text in its own collection, keyed by its SHA-256, written once and never changed or deleted; it holds the form's questions and wording only. Check that nothing can write to or read from that collection except the submit and the review code, and that an admin or PDF path never falls back to the live config for a submitted application.
- **What a submit logs** (8d): at most one line with the application's id, in development only; the refusal and the 500 carry ids and counts, never an answer. Re-check this after every change to the submit.
- **No rate limit on submit** (8d): submit and review sit behind sign-in and the general API limiter only. A dedicated limit is cheap to add.
- **Uploaded files** (8c): no malware scan, and a PDF can carry active content, so files must only ever be offered as downloads from the private 2-minute link, never displayed inline from our own site; the upload rate limit is per server process; the developer link tool prints a working link to a real file, so it must never run in a shared environment.
- **MFA for admin accounts** (section 14.3). The Overview shows every decrypted answer to any account whose `role` is `1`; a stolen admin password is a stolen database. It should be done before the admin pages are used with real applicants.
- **Retention of the audit log** (8e): `touristvisaaudit` grows with every list page (one row for each application shown), Overview view and file link, and is never deleted. Decide how long it is kept, who may read it directly and whether old rows are archived. Nothing in the application removes a row.
- **The audit log is append only only in the application** (8e): the model refuses updates and deletes and no route offers them, but the database user the server connects with can still change the collection. Use a database role with insert and read only on `touristvisaaudit` for the server (or ship the rows to storage nobody can edit) if the log must stand up to someone with database access.
- **No rate limit on the admin routes** (8e): they sit behind sign-in, the admin check and the general API limiter only. A search or the list can be run in a loop, and every list page writes up to 50 audit rows. Add a dedicated limit.
- **Reading the activity log is not audited** (8e), and the list writes one row for each application shown (a default we chose): confirm both are what the senior wants.
- **The summary holds a plain copy of name, email and telephone** (8e) on the application. It is the same data as the unencrypted answers, but it is a second copy: include it in any export or deletion of an applicant's data, and refresh it when an admin edits those answers (8f).
- **A file link is a bearer link for 2 minutes** (8e): anyone who sees it in the new tab's address bar, a browser history sync or a screen share can use it until it expires. The page never shows or logs it, but the tab's address bar and the browser's history will hold it.
- **Admin pages and the role in the browser** (8e): the menu and the layout check the role the browser was given at sign-in, only to decide what to show. The server checks the role in the database on every request and is the only real check.
- **Retention of the change records, notes and call log** (8f): `touristvisachanges` and `touristvisanotes` hold the (encrypted) reasons, old and new values and notes of every correction, and are never deleted. Decide how long they are kept, who may read them directly and what happens on an applicant's request to delete their data (the old values of a corrected answer are personal data too).
- **No rate limit on editing** (8f): the correction, notes and flag routes sit behind sign-in, the admin check and the general API limiter only. A dry run costs a full validation, so a loop of them is cheap to start; add a dedicated limit (and consider one per application).
- **The change and note collections are append only only in the application** (8f), like the audit log (above): use a database role with insert and read only on `touristvisachanges`, `touristvisanotes` and `touristvisaaudit` for the server if they must stand up to someone with database access. The key that encrypts them is the same field key (8k).
- **Admin MFA matters more now** (8f): an admin account can *change* an applicant's answers, including the security-history answers, and read every decrypted value through `edit-form`. Section 14.3 should be done before real applicants.
- **Free-text reasons and notes** (8f) may contain personal data typed by staff. They are encrypted at rest and never logged, but they are in the database backups and must be covered by the retention decision above.
- **The site's general limiter is small for an admin session** (8f): `/api` allows 100 requests per 15 minutes per IP, and one Overview visit makes about seven (the Overview, the activity, the changes, the notes, and a form or a preview when editing). A long browser check hit it (the check script switches the limiter off in its own wrapper, outside the repository). A real admin session, or several admins behind one office address, can reach it: give the admin routes their own, higher, per-user limit together with the editing limit above.
- **A correction needs a replica set** (8f): confirm production (Atlas) runs one, and that nothing points the server at a standalone MongoDB.
- **Key rotation** (8k) before any real applicant data is stored.
