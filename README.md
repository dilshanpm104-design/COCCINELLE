# COCCINELLE Supermarket

Website and admin dashboard for COCCINELLE Supermarket, The Commons, Mirdif, Dubai. Orders are placed on the website and sent on WhatsApp.

- **Website:** `index.html` (+ `style.css`, `products.json`). Static, no build step. Hosted on GitHub Pages.
- **Admin dashboard:** `admin.html` + `admin/`. Firebase Authentication and Firestore (Spark plan).
- **Security rules:** `firestore.rules`. These, not the screens, decide who can read or change data.

Start with `ADMIN_SETUP.md`, then `docs/FIRESTORE_SETUP.md`. Daily use and the go-live checklist are in `docs/OWNER_GUIDE.md`.

## Tests
`npm test` runs the Node tests (calculations, payment rules, stock, finance, reports, Excel writer, and a check that the rules and the screens agree on who can do what). They use generated test data only. Live Firebase could not be tested from the build environment, so do the Rules Playground checks in `docs/FIRESTORE_SETUP.md` after publishing.

## Layout
```
index.html  style.css  products.json  images/   public website
admin.html  admin/                              dashboard (ES modules, no build)
firestore.rules                                 database security rules
tests/  docs/                                   tests, owner documentation
```
