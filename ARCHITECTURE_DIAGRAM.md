# Admin Settings Feature - Architecture & Data Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT (React/Next.js)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Admin Settings Page (/admin/settings)            │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │         AdminSettingsForm.tsx                       │ │  │
│  │  │  - Website Title Input                              │ │  │
│  │  │  - Email Input                                      │ │  │
│  │  │  - Phone Input                                      │ │  │
│  │  │  - Address Textarea                                 │ │  │
│  │  │  - Logo Upload (Cloudinary)                         │ │  │
│  │  │  - Social Links (Facebook, Twitter, etc.)           │ │  │
│  │  │  - Form Validation                                  │ │  │
│  │  │  - Loading States                                   │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │    adminSettingsService.ts (API Client)                 │  │
│  │                                                            │  │
│  │  • getPublicSettings() - GET /admin-settings/public      │  │
│  │  • getSettings(token) - GET /admin-settings              │  │
│  │  • updateSettings(data, token) - PUT /admin-settings     │  │
│  │  • uploadLogo(file, token) - POST /admin-settings/logo   │  │
│  │  • deleteLogo(token) - DELETE /admin-settings/logo       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Dynamic UI Components                            │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │         NavbarDynamic.tsx                           │ │  │
│  │  │  - Fetches public settings on mount                 │ │  │
│  │  │  - Displays logo from settings                      │ │  │
│  │  │  - Shows website title dynamically                  │ │  │
│  │  │  - Updates when settings change                     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │         FooterDynamic.tsx                           │ │  │
│  │  │  - Displays contact information                     │ │  │
│  │  │  - Shows social media links                         │ │  │
│  │  │  - Uses logo from settings                          │ │  │
│  │  │  - Company name from settings                       │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    HTTP/HTTPS │ CORS Enabled
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  SERVER (Node.js/Express)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Routes: /api/admin-settings                    │  │
│  │                                                            │  │
│  │  GET    /public          - No auth required              │  │
│  │  GET    /                - Auth + Admin required         │  │
│  │  PUT    /                - Auth + Admin required         │  │
│  │  POST   /logo/upload     - Auth + Admin required         │  │
│  │  DELETE /logo            - Auth + Admin required         │  │
│  │                                                            │  │
│  │  ┌──── Middleware Stack ────────────────────────────┐  │  │
│  │  │ ├── CORS & Body Parser                            │  │  │
│  │  │ ├── Validation (Joi Schema)                       │  │  │
│  │  │ ├── Authentication (isAuthorized)                 │  │  │
│  │  │ ├── Authorization (isAdmin)                       │  │  │
│  │  │ └── File Upload (Multer + Cloudinary)             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │    adminSettingsController.js                           │  │
│  │                                                            │  │
│  │  ├── getSettings()        - Fetch admin settings         │  │
│  │  ├── getPublicSettings()  - Fetch public settings        │  │
│  │  ├── updateSettings()     - Update text fields           │  │
│  │  ├── updateLogo()         - Upload logo                  │  │
│  │  └── deleteLogo()         - Delete logo                  │  │
│  │                                                            │  │
│  │  (Only validates request format, calls service)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │    adminSettingsService.js                              │  │
│  │                                                            │  │
│  │  ├── Business Logic                                      │  │
│  │  │  ├── Handle logo upload to Cloudinary                 │  │
│  │  │  ├── Delete old logos                                 │  │
│  │  │  └── Validate data                                    │  │
│  │  │                                                         │  │
│  │  └── Calls Repository for DB operations                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │    adminSettingsRepository.js                           │  │
│  │                                                            │  │
│  │  ├── getSettings()        - Query DB for settings        │  │
│  │  ├── updateSettings()     - Update DB settings           │  │
│  │  ├── updateLogo()         - Update logo & publicId       │  │
│  │  └── getPublicSettings()  - Query public fields only     │  │
│  │                                                            │  │
│  │  (Pure database operations with Mongoose)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                    External  │ Internal                         │
│          ┌───────────────────┼───────────────────┐             │
│          ↓                   ↓                   ↓             │
│    ┌─────────────┐  ┌──────────────┐   ┌──────────────┐       │
│    │ Cloudinary  │  │  MongoDB     │   │  JWT Secret  │       │
│    │  (Upload)   │  │  (Persist)   │   │  (Verify)    │       │
│    └─────────────┘  └──────────────┘   └──────────────┘       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### 1. Admin Updates Settings (Text Fields)

