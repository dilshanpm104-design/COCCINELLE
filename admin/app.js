// COCCINELLE admin shell: Firebase (existing project), sign-in, role lookup, live data, router, audited writes.
// The browser only decides what to SHOW. Firestore security rules (firestore.rules) decide what is ALLOWED.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, runTransaction, query, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as S from './stats.js';
import { SECTIONS, ROLES, can, canSee, firstSection } from './perms.js';
import { $, $$, esc, icon, toast, closeModal, aed } from './ui.js';
import overview from './views/overview.js';
import orders from './views/orders.js';
import customers from './views/customers.js';
import payments from './views/payments.js';
import products from './views/products.js';
import categories from './views/categories.js';
import inventory from './views/inventory.js';
import offers from './views/offers.js';
import * as K from './stock.js';
import expensesV from './views/expenses.js';
import staffV from './views/staff.js';
import settingsV from './views/settings.js';
import auditV from './views/audit.js';
import analyticsV from './views/analytics.js';
import reportsV from './views/reports.js';

const firebaseConfig = { apiKey: 'AIzaSyDg7DfIV3f1pA5qV_VGgvoQV24Y2QvWiK8', authDomain: 'coccinelle-supermarket.firebaseapp.com', projectId: 'coccinelle-supermarket', storageBucket: 'coccinelle-supermarket.firebasestorage.app', messagingSenderId: '227874611552', appId: '1:227874611552:web:b30f8ab364ff89e4cffe05', measurementId: 'G-75HTLXQHZZ' };
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const ORDER_LIMIT = 1000;                                   // newest orders kept live. Spark plan allows 50,000 reads/day.
const READS_ORDERS = ['owner', 'manager', 'sales', 'viewer'], READS_CUSTOMERS = ['owner', 'manager', 'sales'];
const FALLBACK_CATS = [['fruits', 'Fresh Fruits'], ['vegetables', 'Fresh Vegetables'], ['meat-poultry', 'Meat & Poultry'], ['seafood', 'Seafood'], ['bakery', 'Bakery'], ['dairy-eggs', 'Dairy & Eggs'], ['grocery', 'Grocery & Pantry'], ['beverages', 'Beverages'], ['snacks', 'Snacks & Sweets'], ['frozen', 'Frozen Foods'], ['household', 'Household Essentials'], ['personal-care', 'Personal Care']].map(([id, n]) => ({ id, n }));

const VIEWS = { overview, orders, customers, payments, products, categories, inventory, offers, expenses: expensesV, staff: staffV, settings: settingsV, audit: auditV, analytics: analyticsV, reports: reportsV };

const ctx = {
  user: null, role: null, orders: [], products: [], payments: [], customerDocs: {}, categories: FALLBACK_CATS, categoryDocs: [], inventory: [], movements: [], expenses: [], audit: [], staff: [], expensesError: '', auditError: '', staffError: '', settings: {}, inventoryError: '', categoriesError: '',
  ordersReady: false, ordersError: '', ordersTruncated: false, productsError: '', paymentsError: '',
  rangeKey: 'last30', custom: { from: '', to: '' }, range: null, route: { id: '', param: '', query: {} },
  now: () => Date.now(), can: a => can(ctx.role, a), rerender: () => rerender(), api: null
};
try { const r = JSON.parse(localStorage.getItem('ccadm_range') || '{}'); if (S.RANGES.some(x => x[0] === r.key)) { ctx.rangeKey = r.key; ctx.custom = r.custom || ctx.custom; } } catch (e) { }
ctx.range = S.rangeFor(ctx.rangeKey, Date.now(), ctx.custom);

// ---------- errors ----------
function errorText(e) {
  const code = (e && e.code) || 'unknown', help = {
    'auth/invalid-credential': 'Email or password is incorrect.', 'auth/invalid-email': 'Check the email address.', 'auth/operation-not-allowed': 'Enable Email/Password in Firebase Authentication.',
    'auth/unauthorized-domain': 'Add dilshanpm104-design.github.io under Firebase Authentication > Settings > Authorized domains.', 'auth/too-many-requests': 'Too many attempts. Wait a while and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.', 'permission-denied': 'Your role is not allowed to do this, or the Firestore rules have not been published yet.',
    'unavailable': 'Cannot reach Firebase right now. Check your connection.', 'failed-precondition': 'Firestore needs an index or setting for this request. See the browser console.'
  };
  return (help[code] || (e && e.message) || 'Something went wrong.') + (help[code] ? '' : ` (${code})`);
}

