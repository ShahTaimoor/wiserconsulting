# Admin Settings Feature - Setup Guide

## Overview

This guide walks you through implementing the Admin Settings feature in your MERN stack app. This feature allows admins to update global information including Phone Number, Address, Email, Site Logo, Website Title, and Social Links.

## What's Included

### Backend Files Created

1. **Models**: `backend/models/AdminSettings.js` - Mongoose schema for settings
2. **Repository**: `backend/repositories/adminSettingsRepository.js` - Database operations
3. **Service**: `backend/services/adminSettingsService.js` - Business logic
4. **Controller**: `backend/controllers/adminSettingsController.js` - Request handlers
5. **Routes**: `backend/routes/adminSettingsRoutes.js` - API endpoints
6. **Validations**: `backend/validations/adminSettingsValidation.js` - Input validation

### Frontend Files Created

1. **Form Component**: `client/src/components/admin/AdminSettingsForm.tsx` - Admin settings form
2. **Service**: `client/src/services/adminSettingsService.ts` - API client
3. **Navbar Component**: `client/src/components/NavbarDynamic.tsx` - Dynamic navbar using settings

---

## Backend Setup

### Step 1: Register Routes in Backend

Add the following import and route registration to `backend/index.js`:

```javascript
// Add this with other route imports (around line 8-12)
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");

// Add this with other route registrations (around line 78-82)
app.use("/api/admin-settings", adminSettingsRoutes);
```

**Location in index.js**:

```javascript
// BEFORE this line:
app.use("/api/contacts", contactRoutes);

// ADD this line:
app.use("/api/admin-settings", adminSettingsRoutes);
```

### Step 2: Verify Cloudinary Setup

Ensure your `backend/config/cloudinary.js` exports `cloudinaryUpload` for multer:

```javascript
// The config file should already have this - verify it exists:
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// Add this if not present
const cloudinaryUpload = multer({
  storage: localStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images allowed."));
    }
  },
});

module.exports = {
  cloudinary,
  cloudinaryUpload,
  localStorage,
};
```

### Step 3: Database Initialization

When the backend starts for the first time, the AdminSettings collection will be automatically created. Default settings will be inserted on first API call.

---

## Frontend Setup

### Step 1: Install Dependencies (if needed)

Ensure you have axios installed:

```bash
npm install axios
```

### Step 2: Replace Navbar Component

Choose one of these options:

**Option A: Use the new dynamic Navbar**
Replace your import in `src/app/layout.tsx`:

```typescript
// OLD:
import Navbar from "@/components/Navbar";

// NEW:
import Navbar from "@/components/NavbarDynamic";
```

**Option B: Update existing Navbar**
Copy the settings-fetching logic from `NavbarDynamic.tsx` to your existing `Navbar.tsx`.

### Step 3: Set Environment Variables

Ensure `.env.local` in `client/` has:

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
# or for production
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

---

## API Endpoints

### Public Endpoints (No Authentication Required)

#### Get Public Settings

```http
GET /api/admin-settings/public
```

**Response**:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "websiteTitle": "Wiser Consulting",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 234 567 8900",
    "address": "123 Main St, City, State 12345",
    "siteLogo": "https://cloudinary.com/...",
    "socialLinks": {
      "facebook": "https://facebook.com/wiserconsulting",
      "twitter": "https://twitter.com/wiserconsulting",
      "linkedin": "https://linkedin.com/company/wiserconsulting",
      "instagram": "https://instagram.com/wiserconsulting"
    }
  }
}
```

### Admin-Only Endpoints (Requires Authentication & Admin Role)

#### Get Admin Settings

```http
GET /api/admin-settings
Authorization: Bearer {token}
```

#### Update Settings

```http
PUT /api/admin-settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "websiteTitle": "New Title",
  "email": "newemail@domain.com",
  "phone": "+1 987 654 3210",
  "address": "New Address",
  "socialLinks": {
    "facebook": "https://facebook.com/...",
    "twitter": "https://twitter.com/...",
    "linkedin": "https://linkedin.com/...",
    "instagram": "https://instagram.com/..."
  }
}
```

#### Upload Logo

```http
POST /api/admin-settings/logo/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
  logo: [image file]
```

#### Delete Logo

```http
DELETE /api/admin-settings/logo
Authorization: Bearer {token}
```

---

## Using the Admin Settings Form

### Step 1: Create Admin Settings Page

Create `client/src/app/admin/settings/page.tsx`:

```typescript
"use client";

import { useAppSelector } from "@/redux/hooks";
import AdminSettingsForm from "@/components/admin/AdminSettingsForm";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdminRole } from "@/utils/authRole";