```
┌─────────────────────────────────────────────────────────────────┐
│ User fills form and clicks "Save Settings"                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ AdminSettingsForm.tsx                                            │
│ - Validates form data locally                                    │
│ - Calls adminSettingsService.updateSettings()                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsService.ts                                          │
│ - Sends PUT /api/admin-settings with data                        │
│ - Includes Authorization Bearer token                            │
│ - Shows loading spinner                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Backend Routes - adminSettingsRoutes.js                          │
│ - Validates token (isAuthorized)                                 │
│ - Checks admin role (isAdmin)                                    │
│ - Validates input (updateSettingsSchema)                         │
│ - Calls adminSettingsController.updateSettings()                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsController.js                                       │
│ - Receives request                                               │
│ - Calls adminSettingsService.updateSettings()                    │
│ - Returns response                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsService.js                                          │
│ - Extracts relevant fields                                       │
│ - Calls adminSettingsRepository.updateSettings()                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsRepository.js                                       │
│ - Uses Mongoose to update AdminSettings document                 │
│ - Returns updated settings                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ MongoDB                                                           │
│ - Stores updated settings in database                             │
│ - Updates timestamp                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ↓                           ↓
        ┌──────────────────┐       ┌──────────────────┐
        │ Return to Client │       │ Store in Cache   │
        │ Updated Settings │       │ (Optional)       │
        └──────────────────┘       └──────────────────┘
                │                           │
                └─────────────┬─────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ AdminSettingsForm.tsx                                            │
│ - Updates form state                                             │
│ - Shows success toast message                                    │
│ - Hides loading spinner                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Next time user visits:                                           │
│ - NavbarDynamic fetches public settings → Shows updated title    │
│ - FooterDynamic fetches public settings → Shows updated info     │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Logo Upload Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User selects image from computer                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ AdminSettingsForm.tsx - handleLogoChange()                       │
│ - Validates file type (image only)                               │
│ - Validates file size (< 5MB)                                    │
│ - Shows preview                                                  │
│ - Sets logoFile state                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ User clicks "Upload Logo" button                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ AdminSettingsForm.tsx - uploadLogo()                             │
│ - Creates FormData with file                                     │
│ - Calls POST /api/admin-settings/logo/upload                     │
│ - Shows upload spinner                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Backend Routes - adminSettingsRoutes.js                          │
│ - Validates token (isAuthorized)                                 │
│ - Checks admin role (isAdmin)                                    │
│ - Uses cloudinaryUpload.single('logo') middleware                │
│ - Calls adminSettingsController.updateLogo()                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsController.js - updateLogo()                        │
│ - Gets current settings (for old logo ID)                        │
│ - Calls adminSettingsService.updateLogo()                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsService.js - updateLogo()                           │
│ - Gets old logoPublicId                                          │
│ ├─ If exists: Delete from Cloudinary                             │
│ └─ Upload new file to Cloudinary using stream                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    ↓                    ↓
            ┌─────────────────┐  ┌────────────────┐
            │ Cloudinary      │  │ Delete Old     │
            │ Upload Complete │  │ Logo Success   │
            └─────────────────┘  └────────────────┘
                    │                    │
                    └─────────┬──────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsRepository.js - updateLogo()                        │
│ - Update logo URL and logoPublicId in database                   │
│ - Return updated settings                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Response travels back to frontend                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ AdminSettingsForm.tsx                                            │
│ - Updates form state with new settings                           │
│ - Updates preview image                                          │
│ - Shows success message                                          │
│ - Hides upload button                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Next time navbar/footer loads                                     │
│ - Fetches /api/admin-settings/public                             │
│ - Gets new logo URL from settings                                │
│ - Displays updated logo                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Public Settings Fetch Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User visits website (any page)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ NavbarDynamic.tsx - useEffect on mount                            │
│ - Calls adminSettingsService.getPublicSettings()                 │
│ - Shows loading indicator                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsService.ts - getPublicSettings()                    │
│ - Sends GET /api/admin-settings/public                           │
│ - No authorization header needed                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Backend Routes - adminSettingsRoutes.js                          │
│ - No authentication required                                     │
│ - Calls adminSettingsController.getPublicSettings()              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsController.js - getPublicSettings()                 │
│ - Calls adminSettingsService.getPublicSettings()                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsService.js - getPublicSettings()                    │
│ - Calls adminSettingsRepository.getPublicSettings()              │
│ - Returns only: websiteTitle, email, phone, address, siteLogo,   │
│   socialLinks (no admin-only fields)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ adminSettingsRepository.js - getPublicSettings()                 │
│ - Queries MongoDB for settings                                   │
│ - Projects only public fields                                    │
│ - Returns cached default if not found                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Response travels back to client                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ NavbarDynamic.tsx                                                │
│ - Updates state with settings                                    │
│ - Renders logo (if exists)                                       │
│ - Renders website title                                          │
│ - Removes loading indicator                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ FooterDynamic.tsx (same process)                                 │
│ - Fetches public settings                                        │
│ - Displays contact info & social links                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Relationships

```
┌──────────────────────────────────┐
│      AdminSettings Document      │
├──────────────────────────────────┤
│ _id                  ObjectId    │
│ websiteTitle         String       │ ← Used in Navbar
│ email                String       │ ← Used in Footer
│ phone                String       │ ← Used in Footer
│ address              String       │ ← Used in Footer
│ siteLogo             String (URL) │ ← Used in Navbar/Footer
│ logoPublicId         String       │ ← For Cloudinary deletion
│ favicon              String       │ ← For future use
│ faviconPublicId      String       │ ← For future use
│ socialLinks          Object       │
│ ├─ facebook          String       │ ← Used in Footer
│ ├─ twitter           String       │ ← Used in Footer
│ ├─ linkedin          String       │ ← Used in Footer
│ └─ instagram         String       │ ← Used in Footer
│ isDeleted            Boolean      │ ← Soft delete
│ createdAt            Date         │
│ updatedAt            Date         │
└──────────────────────────────────┘
         │
         ├─→ Used by NavbarDynamic.tsx
         ├─→ Used by FooterDynamic.tsx
         ├─→ Updated by AdminSettingsForm.tsx
         └─→ Managed by adminSettingsService.js
