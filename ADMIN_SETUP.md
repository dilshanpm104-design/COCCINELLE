# Admin dashboard setup (owner)

The dashboard is `admin.html`. It uses your existing Firebase project `coccinelle-supermarket` on the free Spark plan. It needs no paid service and no Firebase Storage.

## One-time steps (about 10 minutes)
1. **Check your owner account.** Firebase Console > Firestore Database > collection `admins` > the document whose ID is your user UID must contain `active` = `true` (boolean) and `role` = `owner` (string). Without `role` = `owner` you cannot manage staff or settings.
2. **Publish the rules.** Follow `docs/FIRESTORE_SETUP.md` (copy `firestore.rules`, run the four Rules Playground checks, press Publish). Until this is done the dashboard shows "permission denied" messages and the website keeps working in its built-in mode.
3. **Sign in** at `admin.html` with your username or email and password. A username without `@` is signed in as `username@coccinelle-admin.com`, as before.
4. **Categories:** open Categories, press "Save the 12 default categories".
5. **Products:** open Products. If it is empty, press the button that loads the built-in catalogue into Firebase.
6. **Stock and costs:** open Inventory & Stock and enter quantities, alert levels and purchase costs. Profit figures need purchase costs.
7. **Staff:** open Staff (owner only) and add each person with a role.

## What each section does
| Section | Use |
|---|---|
| Overview | Today's numbers, charts, best sellers, new orders, low-stock alerts |
| Sales & Analytics | Trends (daily to yearly), top products, categories, busy hours, customers, slow movers |
| Orders | Every order, status workflow, print, CSV. Website orders are saved before WhatsApp opens |
| Customers / CRM | Customers built from orders (by WhatsApp number), segments, notes |
| Payments | Record payments, refunds. An order is Paid only after staff record the full amount |
| Products, Categories | Catalogue, prices, photos (links or repo paths), visibility |
| Inventory & Stock | Quantities, history, alerts, purchase cost (private) |
| Offers & Promotions | Delivery fee, minimum order, basket discount (all 0 today), deal of the day |
| Reports & Excel | 14 reports as Excel (.xlsx), CSV or print / PDF |
| Expenses & Profit | Record expenses, see an honest profit estimate |
| Staff | Create accounts, assign roles, deactivate, send password reset |
| Store Settings | WhatsApp number (owner only), phone, hours, address, delivery message |
| Activity Log | Who changed what and when. Cannot be edited |

## Things the system does not do (by design, on the free plan)
- It does not reduce stock automatically when a website order arrives. Staff record stock changes.
- It does not take online payments. Payments are recorded by staff after they are received.
- It does not calculate VAT.
- It does not delete or hide data you did not ask it to.
