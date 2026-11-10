// TEST HARNESS ONLY. Renders the real admin views against generated FIXTURE data (never shipped, never in /admin).
// Firebase is replaced by an in-memory fake `api`, so no network or credentials are involved.
import * as S from '../admin/stats.js';
import { SECTIONS, ROLES, can, canSee, firstSection } from '../admin/perms.js';
import { $, esc, icon, toast, closeModal } from '../admin/ui.js';
import overview from '../admin/views/overview.js';
import orders from '../admin/views/orders.js';
import customers from '../admin/views/customers.js';
import payments from '../admin/views/payments.js';
import products from '../admin/views/products.js';
import categories from '../admin/views/categories.js';
import inventory from '../admin/views/inventory.js';
import offers from '../admin/views/offers.js';
import * as K from '../admin/stock.js';
import expensesV from '../admin/views/expenses.js';
import staffV from '../admin/views/staff.js';
import settingsV from '../admin/views/settings.js';
import auditV from '../admin/views/audit.js';
import analyticsV from '../admin/views/analytics.js';
import reportsV from '../admin/views/reports.js';

const qs = new URLSearchParams(location.search), role = qs.get('role') || 'owner', empty = qs.get('empty') === '1';
const cat = await (await fetch('../products.json')).json();
let seed = 20261107; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const NAMES = ['Aisha Khan', 'Omar Haddad', 'Priya Nair', 'John Smith', 'Fatima Al Mazrouei', 'Carlos Diaz', 'Mei Lin', 'Sara Ahmed', 'Dmitri Ivanov', 'Layla Hassan', 'Ravi Patel', 'Elena Rossi'];
const custs = NAMES.map((n, i) => ({ name: n, phone: '97150' + String(1000000 + i * 91137).slice(0, 7), address: i % 4 === 3 ? '' : `Building ${i + 3}, Mirdif` }));
const NOW = Date.now(), DAY = 86400e3, fx = [], pays = [];
if (!empty) for (let d = 44; d >= 0; d--) {
  const n = d < 7 ? 1 + Math.floor(rnd() * 4) : Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const c = pick(custs), items = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => { const p = pick(cat.p), q = p.u === 'kg' ? +(0.5 * (1 + Math.floor(rnd() * 4))).toFixed(1) : 1 + Math.floor(rnd() * 3); return { id: p.id, name: p.n, unit: p.u, qty: q, unitPrice: p.pr, lineTotal: Math.round(p.pr * q * 100) / 100, cat: p.c }; });
    const sub = Math.round(items.reduce((s, i) => s + i.lineTotal * 100, 0)) / 100, pickup = !c.address || rnd() < .2;
    const status = d > 3 ? (rnd() < .1 ? 'cancelled' : pickup ? 'collected' : 'delivered') : pick(['awaiting_confirmation', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']);
    const paid = ['delivered', 'collected'].includes(status) && rnd() < .8, t = NOW - d * DAY - Math.floor(rnd() * 12 * 3600e3), id = `CC-${S.dayKey(t).replace(/-/g, '')}-${(1000 + fx.length * 37).toString(36).toUpperCase().padStart(4, 'X')}`;
    const o = { id, orderId: id, status, paymentStatus: paid ? 'paid' : 'pending', paymentMethod: paid ? 'cash' : undefined, fulfilment: pickup ? 'pickup' : 'delivery', customer: { name: c.name, phone: c.phone, address: pickup ? '' : c.address }, items, subtotal: sub, discount: 0, deliveryCharge: 0, total: sub, currency: 'AED', source: 'website', totalsVerified: rnd() < .5, createdAt: { seconds: Math.floor(t / 1000) }, notes: rnd() < .15 ? 'Please ring the bell' : '' };
    fx.push(o); if (paid) pays.push({ id: 'PAY-' + id, paymentId: 'PAY-' + id.slice(3), orderId: id, customer: { name: c.name, phone: c.phone }, amount: sub, method: pick(['cash', 'card', 'cash_on_delivery']), reference: '', status: 'paid', paidAt: t + 3600e3, createdAt: { seconds: Math.floor(t / 1000) + 3600 } });
  }
}
const ctx = {
  role, user: { uid: 'u1', email: 'owner@example.test' }, orders: fx, products: cat.p.map(p => ({ id: p.id, name: p.n, price: p.pr, oldPrice: p.old || 0, unit: p.u, category: p.c, available: true, deal: !!p.deal, featured: !!p.feat, bestSeller: !!p.best })), payments: pays, customerDocs: {},
  categories: cat.cats.map(c => ({ id: c.id, n: c.n })), categoryDocs: qs.get('cats') === '0' ? [] : cat.cats.map((c, i) => ({ id: c.id, n: c.n, order: i + 1, visible: true, imageUrl: c.img })), inventory: empty || qs.get('inv') === '0' ? [] : cat.p.slice(0, 12).map((p, i) => ({ id: p.id, productId: p.id, name: p.n, stock: [0, 3, 40, 12, 2, 0.5][i % 6], lowStockAt: 5, costPrice: +(p.pr * .7).toFixed(2), sku: 'SKU' + i, supplier: 'Test supplier' })), settings: {}, movements: [], expenses: empty ? [] : [['Rent', 9000, 5], ['Electricity & water', 1450.5, 12], ['Salaries', 15000, 3], ['Packaging', 320, 1], ['Delivery', 210.25, 20]].map(([c, a, d], i) => ({ id: 'E' + i, date: S.dayKey(NOW - d * DAY), category: c, amount: a, vendor: 'Vendor ' + i, note: 'Test expense' })), audit: empty ? [] : [['status.confirmed', 'CC-1', 'status'], ['payment.paid', 'CC-2', 'AED 40'], ['export.orders', 'orders', '12 rows']].map(([a, t, d], i) => ({ id: 'A' + i, uid: 'u1', email: 'owner@example.test', role: 'owner', action: a, target: t, detail: d, at: NOW - i * 3600e3 })), staff: [{ id: 'u1', email: 'owner@example.test', role: 'owner', active: true }, { id: 'u2', email: 'sales@example.test', name: 'Sam Sales', role: 'sales', active: true }, { id: 'u3', email: 'old@example.test', role: 'viewer', active: false }], inventoryError: '', categoriesError: '', ordersError: '', ordersTruncated: false, productsError: '', paymentsError: '', rangeKey: qs.get('range') || 'last30', custom: { from: '', to: '' }, route: { id: '', param: '', query: {} },
  now: () => Date.now(), can: a => can(role, a), rerender: () => render(), log: []
};
ctx.range = S.rangeFor(ctx.rangeKey, Date.now(), ctx.custom);
ctx.api = {
  errorText: e => e.message || String(e), audit: (...a) => ctx.log.push(['audit', ...a]),
  async updateOrderStatus(o, status) { if (!can(role, 'orders.updateStatus')) throw new Error('permission-denied'); ctx.log.push(['status', o.orderId, status]); o.statusHistory = [...(o.statusHistory || []), { status, at: Date.now(), byName: 'owner@example.test' }]; o.status = status; },
  async verifyTotals(o) { o.totalsVerified = true; ctx.log.push(['verify', o.orderId]); },
  async recordPayment(p) { const id = 'PAY-TEST-' + (ctx.payments.length + 1); ctx.log.push(['payment', p.order.orderId, p.status, p.amount, p.method, p.reference]); ctx.payments.unshift({ id, paymentId: id, orderId: p.order.orderId, customer: p.order.customer, amount: p.amount, method: p.method, reference: p.reference, status: p.status, paidAt: p.paidAt, createdAt: { seconds: Date.now() / 1000 } }); p.order.paymentStatus = p.status; p.order.paymentMethod = p.method; return id; },
  async saveCustomerNote(c, notes) { ctx.customerDocs[c.id] = { notes }; ctx.log.push(['note', c.id, notes]); },
  async saveCategory(d, id) { ctx.log.push(['cat', id, d.n]); const i = ctx.categoryDocs.findIndex(c => c.id === id); if (i < 0) ctx.categoryDocs.push({ id, ...d }); else Object.assign(ctx.categoryDocs[i], d); },
  async seedCategories() { return 12; }, async loadInventory() { }, async loadMovements() { return ctx.mv || []; },
  async saveStock(p, meta, move) { const cur = ctx.inventory.find(i => i.id === p.id) || { id: p.id, productId: p.id }; if (!ctx.inventory.includes(cur)) ctx.inventory.push(cur); if (move) { const pl = K.planMovement(move.type, move.qty, cur.stock); if (pl.error) throw new Error(pl.error); cur.stock = pl.after; } Object.assign(cur, meta); ctx.log.push(['stock', p.id, move && move.type, cur.stock]); },
  async setAvailable(p, a) { p.available = a; ctx.log.push(['avail', p.id, a]); }, async setDeal(p) { ctx.products.forEach(x => x.deal = false); if (p) p.deal = true; ctx.log.push(['deal', p && p.id]); },
  async savePublicSettings(v) { ctx.settings = { ...ctx.settings, ...v }; ctx.log.push(['settings', JSON.stringify(v)]); },
  async loadExpenses() { }, async loadAudit() { }, async loadStaff() { },
  async saveExpense(v, id) { ctx.log.push(['expense', id || 'new', v.category, v.amount]); if (id) Object.assign(ctx.expenses.find(e => e.id === id), v, { amount: +v.amount }); else ctx.expenses.unshift({ id: 'EN' + ctx.expenses.length, ...v, amount: +v.amount }); },
  async deleteExpense(e) { ctx.log.push(['expense-del', e.id]); ctx.expenses = ctx.expenses.filter(x => x.id !== e.id); },
  async addStaff(v) { ctx.log.push(['staff-add', v.email, v.role]); ctx.staff.push({ id: 'u' + (ctx.staff.length + 1), email: v.email, name: v.name, role: v.role, active: true }); },
  async updateStaff(id, patch) { ctx.log.push(['staff-update', id, JSON.stringify(patch)]); Object.assign(ctx.staff.find(x => x.id === id), patch); }, async resetPassword(e) { ctx.log.push(['reset', e]); },
  async loadProducts() { }, async saveProduct(d, id) { ctx.log.push(['saveProduct', id, d.name]); }, async deleteProduct(p) { ctx.log.push(['delete', p.id]); ctx.products = ctx.products.filter(x => x.id !== p.id); }, async seedProducts() { return 0; }
};
const VIEWS = { overview, orders, customers, payments, products, categories, inventory, offers, expenses: expensesV, staff: staffV, settings: settingsV, audit: auditV, analytics: analyticsV, reports: reportsV };
const parse = () => { const [path, q] = location.hash.replace(/^#\/?/, '').split('?'), [id, param] = path.split('/'); return { id: id || firstSection(role), param: decodeURIComponent(param || ''), query: Object.fromEntries(new URLSearchParams(q || '')) }; };
function nav() { const pend = ctx.orders.filter(o => S.PENDING.includes(o.status)).length; $('#nav').innerHTML = SECTIONS.filter(s => canSee(role, s.id)).map(s => `<a class="nv${ctx.route.id === s.id ? ' on' : ''}" href="#/${s.id}">${icon(s.icon)}<span>${esc(s.label)}</span>${s.id === 'orders' && pend ? `<b class="cnt">${pend}</b>` : s.soon ? '<em class="soon">Soon</em>' : ''}</a>`).join(''); }
let navKey = '';
function render() {
  const r = parse(), key = JSON.stringify(r); if (key !== navKey) { closeModal(); for (const k of Object.keys($('#view').dataset)) delete $('#view').dataset[k]; navKey = key; }
  ctx.route = r; ctx.range = S.rangeFor(ctx.rangeKey, Date.now(), ctx.custom); $('#ttl').textContent = VIEWS[r.id].title; $('#rng').hidden = !VIEWS[r.id].usesRange;
  $('#rk').innerHTML = S.RANGES.map(([k, l]) => `<option value="${k}"${k === ctx.rangeKey ? ' selected' : ''}>${l}</option>`).join(''); nav(); VIEWS[r.id].render($('#view'), ctx);
}
document.addEventListener('click', e => { if (e.target.closest('[data-close-modal]') || e.target.id === 'modal') closeModal(); const g = e.target.closest('[data-go]'); if (g) location.hash = g.dataset.go; });
$('#rk').addEventListener('change', e => { ctx.rangeKey = e.target.value; render(); });
$('#who').textContent = 'owner@example.test'; $('#role').textContent = ROLES[role];
addEventListener('hashchange', render);
Object.assign(window, { __ctx: ctx, __render: render, __S: S, __toast: toast });
render(); window.__ready = true;