// ---------- audited writes ----------
const rid = (n = 5) => { const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map(x => al[x % al.length]).join(''); };
const day8 = () => S.dayKey(Date.now()).replace(/-/g, '');
async function audit(action, target, detail = '') {
  if (!ctx.user) return;
  try { await addDoc(collection(db, 'audit_logs'), { uid: ctx.user.uid, email: ctx.user.email || '', role: ctx.role, action, target, detail: String(detail).slice(0, 300), at: serverTimestamp() }); } catch (e) { console.warn('audit log not saved', e.code || e); }
}
ctx.api = {
  errorText, audit,
  async updateOrderStatus(o, status) {
    const entry = { status, at: Date.now(), by: ctx.user.uid, byName: ctx.user.email || '' };
    await updateDoc(doc(db, 'orders', o.id), { status, statusHistory: arrayUnion(entry), updatedAt: serverTimestamp(), updatedBy: ctx.user.uid });
    audit('order.status', o.orderId || o.id, `${o.status} -> ${status}`); o.statusHistory = [...(o.statusHistory || []), entry]; o.status = status;
  },
  async verifyTotals(o) { await updateDoc(doc(db, 'orders', o.id), { totalsVerified: true, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }); audit('order.verifyTotals', o.orderId || o.id); o.totalsVerified = true; },
  async recordPayment({ order, amount, method, status, reference, paidAt }) {
    const id = `PAY-${day8()}-${rid()}`, b = writeBatch(db), c = order.customer || {};
    b.set(doc(db, 'payments', id), { paymentId: id, orderId: order.orderId || order.id, customer: { name: c.name || '', phone: c.phone || '' }, amount, method, reference, status, paidAt, recordedBy: ctx.user.uid, recordedByName: ctx.user.email || '', createdAt: serverTimestamp() });
    b.update(doc(db, 'orders', order.id), { paymentStatus: status, paymentMethod: method, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid });
    await b.commit();
    audit('payment.record', id, `${order.orderId} ${status} AED ${amount} ${method}`);
    ctx.payments.unshift({ id, paymentId: id, orderId: order.orderId, customer: { name: c.name, phone: c.phone }, amount, method, reference, status, paidAt, createdAt: { seconds: Date.now() / 1000 } });
    order.paymentStatus = status; order.paymentMethod = method; return id;
  },
  async saveCustomerNote(c, notes) {
    await setDoc(doc(db, 'customers', c.id), { id: c.id, name: c.name, phone: c.phone, notes, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }, { merge: true });
    ctx.customerDocs[c.id] = { ...(ctx.customerDocs[c.id] || {}), id: c.id, name: c.name, phone: c.phone, notes }; audit('customer.notes', c.id);
  },
  async loadCategories() {
    try {
      const s = await getDocs(collection(db, 'categories')); ctx.categoryDocs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); ctx.categoriesError = '';
      if (ctx.categoryDocs.length) ctx.categories = ctx.categoryDocs.map(c => ({ id: c.id, n: c.n || c.name || c.id }));
    } catch (e) { ctx.categoriesError = errorText(e); }
  },
  async saveCategory(data, id) {
    await setDoc(doc(db, 'categories', id), { ...data, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }, { merge: true });
    audit('category.save', id, data.n); await ctx.api.loadCategories();
  },
  async seedCategories() {
    const d = await (await fetch('products.json', { cache: 'no-store' })).json(), b = writeBatch(db);
    d.cats.forEach((c, i) => b.set(doc(db, 'categories', c.id), { n: c.n, order: i + 1, visible: true, imageUrl: c.img || '', updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }));
    await b.commit(); audit('category.seed', 'categories', `${d.cats.length} categories`); await ctx.api.loadCategories(); return d.cats.length;
  },
  async loadInventory() {
    try { const s = await getDocs(collection(db, 'inventory')); ctx.inventory = s.docs.map(d => ({ id: d.id, ...d.data() })); ctx.inventoryError = ''; } catch (e) { ctx.inventoryError = errorText(e); }
  },
  async loadMovements(productId) {
    const s = await getDocs(query(collection(db, 'stock_movements'), orderBy('at', 'desc'), limit(300)));
    const all = s.docs.map(d => ({ id: d.id, ...d.data() })); ctx.movements = all; return productId ? all.filter(m => m.productId === productId) : all;
  },
  // Saves product stock details. Changing the quantity writes a movement in the same transaction so the history always matches.
  async saveStock(p, meta, move) {
    const ref = doc(db, 'inventory', p.id), mref = doc(collection(db, 'stock_movements'));
    await runTransaction(db, async tx => {
      const cur = (await tx.get(ref)).data() || {}, base = { productId: p.id, name: p.name || '', sku: meta.sku, lowStockAt: meta.lowStockAt, costPrice: meta.costPrice, supplier: meta.supplier, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid };
      if (move) {
        const plan = K.planMovement(move.type, move.qty, cur.stock); if (plan.error) throw new Error(plan.error);
        tx.set(ref, { ...base, stock: plan.after });
        tx.set(mref, { productId: p.id, name: p.name || '', type: move.type, qty: plan.delta, before: cur.stock == null ? 0 : cur.stock, after: plan.after, note: String(move.note || '').slice(0, 200), uid: ctx.user.uid, byName: ctx.user.email || '', at: serverTimestamp() });
      } else tx.set(ref, { ...base, ...(cur.stock != null ? { stock: cur.stock } : {}) });
    });
    audit(move ? 'stock.' + move.type : 'stock.details', p.id, `${p.name} ${move ? move.qty : ''}`); await ctx.api.loadInventory();
  },
  async setAvailable(p, available) { await updateDoc(doc(db, 'products', p.id), { available, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }); audit('product.availability', p.id, `${p.name} ${available}`); p.available = available; },
  async setDeal(p) {
    for (const o of ctx.products) if (o.deal && (!p || o.id !== p.id)) { await updateDoc(doc(db, 'products', o.id), { deal: false }); o.deal = false; }
    if (p) { await updateDoc(doc(db, 'products', p.id), { deal: true, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }); p.deal = true; }
    audit('offers.deal', p ? p.id : 'none', p ? p.name : 'cleared');
  },
  async loadSettings() { try { const s = await getDoc(doc(db, 'settings', 'public')); ctx.settings = s.exists() ? s.data() : {}; } catch (e) { ctx.settings = ctx.settings || {}; } },
  async savePublicSettings(vals) { await setDoc(doc(db, 'settings', 'public'), { ...vals, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }, { merge: true }); ctx.settings = { ...ctx.settings, ...vals }; audit('settings.public', 'public', JSON.stringify(vals).slice(0, 250)); },
  async loadExpenses() {
    try { const s = await getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(1000))); ctx.expenses = s.docs.map(d => ({ id: d.id, ...d.data() })); ctx.expensesError = ''; } catch (e) { ctx.expensesError = errorText(e); }
  },
  async saveExpense(v, id) {
    const data = { date: v.date, category: v.category, amount: Math.round(Number(v.amount) * 100) / 100, vendor: v.vendor || '', note: v.note || '', updatedAt: serverTimestamp(), updatedBy: ctx.user.uid };
    if (id) await updateDoc(doc(db, 'expenses', id), data); else await addDoc(collection(db, 'expenses'), { ...data, createdAt: serverTimestamp(), createdBy: ctx.user.uid, createdByEmail: ctx.user.email || '' });
    audit(id ? 'expense.update' : 'expense.add', id || data.category, `${data.category} AED ${data.amount} ${data.date}`); await ctx.api.loadExpenses();
  },
  async deleteExpense(e) { await deleteDoc(doc(db, 'expenses', e.id)); audit('expense.delete', e.id, `${e.category} AED ${e.amount} ${e.date}`); await ctx.api.loadExpenses(); },
  async loadAudit() {
    try { const s = await getDocs(query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(300))); ctx.audit = s.docs.map(d => { const x = d.data(); return { id: d.id, ...x, at: x.at && x.at.toMillis ? x.at.toMillis() : 0 }; }); ctx.auditError = ''; } catch (e) { ctx.auditError = errorText(e); }
  },
  async loadStaff() {
    try { const s = await getDocs(collection(db, 'admins')); ctx.staff = s.docs.map(d => ({ id: d.id, ...d.data() })); ctx.staffError = ''; } catch (e) { ctx.staffError = errorText(e); }
  },
  // Creates the sign-in account on a second, temporary app so the owner stays signed in, then saves the role.
  async addStaff({ email, password, name, role }) {
    const second = initializeApp(firebaseConfig, 'staff-' + Date.now()); let uid;
    try { uid = (await createUserWithEmailAndPassword(getAuth(second), email, password)).user.uid; } finally { await deleteApp(second).catch(() => {}); }
    await setDoc(doc(db, 'admins', uid), { email, name: name || '', role, active: true, createdAt: serverTimestamp(), createdBy: ctx.user.uid });
    audit('staff.add', uid, `${email} as ${role}`); await ctx.api.loadStaff(); return uid;
  },
  async updateStaff(uid, patch) { await updateDoc(doc(db, 'admins', uid), { ...patch, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid }); audit('staff.update', uid, JSON.stringify(patch)); await ctx.api.loadStaff(); },
  async resetPassword(email) { await sendPasswordResetEmail(auth, email); audit('staff.password_reset', email, ''); },
  async loadProducts() {
    try { const snap = await getDocs(collection(db, 'products')); ctx.products = snap.docs.map(d => ({ id: d.id, ...d.data() })); ctx.productsError = ''; } catch (e) { ctx.productsError = errorText(e); }
  },
  async saveProduct(data, id) {
    const base = { ...data, updatedAt: serverTimestamp(), updatedBy: ctx.user.uid };
    if (id) await updateDoc(doc(db, 'products', id), base); else { const r = await addDoc(collection(db, 'products'), { ...base, createdAt: serverTimestamp() }); id = r.id; }
    if (data.deal) for (const o of ctx.products) if (o.deal && o.id !== id) await updateDoc(doc(db, 'products', o.id), { deal: false });
    audit(id ? 'product.save' : 'product.create', id, data.name); await ctx.api.loadProducts();
  },
  async deleteProduct(p) { await deleteDoc(doc(db, 'products', p.id)); audit('product.delete', p.id, p.name); ctx.products = ctx.products.filter(x => x.id !== p.id); },
  async seedProducts() {
    const d = await (await fetch('products.json', { cache: 'no-store' })).json(), b = writeBatch(db);
    for (const p of d.p) b.set(doc(collection(db, 'products')), { name: p.n, price: p.pr, oldPrice: p.old || 0, unit: p.u, category: p.c, deal: !!p.deal, featured: !!p.feat, bestSeller: !!p.best, available: true, imageUrl: '', createdAt: serverTimestamp(), updatedBy: ctx.user.uid });
    await b.commit(); audit('product.seed', 'products', `${d.p.length} sample products`); await ctx.api.loadProducts(); return d.p.length;
  }
};

