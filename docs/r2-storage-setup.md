# File storage: Cloudflare R2 (replaces Cloudinary)

All uploads now go to Cloudflare R2 through `backend/config/r2.js`.

| What | Bucket | How it is read |
|---|---|---|
| Passports, bank statements, all assessment documents, Tourist Visa documents | **private** (`R2_PRIVATE_BUCKET`) | Only through a signed link that expires (1 hour on the admin screen, 5 minutes for PDF merge/compress, 2 minutes for Tourist Visa). The database stores `r2://private/<key>`; the API turns it into a signed link when it sends a document to the admin screen. |
| Site logo, admin logo/favicon, testimonial photos, approved-visa photos and flags | **public** (`R2_PUBLIC_BUCKET`) | Plain address `R2_PUBLIC_BASE_URL/<key>` |

Images are resized to fit 1000 x 1000 before they are stored (same as the old Cloudinary setting). PDFs and Word files are stored as sent.

The database field names still say `cloudinaryUrl` / `cloudinaryPublicId` / `uploadType` so old records and the admin screen keep working. For a new file `uploadType` is `r2`; for an old file that has not been migrated yet it is still `cloudinary` and keeps working from Cloudinary.

## 1. One-time Cloudflare setup

1. Cloudflare dashboard > **R2** > create two buckets, e.g. `wiser-private` and `wiser-public`.
2. **Private bucket:** leave "Public access" OFF and do not connect a custom domain.
3. **Public bucket:** Settings > **Custom Domains** > connect e.g. `cdn.wiserconsulting.info` (recommended), or enable the `r2.dev` URL for testing only.
4. R2 > **Manage API tokens** > Create API token > permission **Object Read & Write**, limited to those two buckets. Copy the Access Key ID and Secret Access Key (shown once) and the Account ID.
5. **CORS** (Bucket > Settings > CORS policy), needed so the admin screen's Download button can fetch files. Add to **both** buckets:

```json
[
  {
    "AllowedOrigins": ["https://wiserconsulting.info", "https://www.wiserconsulting.info", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

## 2. Settings in `backend/.env` (server)

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PRIVATE_BUCKET=wiser-private
R2_PUBLIC_BUCKET=wiser-public
R2_PUBLIC_BASE_URL=https://cdn.wiserconsulting.info
```

The old `CLOUDINARY_*` settings are no longer read by the server.

## 3. Install, migrate, deploy

```bash
cd backend
npm install                      # installs @aws-sdk/client-s3, the presigner and sharp; removes cloudinary
node scripts/migrate-cloudinary-to-r2.js           # dry run: lists what would be copied
node scripts/migrate-cloudinary-to-r2.js --apply   # copies the files and updates the database
```

The migration reads each file from the Cloudinary address already stored in the database, copies it to R2 and updates the record. It never deletes anything from Cloudinary and is safe to run again. Check the site and the admin screen, and only then close the Cloudinary account.

## 4. Check by hand

1. Submit the assessment form with a passport photo and a PDF. In the R2 dashboard both appear in the **private** bucket under `visa-assessments/`.
2. Open the submission in the admin screen: preview and Download work. Copy a document link, wait an hour (or edit the expiry in the link): it stops working.
3. Admin > Settings: upload a logo. It appears in the **public** bucket and shows on the site.
4. Add a testimonial and an approved visa with photos: public bucket.
5. Delete a submission: its files disappear from the private bucket.
