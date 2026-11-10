# Security fixes

## 8j-2: the two critical findings (A1 and A2)

Found by the security review of the Tourist Visa feature (step 8j-1). Both were in the older part of the site, not in the Tourist Visa code, but an administrator can read every applicant's data, so they had to be closed first. This change is on its own branch (`fix/critical-auth-hardening`, made from `main`) so it can be deployed without the Tourist Visa feature.

**A1. Anyone could create an administrator.** `POST /api/create-admin` needed no sign-in. The route, its controller method, its service method and its schema are removed (nothing in the client or the scripts called it). The first administrator is now created with `backend/scripts/create-first-admin.js`, run by a person with access to the server: the email, the password and (optionally) the name come from environment variables that person sets in their own shell (the comment at the top of the script shows how, without leaving the password in the shell history); it refuses a weak password, a duplicate email or name, and a missing value; it hashes the password exactly as the sign-up does; it prints one success line and never the password. After that, an existing administrator can promote an account with `PUT /api/update-user-role/:userId`.

**A2. Any signed-in user could make themselves an administrator.** `PUT /api/update-profile` passed the whole request body to the database, and the validation middleware threw its cleaned result away. Now:
- the profile update copies only `name`, `phone`, `address` and `city` (in the service, and the route's schema is strict, so any other key, such as `role`, `password`, `email` or `isDeleted`, is a 400);
- `middleware/validate.js` replaces `req.body` with the validated, cleaned body, so every route that uses it now passes on only what its schema allows (this also closes the same pattern in the site settings, testimonial, approved visa and public assessment routes);
- the schemas of the user routes (sign-up, login, profile, role) are strict (a fifth, for the Google token, was strict too until step 8j-2b removed the Google sign-in).

Run the tests with `npm test` in `backend/` (they use an in-memory database).

## 8j-2b: Google and GitHub sign-in removed

Decision of the project lead: the site signs in with email and password only. This also closes finding **A6** (the server accepted any Google access token, did not check that it was issued to this site, and linked it to an existing account by email, which allowed an account takeover) and the `/auth-success` item (the server-side Google redirect landed on a page that does not exist), because the code behind them is gone. Nothing was run against a database and no user record was changed.

**Removed in the backend:** `POST /api/auth/google/token`, `GET /api/auth/google` and `/google/callback` (the whole `routes/authRoutes.js`, which also held an unused session-based `/me` and `/logout`); `config/passport.js`; the passport and session setup in `index.js` (the session middleware used `SESSION_SECRET` with a public fallback, so that risk is gone too); `handleGoogleToken`, `handleGoogleAuth`, `findByGoogleId` and `googleTokenSchema`. Packages removed: `passport`, `passport-google-oauth20`, `express-session` (and the 13 packages only they needed; `npm uninstall --legacy-peer-deps`; 166 lines deleted from the lock file and none added). There was never a GitHub route: the GitHub buttons did nothing. The only backend variable read by this code alone was `SESSION_SECRET`.

**Removed in the client:** the Google button and provider (`GoogleLoginButton`, `GoogleOAuthProvider`, the `googleAuth` and `googleLogin` code in the auth slice and service), the package `@react-oauth/google` (and its lock entry), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.example`, and the "Or continue with" divider and the GitHub button on `/login`, `/register`, `/signup` and the template page `/login-01` (which also had a Google button). Each page keeps its email and password form and its "Sign up" or "Sign in" link, with no empty gap. There was no `/auth-success` page in the client. The Footer's link to `mail.google.com` (it opens a Gmail compose window to the contact address) and the `next/font/google` import (the page fonts) are not sign-in and were kept.

**Kept on purpose:** the `googleId` and `avatar` fields of the user model and every record (no migration, nothing deleted). The model still lets an account exist without a password if it has a `googleId`.

**Made safe:** an account with no password (or an empty one) used to get "Please use Google authentication", which told a stranger that the account exists and how it was made. It now gets the same "Invalid credentials" (400) as an unknown email or a wrong password, and a stored password that is empty or not text can no longer cause an error. A given password that is not text is refused before it reaches bcrypt.

### What to check in Atlas (how many people lose access)

People who signed up only with Google have no password, so after this change they cannot sign in. Run these in Atlas (or Compass) on the `users` collection. They only count; they change nothing.

1. Accounts that lose access (no usable password and a Google or GitHub id, not deleted):

```
{ "isDeleted": false,
  "$and": [
    { "$or": [ { "googleId": { "$exists": true, "$nin": [null, ""] } },
               { "githubId": { "$exists": true, "$nin": [null, ""] } } ] },
    { "$or": [ { "password": { "$exists": false } }, { "password": null }, { "password": "" } ] }
  ] }
```

   (There is no `githubId` field in the model and the GitHub buttons never worked, so the count can only come from `googleId`; the GitHub part is there to be sure.) Add `"role": 1` to the filter to see whether any **administrator** is among them, which matters most.
2. For information, Google accounts that also have a password keep their access (they sign in with that password): `{ "isDeleted": false, "googleId": { "$exists": true, "$nin": [null, ""] }, "password": { "$exists": true, "$nin": [null, ""] } }`.
3. All accounts with no usable password, whatever the reason: `{ "isDeleted": false, "$or": [ { "password": { "$exists": false } }, { "password": null }, { "password": "" } ] }`.

If the first count is more than zero: there is no password-reset flow in the app, so those people cannot get back in by themselves. Decide before deploying: ask them to sign up again with a new email, or set a password for them by hand (hash it with bcrypt, 10 rounds, as the sign-up does; never put a plain password in the database).

### After deploying this change

- Remove `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from the client's environment (the local `.env` / `.env.local` and the hosting settings) and `SESSION_SECRET` from the backend's; nothing reads them now. This change did not touch any `.env` file.
- If a Google Cloud OAuth client was set up for this site, delete it, so the old client id cannot be used for anything.
- The rate limiter `authLimiter` (5 tries per 15 minutes) was only mounted on `/api/auth`, so it protected only the Google routes. It is now used nowhere. Finding A9 (limits on `/api/login` and `/api/signup`) is still open and is the place to use it.

### Merging with the tourist visa branch

`feature/tourist-visa-form` (merge base `32afed8`) changed several files that this branch deletes or edits. Expect conflicts in these; the safe resolution is given for each:

| File | What the tourist visa branch did | Resolve by |
|---|---|---|
| `client/src/components/GoogleLoginButton.tsx` | the 8i work added the carried `next` redirect to it (modify/delete conflict) | **delete the file** (no page uses it) |
| `client/src/components/login-form.tsx` | changed the redirect after sign-in and the "Sign up" link to `/register${nextQuery(carried)}` | take the tourist visa version of the redirect and of the link, and keep this branch's removal of the "Or continue with" divider and GitHub button |
| `client/src/components/signup-form.tsx` | added the carried `next` and the `/login${nextQuery(next)}` link | same: keep their link and effect, drop the divider and the GitHub button |
| `client/src/app/register/page.tsx` | same carry and the `/login${nextQuery(next)}` link | same |
| `backend/index.js` | added the feature switch, the Tourist Visa body parser, the skipped sanitize paths and the status route; two of its comments say "before sessions, passport" | keep all their lines; drop the session, passport and `/api/auth` lines (this branch deletes them); optionally reword those comments |
| `backend/package.json`, `backend/package-lock.json` | added `fontkit`, `pdfjs-dist`, `mongodb-memory-server` and the `test` script (this branch also added the last two earlier) | take the tourist visa branch's files, then run `npm uninstall passport passport-google-oauth20 express-session --legacy-peer-deps` in `backend/` instead of merging the lock file by hand |
| `client/package.json`, `client/package-lock.json` | added the `test:unit` script | take theirs, then remove `@react-oauth/google` (`npm uninstall @react-oauth/google --legacy-peer-deps` in `client/`; check that the lock file diff is only that removal) |
| `client/.env.example` | added `NEXT_PUBLIC_TOURIST_VISA_PREVIEW` and its comment right after the Google line | keep their new lines, delete the `NEXT_PUBLIC_GOOGLE_CLIENT_ID` line |
| `client/src/app/Providers.tsx`, `client/src/redux/slices/auth/*` | not changed by the tourist visa branch | none expected |

Not conflicts, but to tidy after the merge (they refer to removed things):
- `client/src/utils/safeRedirect.ts` (line 22, `AUTH_PATHS` lists `/auth-success`) and `client/src/utils/safeRedirect.test.mjs` (lines 129-130 test it): harmless, the path no longer exists; remove when convenient.
- `backend/tests/indexWiring.test.js` (line 55) passes `SESSION_SECRET` to the server it starts; harmless, can be removed.
- `docs/tourist-visa-handover.md`: the paragraph "Social sign-in: what is covered and what is not" (about line 712), the open items about Google sign-in landing on `/auth-success` and the GitHub buttons (about lines 720 and 1464, and section 2.9), and the note on the old `client/.env` (about line 1254, which names `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) should say that social sign-in was removed in 8j-2b.
- After the merge run `npm test` in `backend/` (the tourist visa tests start many in-memory databases; run them one at a time) and `npm run build` in `client/`.

## Do this after deploying

1. **Check the live database for administrators nobody recognises.** In Atlas or Compass, filter the `users` collection with `{ "role": 1 }` and compare the list with the people who should be administrators; also look at accounts created recently (`createdAt`). `create-admin` and `update-profile` were open until this fix is live, so anyone could have made one.
2. If anything looks wrong, remove the account, change the passwords of the real administrators, and change `JWT_SECRET` (this signs everybody out and makes every existing token invalid).
3. **Rotate the Atlas database user's password.** An old connection string with a password is in the git history of `main` (`backend/config/db.js`, many commits between 2025-08 and 2025-12). Assume it is exposed: use a new database user and password in the production settings, restrict the Atlas network access list, and look at the Atlas access log for connections you do not recognise.

## Not fixed here

The rest of the review (the older routes that need no sign-in, the public upload route, the one-year tokens, rate limits on sign-in, package upgrades and the other items) is still open. See the report of step 8j-1 and section 14.5 of `tourist-visa-handover.md`.