// ---------- live data ----------
let unsubOrders = null;
function startData() {
  const r = ctx.role;
  ctx.api.loadProducts().then(rerender);
  if (READS_ORDERS.includes(r)) {
    unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ORDER_LIMIT)), snap => {
      const first = !ctx.ordersReady; ctx.ordersReady = true; ctx.ordersError = '';
      ctx.orders = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })); ctx.ordersTruncated = snap.size >= ORDER_LIMIT;
      if (!first) snap.docChanges().forEach(ch => { if (ch.type === 'added' && !ch.doc.metadata.hasPendingWrites) { const o = ch.doc.data(); toast(`New order ${ch.doc.id} · ${aed(o.total)}`, 'ok', 8000); } });
      updateBell(); rerender();
    }, e => { ctx.ordersReady = true; ctx.ordersError = errorText(e); rerender(); });
    getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(500))).then(s => { ctx.payments = s.docs.map(d => ({ id: d.id, ...d.data() })); rerender(); }).catch(e => { ctx.paymentsError = errorText(e); rerender(); });
  }
  if (READS_CUSTOMERS.includes(r)) getDocs(collection(db, 'customers')).then(s => { ctx.customerDocs = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); rerender(); }).catch(() => { });
  ctx.api.loadCategories().then(rerender); ctx.api.loadSettings().then(rerender);
  if (['owner', 'manager', 'inventory', 'viewer'].includes(r)) ctx.api.loadInventory().then(rerender);
  if (['owner', 'manager', 'viewer'].includes(r)) ctx.api.loadExpenses().then(rerender);
}

