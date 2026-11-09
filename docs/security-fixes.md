# Security fixes

## 8j-2: the two critical findings (A1 and A2)

Found by the security review of the Tourist Visa feature (step 8j-1). Both were in the older part of the site, not in the Tourist Visa code, but an administrator can read every applicant's data, so they had to be closed first. This change is on its own branch (`fix/critical-auth-hardening`, made from `main`) so it can be deployed without the Tourist Visa feature.

**A1. Anyone could create an administrator.** `POST /api/create-admin` needed no sign-in. The route, its controller method, its service method and its schema are removed (nothing in the client or the scripts called it). The first administrator is now created with `backend/scripts/create-first-admin.js`, run by a person with access to the server: the email, the password and (optionally) the name come from environment variables that person sets in their own shell (the comment at the top of the script shows how, without leaving the password in the shell history); it refuses a weak password, a duplicate email or name, and a missing value; it hashes the password exactly as the sign-up does; it prints one success line and never the password. After that, an existing administrator can promote an account with `PUT /api/update-user-role/:userId`.

**A2. Any signed-in user could make themselves an administrator.** `PUT /api/update-profile` passed the whole request body to the database, and the validation middleware threw its cleaned result away. Now:
- the profile update copies only `name`, `phone`, `address` and `city` (in the service, and the route's schema is strict, so any other key, such as `role`, `password`, `email` or `isDeleted`, is a 400);
- `middleware/validate.js` replaces `req.body` with the validated, cleaned body, so every route that uses it now passes on only what its schema allows (this also closes the same pattern in the site settings, testimonial, approved visa and public assessment routes);
- the schemas of the user routes (sign-up, login, profile, role, Google token) are strict.

Run the tests with `npm test` in `backend/` (they use an in-memory database).

## Do this after deploying

1. **Check the live database for administrators nobody recognises.** In Atlas or Compass, filter the `users` collection with `{ "role": 1 }` and compare the list with the people who should be administrators; also look at accounts created recently (`createdAt`). `create-admin` and `update-profile` were open until this fix is live, so anyone could have made one.
2. If anything looks wrong, remove the account, change the passwords of the real administrators, and change `JWT_SECRET` (this signs everybody out and makes every existing token invalid).
3. **Rotate the Atlas database user's password.** An old connection string with a password is in the git history of `main` (`backend/config/db.js`, many commits between 2025-08 and 2025-12). Assume it is exposed: use a new database user and password in the production settings, restrict the Atlas network access list, and look at the Atlas access log for connections you do not recognise.

## Not fixed here

The rest of the review (the older routes that need no sign-in, the public upload route, Google sign-in, the one-year tokens, rate limits on sign-in, package upgrades and the other items) is still open. See the report of step 8j-1 and section 14.5 of `tourist-visa-handover.md`.
