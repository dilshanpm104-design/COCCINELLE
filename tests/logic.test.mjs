// Logic tests for views (pure functions only) and a consistency check between admin/perms.js and firestore.rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../admin/stats.js';
import { validatePayment } from '../admin/views/payments.js';
import { nextStatus, filterOrders } from '../admin/views/orders.js';
import { filterCustomers } from '../admin/views/customers.js';
import { can, canSee, SECTIONS, ACTIONS, firstSection } from '../admin/perms.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
const o = (over = {}) => ({ orderId: 'CC-1', status: 'confirmed', total: 100, paymentStatus: 'pending', fulfilment: 'delivery', ...over });

t('payment: paid must equal full total, with reference for card/bank/online', () => {
  assert.equal(validatePayment({ order: o(), amount: 100, method: 'cash', status: 'paid' }), '');
  assert.match(validatePayment({ order: o(), amount: 60, method: 'cash', status: 'paid' }), /full order total/);
  assert.match(validatePayment({ order: o(), amount: 100, method: 'card', status: 'paid', reference: '' }), /transaction reference/);
  assert.equal(validatePayment({ order: o(), amount: 100, method: 'card', status: 'paid', reference: 'TX12345' }), '');
  assert.match(validatePayment({ order: o(), amount: 100, method: 'bank_transfer', status: 'paid', reference: 'ab' }), /transaction reference/);
});
t('payment: cannot overpay, zero, negative, junk, unknown method/status', () => {
  assert.match(validatePayment({ order: o(), amount: 100.01, method: 'cash', status: 'pending' }), /more than the order total/);
  assert.match(validatePayment({ order: o(), amount: 0, method: 'cash', status: 'pending' }), /greater than zero/);
  assert.match(validatePayment({ order: o(), amount: -5, method: 'cash', status: 'pending' }), /greater than zero/);
  assert.match(validatePayment({ order: o(), amount: 'abc', method: 'cash', status: 'pending' }), /greater than zero/);
  assert.match(validatePayment({ order: o(), amount: 10, method: 'bitcoin', status: 'pending' }), /payment method/);
  assert.match(validatePayment({ order: o(), amount: 10, method: 'cash', status: 'magic' }), /payment status/);
});
t('payment: no double-paying, no paying cancelled orders', () => {
  assert.match(validatePayment({ order: o({ paymentStatus: 'paid' }), amount: 100, method: 'cash', status: 'paid' }), /already marked as paid/);
  assert.match(validatePayment({ order: o({ status: 'cancelled' }), amount: 100, method: 'cash', status: 'paid' }), /cancelled order/);
});
t('payment: refunds only on paid orders; full vs partial rules', () => {
  const paid = o({ paymentStatus: 'paid' });
  assert.equal(validatePayment({ order: paid, amount: 100, method: 'cash', status: 'refunded' }), '');
  assert.match(validatePayment({ order: paid, amount: 40, method: 'cash', status: 'refunded' }), /full refund/);
  assert.equal(validatePayment({ order: paid, amount: 40, method: 'cash', status: 'partially_refunded' }), '');
  assert.match(validatePayment({ order: paid, amount: 100, method: 'cash', status: 'partially_refunded' }), /less than the order total/);
  assert.match(validatePayment({ order: o(), amount: 100, method: 'cash', status: 'refunded' }), /Only a paid order/);
});
t('payment: pennies compare exactly', () => {
  assert.equal(validatePayment({ order: o({ total: 0.3 }), amount: 0.1 + 0.2, method: 'cash', status: 'paid' }), '');
});
t('order workflow: delivery and pickup paths', () => {
  const dl = ['awaiting_confirmation', 'confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
  let s = 'awaiting_confirmation', path = [s]; while ((s = nextStatus(o({ status: s })))) path.push(s); assert.deepEqual(path, dl);
  s = 'new'; path = [s]; while ((s = nextStatus(o({ status: s, fulfilment: 'pickup' })))) path.push(s); assert.deepEqual(path, ['new', 'confirmed', 'preparing', 'collected']);
  assert.equal(nextStatus(o({ status: 'cancelled' })), ''); assert.equal(nextStatus(o({ status: 'delivered' })), '');
});
const NOW = Date.UTC(2026, 10, 8, 6, 0);
const list = [
  o({ orderId: 'CC-A', createdAt: { seconds: Date.UTC(2026, 10, 8, 4) / 1000 }, status: 'awaiting_confirmation', customer: { name: 'Alice Smith', phone: '971501234567', address: 'Mirdif 1' }, paymentStatus: 'pending' }),
  o({ orderId: 'CC-B', createdAt: { seconds: Date.UTC(2026, 10, 7, 4) / 1000 }, status: 'delivered', customer: { name: 'Bob', phone: '971509876543', address: 'Uptown' }, paymentStatus: 'paid', fulfilment: 'pickup' }),
  o({ orderId: 'CC-C', createdAt: { seconds: Date.UTC(2026, 7, 1, 4) / 1000 }, status: 'preparing', customer: { name: 'Cara', phone: '971501112222' }, paymentStatus: 'failed' })
];
const base = { q: '', status: '', pay: '', ful: '', scope: 'all' };
t('order filters: search by id, name, phone digits (any format), address', () => {
  const f = (x) => filterOrders(list, { ...base, ...x }, S.rangeFor('today', NOW)).map(r => r.orderId);
  assert.deepEqual(f({ q: 'cc-b' }), ['CC-B']); assert.deepEqual(f({ q: 'alice' }), ['CC-A']); assert.deepEqual(f({ q: '050 123 4567' }), ['CC-A']); assert.deepEqual(f({ q: '+971 50 987' }), ['CC-B']); assert.deepEqual(f({ q: 'uptown' }), ['CC-B']);
  assert.deepEqual(f({ q: '12' }), []); // too-short digit fragments do not match phones
});
t('order filters: status groups, payment, delivery/pickup, period, newest first', () => {
  const f = (x, r = 'today') => filterOrders(list, { ...base, ...x }, S.rangeFor(r, NOW)).map(r => r.orderId);
  assert.deepEqual(f({}), ['CC-A', 'CC-B', 'CC-C']); assert.deepEqual(f({ status: 'group:pending' }), ['CC-A']); assert.deepEqual(f({ status: 'group:progress' }), ['CC-C']); assert.deepEqual(f({ status: 'group:done' }), ['CC-B']);
  assert.deepEqual(f({ status: 'delivered' }), ['CC-B']); assert.deepEqual(f({ pay: 'paid' }), ['CC-B']); assert.deepEqual(f({ pay: 'pending' }), ['CC-A']); assert.deepEqual(f({ ful: 'pickup' }), ['CC-B']);
  assert.deepEqual(f({ scope: 'range' }), ['CC-A']); assert.deepEqual(f({ scope: 'range' }, 'last7'), ['CC-A', 'CC-B']);
});
t('customer filters and sorting', () => {
  const cs = S.buildCustomers([...list, o({ orderId: 'CC-D', createdAt: { seconds: Date.UTC(2026, 10, 6, 4) / 1000 }, status: 'delivered', paymentStatus: 'paid', total: 50, customer: list[0].customer })], {}, NOW);
  assert.equal(filterCustomers(cs, { q: 'alice', seg: '', sort: 'last' }).length, 1); assert.equal(filterCustomers(cs, { q: '501234567', seg: '', sort: 'last' }).length, 1);
  assert.equal(filterCustomers(cs, { q: '', seg: 'returning', sort: 'last' })[0].name, 'Alice Smith');
  assert.deepEqual(filterCustomers(cs, { q: '', seg: '', sort: 'spend' }).map(c => c.name), ['Bob', 'Alice Smith', 'Cara'].sort((a, b) => ({ Bob: 100, 'Alice Smith': 50, Cara: 0 }[b] - { Bob: 100, 'Alice Smith': 50, Cara: 0 }[a])));
  assert.equal(filterCustomers(cs, { q: '', seg: 'inactive', sort: 'last' }).map(c => c.name).join(), 'Cara');
});
t('roles: who can see what and do what', () => {
  assert.ok(canSee('owner', 'staff') && !canSee('manager', 'staff') && !canSee('sales', 'overview') && canSee('viewer', 'overview'));
  assert.ok(!canSee('inventory', 'orders') && !canSee('inventory', 'customers') && !canSee('inventory', 'payments') && canSee('inventory', 'inventory'));
  assert.ok(can('sales', 'orders.updateStatus') && !can('sales', 'payments.record') && !can('sales', 'orders.verifyTotals') && !can('viewer', 'orders.updateStatus') && !can('viewer', 'export.customers'));
  assert.ok(canSee('staff', 'products') && !canSee('staff', 'orders') && firstSection('inventory') === 'products' && firstSection('nobody') === null);
  assert.ok(!can('inventory', 'customers.editNotes') && !can(undefined, 'orders.updateStatus') && !can('owner', 'made.up'));
});

// ---- the UI role table must not promise more than the rules allow ----
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const block = name => { const i = rules.indexOf(`match /${name}/{`); assert.ok(i >= 0, name + ' block missing'); const e = rules.indexOf('\n    }', i); return rules.slice(i, e); };
const rolesIn = (txt) => [...new Set([...txt.matchAll(/'(owner|manager|sales|inventory|viewer|staff)'/g)].map(m => m[1]))].sort();
const allow = (blk, verb) => { const m = new RegExp(`allow [a-z, ]*${verb}[a-z, ]*: if ([^;]*);`).exec(blk); assert.ok(m, 'allow ' + verb + ' missing'); return m[1]; };
t('rules <-> UI: read access matches the sections', () => {
  const sec = id => SECTIONS.find(s => s.id === id).roles.slice().sort();
  assert.deepEqual(rolesIn(allow(block('orders'), 'read')), sec('orders'));
  assert.deepEqual(rolesIn(allow(block('customers'), 'read')), sec('customers'));
  assert.deepEqual(rolesIn(allow(block('payments'), 'read')), sec('payments'));
  assert.deepEqual(rolesIn(allow(block('expenses'), 'read')), sec('expenses'));
  assert.deepEqual(rolesIn(allow(block('inventory'), 'read')), sec('inventory'));
  assert.deepEqual(rolesIn(allow(block('audit_logs'), 'read')), sec('audit'));
});
t('rules <-> UI: write access matches the actions', () => {
  const A = k => ACTIONS[k].slice().sort();
  assert.deepEqual(rolesIn(allow(block('payments'), 'create')), A('payments.record'));
  assert.deepEqual(rolesIn(allow(block('customers'), 'create')), A('customers.editNotes'));
  assert.deepEqual(rolesIn(allow(block('products'), 'create')), A('products.edit'));
  const upd = allow(block('orders'), 'update'); assert.deepEqual(rolesIn(upd), ['manager', 'owner', 'sales']); assert.deepEqual(A('orders.updateStatus'), ['manager', 'owner', 'sales']);
  assert.match(upd, /hasOnly\(\['status', 'statusHistory', 'updatedAt', 'updatedBy'\]\)/); // sales is limited to workflow fields
  assert.match(upd, /hasRole\(\['owner', 'manager'\]\)\s*\|\|/);                          // only owner/manager can edit any field
  assert.ok(!/sales/.test(allow(block('payments'), 'create')) && !/sales|viewer/.test(allow(block('orders'), 'delete')));
});
t('rules: public can only CREATE orders; never read; payments/customers/audit closed to the public', () => {
  const ob = block('orders'); assert.match(ob, /allow create: if validOrder\(orderId\)/); assert.ok(!/allow read: if true/.test(ob));
  for (const c of ['payments', 'customers', 'expenses', 'inventory', 'stock_movements', 'audit_logs']) assert.ok(!/if true/.test(block(c)), c + ' must not be public');
  assert.match(rules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
  assert.match(allow(block('audit_logs'), 'update, delete'.split(',')[0]) || 'false', /false/);
});
console.log(`\n${n} test groups passed`);