// ---------- shell ----------
const view = () => $('#view');
function parse() { const [path, qs] = location.hash.replace(/^#\/?/, '').split('?'), [id, param] = path.split('/'); return { id: id || '', param: decodeURIComponent(param || ''), query: Object.fromEntries(new URLSearchParams(qs || '')) }; }
function buildNav() {
  const pend = ctx.orders.filter(o => S.PENDING.includes(o.status)).length;
  $('#nav').innerHTML = SECTIONS.filter(s => canSee(ctx.role, s.id)).map(s => `<a class="nv${ctx.route.id === s.id ? ' on' : ''}" href="#/${s.id}" ${ctx.route.id === s.id ? 'aria-current="page"' : ''}>${icon(s.icon)}<span>${esc(s.label)}</span>${s.id === 'orders' && pend ? `<b class="cnt">${pend}</b>` : s.soon ? '<em class="soon">Soon</em>' : ''}</a>`).join('');
}
function updateBell() {
  const n = ctx.orders.filter(o => S.PENDING.includes(o.status)).length, b = $('#bell');
  b.hidden = !READS_ORDERS.includes(ctx.role); b.querySelector('.bc').textContent = n; b.querySelector('.bc').hidden = !n; b.setAttribute('aria-label', n ? `${n} orders waiting for confirmation` : 'No orders waiting');
  document.title = (n ? `(${n}) ` : '') + (ctx.route.id ? (VIEWS[ctx.route.id] || {}).title + ' | ' : '') + 'COCCINELLE Admin'; buildNav();
}
function rangeControl() {
  const v = VIEWS[ctx.route.id], box = $('#rng'); box.hidden = !(v && v.usesRange); if (box.hidden) return;
  $('#rk').innerHTML = S.RANGES.map(([k, l]) => `<option value="${k}"${k === ctx.rangeKey ? ' selected' : ''}>${l}</option>`).join('');
  const c = ctx.rangeKey === 'custom'; $('#rc').hidden = !c; $('#rgf').value = ctx.custom.from || ''; $('#rgt').value = ctx.custom.to || '';
}
function setRange() {
  ctx.range = S.rangeFor(ctx.rangeKey, Date.now(), ctx.custom);
  try { localStorage.setItem('ccadm_range', JSON.stringify({ key: ctx.rangeKey, custom: ctx.custom })); } catch (e) { }
  rangeControl(); rerender();
}
let navKey = '';
function go() {
  if (!ctx.role) return;
  let r = parse(); if (!canSee(ctx.role, r.id)) { const f = firstSection(ctx.role); if (!f) return; history.replaceState(null, '', '#/' + f); r = parse(); }
  const key = r.id + '/' + r.param + '?' + JSON.stringify(r.query), changed = key !== navKey; navKey = key; ctx.route = r;
  if (changed) { closeModal(); for (const k of Object.keys(view().dataset)) delete view().dataset[k]; document.body.classList.remove('nav-open'); }
  $('#ttl').textContent = VIEWS[r.id].title; rangeControl(); buildNav(); updateBell(); rerender(changed);
  if (changed) { scrollTo(0, 0); view().focus({ preventScroll: true }); }
}
function rerender() {
  if (!ctx.role) return;
  const v = view(), a = document.activeElement, keep = a && a.id && v.contains(a) ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null, y = scrollY;
  ctx.range = S.rangeFor(ctx.rangeKey, Date.now(), ctx.custom);
  try { VIEWS[ctx.route.id].render(v, ctx); } catch (e) { console.error(e); v.innerHTML = `<div class="note warn"><b>This page could not be shown.</b> ${esc(e.message)}</div>`; }
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (x) { } } }
  scrollTo(0, y);
}

