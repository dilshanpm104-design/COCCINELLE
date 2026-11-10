# Owner guide

## Go-live checklist
1. [ ] `role` = `owner` on your `admins` document (see `ADMIN_SETUP.md`).
2. [ ] Rules published and Playground checks passed (`docs/FIRESTORE_SETUP.md`).
3. [ ] Place one test order on the website with your own number. It appears in Orders as "Awaiting confirmation". Cancel it afterwards.
4. [ ] Save the default categories, then check Products and prices.
5. [ ] Download the category photos into `images/cat/` and the hero photo as `images/hero.jpg` (`docs/PHOTO_SHORTLIST.md`).
6. [ ] Enter stock and purchase costs for your main products.
7. [ ] Add staff with the right roles.

## Daily routine
- Orders: open "Awaiting confirmation", check the customer on WhatsApp, move the order forward. Only confirmed and later orders count as sales.
- Payments: when cash or card is received, open the order and press Record payment. Unrecorded payments are never counted as paid.
- Stock: record deliveries received and damaged or expired items.
- Expenses: add costs as they happen.

## Monthly
Reports & Excel: Monthly sales, Product sales, Expense report, Profit report. Profit is marked as an estimate until every product sold has a purchase cost.

## If something looks wrong
- "Permission denied" or empty data after sign-in: rules not published or `role` missing on your `admins` document.
- Website shows old prices: refresh the page; the live product list overrides the built-in list when Firebase is reachable.
- To undo the upgrade: the previous site is saved on the branch `v1-backup`.
