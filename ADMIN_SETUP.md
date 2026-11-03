# Coccinelle Admin Panel setup

## Files
- `admin.html`: mobile-friendly admin UI (username/password login, add/edit/delete products, upload photos).
- Current public website: GitHub Pages.

## Important before use
This panel is a starter, not connected until Firebase is configured. It writes product records to Firestore collection `products`. The current public site reads `deals.json`, so changes will NOT appear on the public website until the public site's product loader is migrated to Firestore. Keep using the existing website until that integration is completed.

## Firebase setup (owner)
1. Open https://console.firebase.google.com/ and create a project (or use your existing project).
2. Add a Web App and copy its Firebase config.
3. Enable Authentication > Sign-in method > Email/Password.
4. Create Firestore Database.
5. Enable Storage.
6. Open `admin.html` in GitHub, click Edit, and replace the placeholder values in `firebaseConfig`.
7. The panel accepts usernames and maps them to `username@coccinelle-admin.com`. When creating accounts in Firebase Authentication, use this email format for each person, e.g. `owner@coccinelle-admin.com` and `staff1@coccinelle-admin.com`. Set a strong password for each account. Do not share the owner password.

## Approve owner/staff accounts
After creating each Firebase Authentication user:
1. Copy that user's UID from Authentication > Users.
2. In Firestore, create a document in collection `admins` with the document ID equal to that UID.
3. Add fields: `role` = `owner` (for owner) or `staff` (for staff), and `active` = `true`.
4. Only UIDs with an active `admins` document are authorized by the rules below.

## Firestore Rules
Paste into Firestore > Rules and publish:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function approved() {
      return request.auth != null
        && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.active == true;
    }
    match /admins/{uid} {
      // Signed-in staff can read their own authorization record only.
      allow read: if request.auth != null && request.auth.uid == uid;
      // Manage staff permissions manually in Firebase Console only.
      allow write: if false;
    }
    match /products/{productId} {
      allow read: if approved();
      allow create, update, delete: if approved();
    }
  }
}
```

## Storage Rules
Paste into Storage > Rules and publish:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function approved() {
      return request.auth != null
        && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid))
        && firestore.get(/databases/(default)/documents/admins/$(request.auth.uid)).data.active == true;
    }
    match /product-images/{fileName} {
      allow read: if approved();
      allow write: if approved() && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## Staff access
Create a separate Firebase Auth account for each staff member. Give each person their own username/password. Approve their UID in `admins` with `active: true`. To remove access, set `active: false` or delete their `admins` document and disable their Auth account.

## Product data migration
The public website currently reads `deals.json`. Admin edits use Firestore `products`. Before customer use, the public site must be updated to read Firestore and display the same product fields. Until then, admin changes stay in the admin database and do not update the live offer cards.