// ---------- auth ----------
const say = (id, t, err) => { const e = $(id); e.textContent = t; e.className = 'st' + (err ? ' er' : ''); };
function showLogin(msg) { $('#shell').hidden = true; $('#denied').hidden = true; $('#login').hidden = false; if (msg) say('#lst', msg, true); }
async function enter(user) {
  ctx.user = user; $('#login').hidden = true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid)), d = snap.exists() ? snap.data() : null;
    if (!d || d.active !== true) return denied('This account is signed in but has not been approved as an admin. Ask the owner to add you under Staff.');
    ctx.role = ROLES[d.role || 'manager'] ? (d.role || 'manager') : 'viewer';
  } catch (e) { return denied('Could not check your admin approval. ' + errorText(e)); }
  $('#who').textContent = user.email || 'Admin'; $('#role').textContent = ROLES[ctx.role]; $('#shell').hidden = false; $('#denied').hidden = true;
  startData(); if (!location.hash || !canSee(ctx.role, parse().id)) history.replaceState(null, '', '#/' + firstSection(ctx.role)); go();
}
function denied(msg) { ctx.role = null; $('#shell').hidden = true; $('#login').hidden = true; $('#denied').hidden = false; $('#dmsg').textContent = msg; }
onAuthStateChanged(auth, u => { $('#splash').hidden = true; if (u) enter(u); else { if (unsubOrders) unsubOrders(); unsubOrders = null; Object.assign(ctx, { user: null, role: null, orders: [], payments: [], products: [], customerDocs: {}, categoryDocs: [], inventory: [], settings: {}, ordersReady: false }); showLogin(); } });
$('#lf').addEventListener('submit', async e => {
  e.preventDefault(); const b = $('#lb'); b.disabled = true; say('#lst', 'Signing in…');
  try { const u = $('#le').value.trim(); await signInWithEmailAndPassword(auth, u.includes('@') ? u : u.toLowerCase() + '@coccinelle-admin.com', $('#lp').value); say('#lst', ''); } catch (x) { say('#lst', errorText(x), true); } finally { b.disabled = false; }
});
document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) signOut(auth); });