export default function AdminSettingsPage() {
    const router = useRouter();
    const { user, loading } = useAppSelector((state) => state.auth);

    useEffect(() => {
        if (!loading && (!user || !isAdminRole(user.role))) {
            router.push("/login");
        }
    }, [user, loading, router]);

    if (loading || !user) {
        return <div>Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <AdminSettingsForm />
        </div>
    );
}
```

### Step 2: Add Link in Admin Dashboard

Add a link to settings in your admin dashboard navigation:

```typescript
<Link href="/admin/settings">Settings</Link>
```

---

## Dynamic Logo & Title in Header

The `NavbarDynamic.tsx` component automatically:

1. **Fetches** public settings on mount
2. **Displays** the logo and website title
3. **Updates** when settings change (refreshes every time the page loads)
4. **Caches** settings to prevent unnecessary API calls

### Custom Implementation

If you want to use settings in other components:

```typescript
import { adminSettingsService } from "@/services/adminSettingsService";

// In your component
const [settings, setSettings] = useState<AdminSettings | null>(null);

useEffect(() => {
    const fetchSettings = async () => {
        const publicSettings = await adminSettingsService.getPublicSettings();
        setSettings(publicSettings);
    };
    fetchSettings();
}, []);

// Use settings
<h1>{settings?.websiteTitle}</h1>
<img src={settings?.siteLogo} alt="Logo" />
```

---

## Testing the Feature

### Using Postman/Thunder Client

1. **Get Public Settings** (no auth needed):

   ```
   GET http://localhost:5000/api/admin-settings/public
   ```

2. **Login as Admin** (get token):

   ```
   POST http://localhost:5000/api/auth/login
   Body: { "email": "admin@example.com", "password": "..." }
   ```

3. **Update Settings**:

   ```
   PUT http://localhost:5000/api/admin-settings
   Authorization: Bearer [token]
   Body: {
     "websiteTitle": "My Company",
     "email": "contact@mycompany.com",
     "phone": "+1 234 567 8900",
     "address": "123 Main St"
   }
   ```

4. **Upload Logo**:
   ```
   POST http://localhost:5000/api/admin-settings/logo/upload
   Authorization: Bearer [token]
   Form Data: logo [select image file]
   ```

### Using the Admin Form

1. Navigate to `/admin/settings`
2. Fill in the form fields
3. Upload a logo (optional)
4. Click "Save Settings"
5. Check the navbar - the logo and title should update

---

## Features

✅ **Text Settings**: Website Title, Email, Phone, Address  
✅ **Logo Upload**: Upload to Cloudinary with automatic old logo deletion  
✅ **Social Links**: Store Facebook, Twitter, LinkedIn, Instagram URLs  
✅ **Public API**: Get settings without authentication  
✅ **Admin Protection**: Update endpoints require admin role  
✅ **File Validation**: Only images allowed, max 5MB  
✅ **Real-time Updates**: Navbar updates with new settings  
✅ **Error Handling**: Comprehensive error messages  
✅ **Loading States**: UX indicators while loading/uploading

---

## Troubleshooting

### Logo Not Uploading

- Check Cloudinary credentials in `.env`
- Verify file is an image (JPEG, PNG, GIF, WebP)
- File size must be < 5MB

### Settings Not Appearing in Navbar

- Ensure `NEXT_PUBLIC_API_URL` is set correctly
- Check browser console for API errors
- Verify admin settings exist in database

### "Unauthorized" Error

- Ensure user is logged in and has admin role (role = 1)
- Check token is being sent in Authorization header
- Token may have expired

### Logo Displays But Settings Don't Update

- Wait a few seconds for Cloudinary processing
- Refresh the page
- Check network tab in browser DevTools

---

## Next Steps

1. ✅ Add links to admin settings in your admin dashboard
2. ✅ Test all API endpoints
3. ✅ Update any other components that need dynamic settings
4. ✅ Add more settings fields as needed
5. ✅ Consider adding favicon upload (follow same pattern as logo)

---

## File Locations Summary

```
backend/
├── models/
│   └── AdminSettings.js
├── repositories/
│   └── adminSettingsRepository.js
├── services/
│   └── adminSettingsService.js
├── controllers/
│   └── adminSettingsController.js
├── routes/
│   └── adminSettingsRoutes.js
└── validations/
    └── adminSettingsValidation.js

client/src/
├── components/
│   ├── admin/
│   │   └── AdminSettingsForm.tsx
│   └── NavbarDynamic.tsx
└── services/
    └── adminSettingsService.ts
```

---

## Need Help?

Check the following:

1. Are all files in the correct locations?
2. Is the route registered in `backend/index.js`?
3. Is `NEXT_PUBLIC_API_URL` set correctly?
4. Are you authenticated and have admin role?
5. Check browser console and server logs for errors
