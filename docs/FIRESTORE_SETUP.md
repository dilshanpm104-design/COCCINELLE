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

## Roles and what each can do (rules and dashboard agree; a test checks this)
| Role | Can open | Can change |
|---|---|---|
| owner | everything | everything, including staff and all settings |
| manager | everything except Staff | orders, payments, products, categories, stock, offers, public settings |
| sales | Orders, Customers, Payments (view), Products | order status only; customer notes |
| inventory | Products, Categories, Inventory & Stock | products, categories, stock |
| viewer | Overview, Orders, Payments, Inventory, Reports (view) | nothing |

A staff document in `admins` must have `active` = `true` and a `role` from the table. A document with no role is treated as `manager`.

## Added in milestone M4 (more Playground checks)
- Get `/categories/fruits`, unauthenticated: **allowed**. Get `/inventory/x`, unauthenticated: **denied**.
- Get `/settings/public`, unauthenticated: **allowed**. Get `/settings/other`, unauthenticated: **denied**.
- Update `/settings/public` with `deliveryFee` = 600 as a manager: **denied** (maximum is 500). With 8: **allowed**.
- Create `/stock_movements/x` as a signed-in `sales` user: **denied**.

## How stock works on the free plan
Orders from the website do **not** reduce stock automatically (that would need paid Cloud Functions). Staff record stock received, sold off-line, damaged, expired or counted in Inventory & Stock. Every change is saved with who and when and cannot be edited afterwards. Purchase costs are stored only in the private `inventory` collection.

## Categories and photos
Open Categories and press **Save the 12 default categories** once. After that you can rename, reorder, hide and set each photo. A photo is an `https` link or a file path such as `images/cat/fruits.jpg` (upload the file into the repository's `images/cat` folder on GitHub). Hiding a category hides its products on the website.

## Delivery fee, minimum order, discount
Offers & Promotions > Pricing rules. All four values are 0 today (free delivery, no minimum, no discount). They are saved in `settings/public` and the website reads them on load.