// ---------- chrome ----------
$('#rk').addEventListener('change', e => { ctx.rangeKey = e.target.value; setRange(); });
['#rgf', '#rgt'].forEach(s => $(s).addEventListener('change', () => { ctx.custom = { from: $('#rgf').value, to: $('#rgt').value }; if (ctx.custom.from && ctx.custom.to) setRange(); }));
$('#bell').addEventListener('click', () => { location.hash = '#/orders?s=pending'; });
$('#burger').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
$('#rfs').addEventListener('click', async () => { await Promise.all([ctx.api.loadProducts(), ctx.api.loadCategories(), ctx.api.loadSettings(), ctx.api.loadInventory()]); toast('Data refreshed. Orders update live.'); rerender(); });
function closeAndResetUrl() { closeModal(); const r = parse(); if (r.param) { history.replaceState(null, '', '#/' + r.id); navKey = r.id + '/?{}'; ctx.route = { id: r.id, param: '', query: {} }; delete view().dataset.opened; } }
document.addEventListener('click', e => {
  if (e.target.closest('[data-close-modal]') || e.target.id === 'modal') closeAndResetUrl();
  const g = e.target.closest('[data-go]'); if (g) location.hash = g.dataset.go;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAndResetUrl(); document.body.classList.remove('nav-open'); } if (e.key === 'Enter') { const g = e.target.closest && e.target.closest('[data-go]'); if (g) location.hash = g.dataset.go; } });
addEventListener('hashchange', go);
