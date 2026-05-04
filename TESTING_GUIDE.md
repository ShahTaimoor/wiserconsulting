# Admin Settings Feature - Testing Guide

## Prerequisites

Before testing, ensure:

- ✅ Backend is running on `http://localhost:5000`
- ✅ Frontend is running on `http://localhost:3000`
- ✅ MongoDB is connected
- ✅ An admin account exists in your database (role = 1)
- ✅ Cloudinary credentials are set in `.env`

---

## Manual Testing Steps

### 1. Test Public Settings API (No Auth)

**Using Postman/Thunder Client:**

```
GET http://localhost:5000/api/admin-settings/public
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "websiteTitle": "Wiser Consulting",
    "email": "",
    "phone": "",
    "address": "",
    "siteLogo": null,
    "socialLinks": {}
  }
}
```

**What to check:**

- ✅ Returns 200 status
- ✅ No authorization required
- ✅ Contains all expected fields
- ✅ siteLogo is null initially

---

### 2. Admin Login to Get Token

```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your_admin_password"
}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "name": "Admin Name",
      "email": "admin@example.com",
      "role": 1
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Important:** Copy the token for next requests

---

### 3. Get Admin Settings (Auth Required)

```
GET http://localhost:5000/api/admin-settings
Authorization: Bearer {your_token_here}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "websiteTitle": "Wiser Consulting",
    "email": "",
    "phone": "",
    "address": "",
    "siteLogo": null,
    "socialLinks": {}
  }
}
```

**Test Cases:**

- ✅ Returns 200 with valid token
- ✅ Returns 401 without token
- ✅ Returns 401 with invalid token
- ✅ Returns 403 with non-admin user token

---

### 4. Update Text Settings

```
PUT http://localhost:5000/api/admin-settings
Authorization: Bearer {your_token_here}
Content-Type: application/json

{
  "websiteTitle": "Wiser Consulting LLC",
  "email": "contact@wiserconsulting.com",
  "phone": "+1 (555) 123-4567",
  "address": "123 Main Street, New York, NY 10001",
  "socialLinks": {
    "facebook": "https://facebook.com/wiserconsulting",
    "twitter": "https://twitter.com/wiserconsulting",
    "linkedin": "https://linkedin.com/company/wiserconsulting",
    "instagram": "https://instagram.com/wiserconsulting"
  }
}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "websiteTitle": "Wiser Consulting LLC",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 (555) 123-4567",
    "address": "123 Main Street, New York, NY 10001",
    "socialLinks": {
      "facebook": "https://facebook.com/wiserconsulting",
      "twitter": "https://twitter.com/wiserconsulting",
      "linkedin": "https://linkedin.com/company/wiserconsulting",
      "instagram": "https://instagram.com/wiserconsulting"
    }
  }
}
```

**Test Cases:**

- ✅ All fields update correctly
- ✅ Email validation works (invalid email fails)
- ✅ Partial updates work (send only some fields)
- ✅ Returns 401 without token
- ✅ Returns 403 for non-admin users

---

### 5. Upload Logo

```
POST http://localhost:5000/api/admin-settings/logo/upload
Authorization: Bearer {your_token_here}
Content-Type: multipart/form-data