```

---

## Request/Response Examples

### Example 1: Get Public Settings Request

```http
GET /api/admin-settings/public HTTP/1.1
Host: localhost:5000
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "websiteTitle": "Wiser Consulting",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 (555) 123-4567",
    "address": "123 Main Street, New York, NY 10001",
    "siteLogo": "https://res.cloudinary.com/...",
    "socialLinks": {
      "facebook": "https://facebook.com/wiserconsulting",
      "twitter": "https://twitter.com/wiserconsulting",
      "linkedin": "https://linkedin.com/company/wiserconsulting",
      "instagram": "https://instagram.com/wiserconsulting"
    }
  }
}
```

### Example 2: Update Settings Request

```http
PUT /api/admin-settings HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "websiteTitle": "Wiser Consulting LLC",
  "email": "newemail@wiserconsulting.com",
  "phone": "+1 (555) 987-6543",
  "address": "456 Broadway, New York, NY 10002",
  "socialLinks": {
    "facebook": "https://facebook.com/wiserconsultingllc",
    "twitter": "https://twitter.com/wiserconsultingllc",
    "linkedin": "https://linkedin.com/company/wiser-consulting-llc",
    "instagram": "https://instagram.com/wiserconsultingllc"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "websiteTitle": "Wiser Consulting LLC",
    "email": "newemail@wiserconsulting.com",
    "phone": "+1 (555) 987-6543",
    "address": "456 Broadway, New York, NY 10002",
    "siteLogo": "https://res.cloudinary.com/...",
    "logoPublicId": "admin-settings/abc123xyz",
    "socialLinks": {
      "facebook": "https://facebook.com/wiserconsultingllc",
      "twitter": "https://twitter.com/wiserconsultingllc",
      "linkedin": "https://linkedin.com/company/wiser-consulting-llc",
      "instagram": "https://instagram.com/wiserconsultingllc"
    },
    "updatedAt": "2024-01-15T14:45:00Z"
  }
}
```

### Example 3: Upload Logo Request

```http
POST /api/admin-settings/logo/upload HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="logo"; filename="logo.png"
Content-Type: image/png

