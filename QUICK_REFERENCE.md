# Admin Settings Feature - Quick Reference

## 📁 Files Created

### Backend (6 files)

- ✅ `backend/models/AdminSettings.js` - Database schema
- ✅ `backend/repositories/adminSettingsRepository.js` - DB operations
- ✅ `backend/services/adminSettingsService.js` - Business logic
- ✅ `backend/controllers/adminSettingsController.js` - Request handlers
- ✅ `backend/routes/adminSettingsRoutes.js` - API routes
- ✅ `backend/validations/adminSettingsValidation.js` - Input validation

### Frontend (4 files)

- ✅ `client/src/components/admin/AdminSettingsForm.tsx` - Admin form
- ✅ `client/src/services/adminSettingsService.ts` - API client
- ✅ `client/src/components/NavbarDynamic.tsx` - Dynamic navbar
- ✅ `client/src/components/FooterDynamic.tsx` - Dynamic footer

## 🚀 Quick Setup (3 Steps)

### Step 1: Update Backend

Edit `backend/index.js` - Add these 2 lines:

```javascript
// Line 16 - Add import
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");

// Line 81 - Add route registration
app.use("/api/admin-settings", adminSettingsRoutes);
```

### Step 2: Use Dynamic Components

In `client/src/app/layout.tsx`:

```typescript
// Replace old imports with these:
import Navbar from "@/components/NavbarDynamic";
import Footer from "@/components/FooterDynamic";
```

### Step 3: Create Settings Page

Create `client/src/app/admin/settings/page.tsx`:

```typescript
"use client";
import AdminSettingsForm from "@/components/admin/AdminSettingsForm";
export default function SettingsPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <AdminSettingsForm />
        </div>
    );
}
```

## 🔌 API Endpoints

| Method | Endpoint                      | Auth     | Purpose                              |
| ------ | ----------------------------- | -------- | ------------------------------------ |
| GET    | `/admin-settings/public`      | ❌       | Get public settings (navbar, footer) |
| GET    | `/admin-settings`             | ✅ Admin | Get all settings                     |
| PUT    | `/admin-settings`             | ✅ Admin | Update settings                      |
| POST   | `/admin-settings/logo/upload` | ✅ Admin | Upload logo to Cloudinary            |
| DELETE | `/admin-settings/logo`        | ✅ Admin | Delete logo                          |

## 💾 What You Can Update

- **websiteTitle** - Your company/website name
- **email** - Contact email
- **phone** - Phone number
- **address** - Physical address
- **siteLogo** - Upload image to Cloudinary
- **socialLinks** - Facebook, Twitter, LinkedIn, Instagram URLs

## 🎯 Use in Components

```typescript
// Fetch settings in any component
import { adminSettingsService } from "@/services/adminSettingsService";

const settings = await adminSettingsService.getPublicSettings();

// Use it
<h1>{settings.websiteTitle}</h1>
<img src={settings.siteLogo} alt="Logo" />
<a href={`tel:${settings.phone}`}>{settings.phone}</a>
```

## ⚙️ Environment Variables

Ensure `.env` or `.env.local` has:

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 🧪 Test with Postman

```bash
# Get public settings (no auth)
GET http://localhost:5000/api/admin-settings/public

# Get admin settings (with token)
GET http://localhost:5000/api/admin-settings
Header: Authorization: Bearer {your_token}

# Update settings
PUT http://localhost:5000/api/admin-settings
Header: Authorization: Bearer {your_token}
Body: {
  "websiteTitle": "New Title",
  "email": "contact@example.com",
  "phone": "+1 234 567 8900",
  "address": "123 Main St"
}

# Upload logo
POST http://localhost:5000/api/admin-settings/logo/upload
Header: Authorization: Bearer {your_token}
Form: logo [select image file]
```

## ✨ Features

✅ Mongoose schema with timestamps  
✅ Cloudinary integration for logo  
✅ Admin-only endpoints  
✅ Public read-only endpoint  
✅ Input validation  
✅ Error handling  
✅ File upload (max 5MB images)  
✅ Automatic old logo deletion  
✅ React form with preview  
✅ Dynamic navbar/footer components

## 🐛 Debugging

| Issue                      | Solution                                         |
| -------------------------- | ------------------------------------------------ |
| Logo not uploading         | Check Cloudinary credentials, file < 5MB         |
| Settings not showing       | Verify API_URL is correct, check browser console |
| 401 Unauthorized           | User must be admin (role = 1) and logged in      |
| CORS errors                | Check allowed origins in backend index.js        |
| Logo appears but not saved | Wait for Cloudinary processing, refresh page     |

## 📚 File Structure

```
Admin Settings Feature
├── Backend
│   ├── Model (schema)
│   ├── Repository (CRUD)
│   ├── Service (logic)
│   ├── Controller (handlers)
│   ├── Routes (endpoints)
│   └── Validation (input)
├── Frontend
│   ├── Service (API calls)
│   ├── Form (admin UI)
│   ├── Navbar (dynamic)
│   └── Footer (dynamic)
└── Documentation
    ├── ADMIN_SETTINGS_SETUP.md (detailed)
    └── QUICK_REFERENCE.md (this file)
```

## 🎓 Architecture Pattern

Your codebase follows **Service-Repository Pattern**:

```
Controller → Service → Repository → Database
```

The Admin Settings feature follows the same pattern for consistency!

## 📝 Next Steps

1. ✅ Add route to admin dashboard → `/admin/settings`
2. ✅ Test all endpoints with Postman
3. ✅ Verify navbar/footer show updated settings
4. ✅ Add more settings fields if needed (favicon, theme colors, etc.)
5. ✅ Set up CI/CD for auto-deployment

---

**Need detailed setup?** → See `ADMIN_SETTINGS_SETUP.md`  
**Questions?** → Check troubleshooting section in setup guide