Form Data:
  logo: [select a PNG/JPG/GIF file from your computer]
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "websiteTitle": "Wiser Consulting LLC",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 (555) 123-4567",
    "address": "123 Main Street, New York, NY 10001",
    "siteLogo": "https://res.cloudinary.com/...",
    "logoPublicId": "admin-settings/abc123xyz",
    "socialLinks": { ... }
  }
}
```

**Test Cases:**

- ✅ Accepts PNG, JPG, GIF, WebP files
- ✅ Rejects non-image files (returns 400)
- ✅ Rejects files > 5MB (returns 400)
- ✅ Old logo is deleted from Cloudinary
- ✅ New logo URL is stored and accessible
- ✅ Returns 401 without token
- ✅ Returns 403 for non-admin users
- ✅ Returns 400 if no file provided

**To test file rejection:**

- Try uploading a .txt file → should fail
- Try uploading a file > 5MB → should fail
- Try uploading without selecting file → should fail

---

### 6. Delete Logo

```
DELETE http://localhost:5000/api/admin-settings/logo
Authorization: Bearer {your_token_here}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "websiteTitle": "Wiser Consulting LLC",
    "email": "contact@wiserconsulting.com",
    "phone": "+1 (555) 123-4567",
    "address": "123 Main Street, New York, NY 10001",
    "siteLogo": null,
    "logoPublicId": null,
    "socialLinks": { ... }
  }
}
```

**Test Cases:**

- ✅ Logo is deleted from Cloudinary
- ✅ Logo fields set to null
- ✅ Returns 401 without token
- ✅ Returns 403 for non-admin users
- ✅ Can upload new logo again after delete

---

## Frontend Testing

### Test Admin Settings Form

1. **Navigate to Settings Page**

   ```
   http://localhost:3000/admin/settings
   ```

2. **Verify Initial Load**
   - ✅ Form loads without errors
   - ✅ Current settings are populated
   - ✅ Logo preview shows if exists
   - ✅ No loading spinner after 2 seconds

3. **Test Text Fields**
   - ✅ Change website title → click save → page updates
   - ✅ Change email → click save → visible in form
   - ✅ Change phone → click save → preserved
   - ✅ Change address → click save → preserved

4. **Test Logo Upload**
   - ✅ Drag and drop image → preview appears
   - ✅ Click upload button → spinner shows
   - ✅ Logo uploads → preview updates
   - ✅ Can delete logo → preview removed

5. **Test Social Links**
   - ✅ Enter Facebook URL → saves
   - ✅ Enter Twitter URL → saves
   - ✅ Enter LinkedIn URL → saves
   - ✅ Enter Instagram URL → saves

6. **Test Validation**
   - ✅ Invalid email → error message
   - ✅ File > 5MB → error message
   - ✅ Non-image file → error message

### Test Dynamic Navbar

1. **Update Settings** (admin panel)
   - Set `websiteTitle` = "New Title"
   - Set `siteLogo` = upload image
   - Save

2. **Check Navbar**

   ```
   http://localhost:3000/
   ```

   - ✅ Logo appears in navbar
   - ✅ Title shows "New Title"
   - ✅ Updates appear immediately

3. **Test in Different Pages**
   - ✅ Home page shows updated values
   - ✅ About page shows updated values
   - ✅ Services page shows updated values
   - ✅ Contact page shows updated values

4. **Test Navbar on Different Screens**
   - ✅ Desktop: Logo and title visible
   - ✅ Tablet: Logo and title visible
   - ✅ Mobile: Logo and title visible

### Test Dynamic Footer

1. **Check Footer**

   ```
   Scroll to bottom of http://localhost:3000/
   ```

   - ✅ Logo appears in footer
   - ✅ Title shows correct value
   - ✅ Email is clickable (mailto link)
   - ✅ Phone is clickable (tel link)
   - ✅ Address is displayed
   - ✅ Social icons show (if URLs are set)

2. **Test Social Links in Footer**
   - ✅ Facebook icon links to Facebook
   - ✅ Twitter icon links to Twitter
   - ✅ LinkedIn icon links to LinkedIn
   - ✅ Instagram icon links to Instagram
   - ✅ Only show icons if URL is set

---

## Error Scenarios Testing

### Test 401 Unauthorized

```bash
# Without token
GET http://localhost:5000/api/admin-settings

# Expected: 401 Unauthorized
{
  "success": false,
  "message": "Please log in first."
}
```

### Test 403 Forbidden (Non-Admin User)

```bash
# With non-admin user token
GET http://localhost:5000/api/admin-settings
Authorization: Bearer {non_admin_token}

# Expected: 403 Forbidden
{
  "success": false,
  "message": "Access Denied! Admin privileges required."
}
```

### Test 400 Bad Request (Invalid Data)

```bash
# Invalid email format
PUT http://localhost:5000/api/admin-settings
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "email": "not-a-valid-email"
}

# Expected: 400 Bad Request
{
  "success": false,
  "message": "Invalid input data"
}
```

---

## Cross-Tab Synchronization Testing

1. **Open Two Browser Tabs**
   - Tab 1: `http://localhost:3000/`
   - Tab 2: `http://localhost:3000/admin/settings`

