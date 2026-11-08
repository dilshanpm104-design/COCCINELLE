# Publishing the Firestore rules (owner steps)

The website can only save orders and show live products after these rules are published. Until then it keeps working: orders still go to WhatsApp, and the site shows the built-in product list.

**Do this only when you are ready to go live with the upgraded site.** Publishing replaces your current rules.

## 1. Check your admin account is registered
1. Firebase Console > Authentication > Users: copy the **User UID** of your owner account.
2. Firestore Database > collection `admins` > a document whose ID is that UID, with fields `active` = `true` (boolean) and `role` = `owner` (string).
   Create it if it does not exist. If you skip this, you will lock yourself out of the dashboard.

## 2. Test before publishing (recommended)
1. Firebase Console > Firestore Database > **Rules** tab.
2. Paste the contents of `firestore.rules` into the editor.
3. Click **Rules Playground** and try these:
   - Get `/products/anything`, unauthenticated: **allowed**.
   - Get `/orders/CC-20260101-ABCDE`, unauthenticated: **denied**.
   - Get `/customers/x`, unauthenticated: **denied**.
   - Get `/orders/x`, authenticated as your owner UID: **allowed**.

## 3. Publish
Click **Publish**. Then on the website, place a test order (use your own number) and check Firestore > `orders`: a new document `CC-...` should appear with status `awaiting_confirmation`. Delete the test order afterwards.

## Notes
- Visitors can create an order but can never read any order back. Only signed-in staff with a role can.
- Product documents are public. Never put purchase prices in them; they will live in the separate `inventory` collection.
- These rules were written without access to the Firebase emulator, so please run the Playground checks above before relying on them.
- To prevent spam orders later, enable Firebase App Check (free) in a future step.