[Binary image data...]
------WebKitFormBoundary--
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "websiteTitle": "Wiser Consulting LLC",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 (555) 123-4567",
    "address": "456 Broadway, New York, NY 10002",
    "siteLogo": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/admin-settings/logo_xyz123.png",
    "logoPublicId": "admin-settings/logo_xyz123",
    "socialLinks": {...},
    "updatedAt": "2024-01-15T15:00:00Z"
  }
}
```

---

## Security & Authentication Flow

```
┌──────────────────────────────────────────────────────┐
│ User sends request with JWT token in header          │
└──────────────────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────┐
│ isAuthorized Middleware                              │
│ - Extract token from Authorization header            │
│ - Verify JWT signature using JWT_SECRET              │
│ - Decode token to get user ID                        │
│ - Query database for user                            │
│ - Attach user to request object                      │
│ - If any step fails → Return 401 Unauthorized        │
└──────────────────────────────────────────────────────┘
                       │
                       ↓ (if admin-only endpoint)
┌──────────────────────────────────────────────────────┐
│ isAdmin Middleware                                   │
│ - Check if user.role === 1                           │
│ - If not → Return 403 Forbidden                      │
│ - Otherwise → Continue to controller                 │
└──────────────────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────┐
│ Validation Middleware                                │
│ - Validate request body against Joi schema           │
│ - Check email format, URL format, etc.               │
│ - If invalid → Return 400 Bad Request                │
│ - Otherwise → Continue to controller                 │
└──────────────────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────┐
│ Controller → Service → Repository                    │
│ (Trusted layer - no further validation needed)       │
└──────────────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Panel Layout                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Sidebar Navigation                                      │   │
│  │ ├── Dashboard                                           │   │
│  │ ├── Users                                               │   │
│  │ ├── Products                                            │   │
│  │ ├── Orders                                              │   │
│  │ └── Settings ← [NEW] ⭐                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│          │                                                       │
│          └──→ Click on Settings                                 │
│                       │                                         │
│                       ↓                                         │
│       ┌──────────────────────────────────────┐                 │
│       │ /admin/settings Page                 │                 │
│       ├──────────────────────────────────────┤                 │
│       │ ┌─ Admin Auth Check ─────────────┐  │                 │
│       │ │ Protected from non-admins       │  │                 │
│       │ └─────────────────────────────────┘  │                 │
│       │                                      │                 │
│       │ ┌─ AdminSettingsForm ──────────────┐ │                 │
│       │ │ Website Title: [_____________]   │ │                 │
│       │ │ Email: [_______________________] │ │                 │
│       │ │ Phone: [_______________________] │ │                 │
│       │ │ Address: [_____________________] │ │                 │
│       │ │                                   │ │                 │
│       │ │ Logo Upload: [Drop area]         │ │                 │
│       │ │ Facebook: [_____________________ │ │                 │
│       │ │ Twitter: [_____________________] │ │                 │
│       │ │ LinkedIn: [____________________] │ │                 │
│       │ │ Instagram: [___________________] │ │                 │
│       │ │                                   │ │                 │
│       │ │ [Save Settings Button]           │ │                 │
│       │ └─────────────────────────────────┘  │                 │
│       │                                      │                 │
│       │ ← Calls adminSettingsService.ts →   │                 │
│       │ ← Updates via REST API →             │                 │
│       └──────────────────────────────────────┘                 │
│                                                                   │
│       ↓ (Settings Updated)                                       │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Navbar (appears on ALL pages)                            │  │
│  │ ┌────────────────────────────────────────────────────┐  │  │
│  │ │ [Logo] Wiser Consulting                            │  │  │
│  │ │                                                     │  │  │
│  │ │ Home | About | Services | Contact | Dashboard      │  │  │
│  │ └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                      ↑ Updated dynamically                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Footer (appears on ALL pages)                            │  │
│  │ ┌────────────────────────────────────────────────────┐  │  │
│  │ │ [Logo] Company Name                                │  │  │
│  │ │ 📧 Email: contact@...                              │  │  │
│  │ │ 📱 Phone: +1 (555) ...                              │  │  │
│  │ │ 📍 Address: 123 Main St...                          │  │  │
│  │ │                                                     │  │  │
│  │ │ Follow Us:                                          │  │  │
│  │ │ f 𝕏 in ig                                           │  │  │
│  │ └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                      ↑ Updated dynamically                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

This architecture ensures:
✅ Clean separation of concerns
✅ Scalable and maintainable code
✅ Secure authentication and authorization
✅ Efficient database queries
✅ Real-time UI updates
✅ Professional error handling