2. **Update Settings in Tab 2**
   - Change website title
   - Upload logo
   - Save

3. **Check Tab 1**
   - ⏳ Wait a moment
   - Refresh the page (press F5)
   - ✅ Logo should appear
   - ✅ Title should update

---

## Performance Testing

### Test with Large Logo File

- ✅ Try uploading 4.9MB image → should work
- ✅ Try uploading 5.1MB image → should fail
- ✅ Upload completes within 10 seconds

### Test with Slow Network

1. **Open DevTools** → Network tab
2. **Throttle to "Slow 3G"**
3. **Upload a 2MB image**
   - ✅ Progress indication shows
   - ✅ Upload completes eventually
   - ✅ Error message if times out

---

## Database Verification

### MongoDB Check

```bash
# Connect to MongoDB
mongosh

# Use your database
use your_db_name

# Check admin settings collection
db.adminsettings.findOne()

# Expected output:
{
  "_id": ObjectId("..."),
  "websiteTitle": "Wiser Consulting LLC",
  "email": "contact@wiserconsulting.com",
  "phone": "+1 (555) 123-4567",
  "address": "123 Main Street, New York, NY 10001",
  "siteLogo": "https://res.cloudinary.com/...",
  "logoPublicId": "admin-settings/abc123xyz",
  "socialLinks": {
    "facebook": "https://facebook.com/wiserconsulting",
    "twitter": "https://twitter.com/wiserconsulting",
    "linkedin": "https://linkedin.com/company/wiserconsulting",
    "instagram": "https://instagram.com/wiserconsulting"
  },
  "isDeleted": false,
  "createdAt": ISODate("2024-01-15T10:30:00Z"),
  "updatedAt": ISODate("2024-01-15T14:45:00Z")
}
```

---

## Checklist for Complete Testing

### API Endpoints

- [ ] GET `/api/admin-settings/public` - No auth
- [ ] GET `/api/admin-settings` - With auth
- [ ] PUT `/api/admin-settings` - Update fields
- [ ] POST `/api/admin-settings/logo/upload` - Upload logo
- [ ] DELETE `/api/admin-settings/logo` - Delete logo

### Authorization

- [ ] Public endpoint works without auth
- [ ] Admin endpoints reject without token
- [ ] Admin endpoints reject non-admin users
- [ ] Admin endpoints work with admin token

### File Upload

- [ ] Accept valid images (PNG, JPG, GIF, WebP)
- [ ] Reject non-image files
- [ ] Reject files > 5MB
- [ ] Cloudinary integration works
- [ ] Old logo deleted on new upload

### UI/UX

- [ ] Form loads current settings
- [ ] Text fields update and save
- [ ] Logo preview shows before upload
- [ ] Upload button triggers upload
- [ ] Social links save correctly
- [ ] Error messages display
- [ ] Loading states show

### Frontend Components

- [ ] Navbar displays logo and title
- [ ] Footer displays all info
- [ ] Dynamic updates work
- [ ] Responsive on all screens
- [ ] Icons load correctly

### Database

- [ ] Settings collection created
- [ ] Data persists after refresh
- [ ] Timestamps update on changes
- [ ] Logo URLs are stored correctly

---

## Common Issues & Solutions

| Issue                | Test                  | Solution                        |
| -------------------- | --------------------- | ------------------------------- |
| Logo not uploading   | Upload 1MB PNG        | Check Cloudinary credentials    |
| Settings not showing | GET public endpoint   | Check API URL in .env           |
| 401 error            | Use admin token       | Log in and copy token correctly |
| File too large       | Try 6MB file          | Must be < 5MB                   |
| CORS error           | Check browser console | Verify backend CORS settings    |
| Logo not in navbar   | Update title first    | Refresh page manually           |

---

## Final Sign-Off

When all tests pass:

- ✅ Backend implementation complete
- ✅ Frontend implementation complete
- ✅ API working correctly
- ✅ Database storing data
- ✅ Authorization working
- ✅ File upload working
- ✅ UI/UX working
- ✅ Ready for production

**Estimated testing time:** 30-45 minutes
