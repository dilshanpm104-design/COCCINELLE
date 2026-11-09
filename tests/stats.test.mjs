// Unit tests for admin/stats.js. Fixtures below are TEST DATA ONLY and are never shipped to the dashboard.
import assert from 'node:assert/strict';
import * as S from '../admin/stats.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
// "now" = Sunday 8 Nov 2026, 10:00 Dubai (06:00 UTC)
const NOW = Date.UTC(2026, 10, 8, 6, 0);
const at = (iso) => ({ seconds: Date.parse(iso) / 1000 });
const mk = (id, iso, status, total, extra = {}) => ({ orderId: id, createdAt: at(iso), status, total, subtotal: total, discount: 0, deliveryCharge: 0, paymentStatus: 'pending', customer: { name: 'X', phone: '971500000000' }, items: [], ...extra });
const A = { name: 'Alice', phone: '971501111111', address: 'Mirdif 1' }, B = { name: 'Bob', phone: '971502222222' }, C = { name: 'Cara', phone: '971503333333', address: 'Uptown' }, D = { name: 'Dan', phone: '971504444444' };
const orders = [
  mk('o1', '2026-11-08T04:00:00Z', 'confirmed', 100.10, { customer: A }),
  mk('o2', '2026-11-08T05:00:00Z', 'delivered', 50.20, { customer: A, paymentStatus: 'paid' }),
  mk('o3', '2026-11-08T05:30:00Z', 'awaiting_confirmation', 30, { customer: B }),
  mk('o4', '2026-11-07T19:30:00Z', 'delivered', 200, { customer: A, paymentStatus: 'paid' }),   // 23:30 Dubai on the 7th
  mk('o5', '2026-11-07T20:30:00Z', 'confirmed', 10, { customer: C }),                          // 00:30 Dubai on the 8th (still the 7th in UTC)
  mk('o6', '2026-11-06T10:00:00Z', 'cancelled', 999, { customer: D }),
  mk('o7', '2026-10-15T10:00:00Z', 'delivered', 300, { customer: C, paymentStatus: 'paid' })
];

t('Dubai day boundary: 20:30Z belongs to the next Dubai day', () => {
  assert.equal(S.dayKey(Date.parse('2026-11-07T20:30:00Z')), '2026-11-08');
  assert.equal(S.dayKey(Date.parse('2026-11-07T19:30:00Z')), '2026-11-07');
});
t('range keys', () => {
  const r = S.rangeFor('today', NOW); assert.equal(r.end - r.start, 86400e3); assert.equal(S.dayKey(r.start), '2026-11-08');
  assert.equal(S.dayKey(S.rangeFor('yesterday', NOW).start), '2026-11-07');
  const l7 = S.rangeFor('last7', NOW); assert.equal(S.dayKey(l7.start), '2026-11-02'); assert.equal((l7.end - l7.start) / 86400e3, 7);
  assert.equal((S.rangeFor('last30', NOW).end - S.rangeFor('last30', NOW).start) / 86400e3, 30);
  assert.equal(S.dayKey(S.rangeFor('thisMonth', NOW).start), '2026-11-01'); assert.equal(S.dayKey(S.rangeFor('thisMonth', NOW).end), '2026-12-01');
  assert.equal(S.dayKey(S.rangeFor('prevMonth', NOW).start), '2026-10-01'); assert.equal(S.dayKey(S.rangeFor('prevMonth', NOW).end), '2026-11-01');
  assert.equal(S.dayKey(S.rangeFor('thisYear', NOW).start), '2026-01-01'); assert.equal(S.dayKey(S.rangeFor('thisYear', NOW).end), '2027-01-01');
});
t('custom range is inclusive of the last day; invalid input is flagged', () => {
  const r = S.rangeFor('custom', NOW, { from: '2026-11-01', to: '2026-11-03' }); assert.equal((r.end - r.start) / 86400e3, 3);
  assert.equal(S.rangeFor('custom', NOW, { from: '2026-11-05', to: '2026-11-01' }).invalid, true);
  assert.equal(S.rangeFor('custom', NOW, { from: '', to: '' }).invalid, true);
});
t('prevRange is calendar aware for months/years and equal length otherwise', () => {
  const pm = S.prevRange(S.rangeFor('thisMonth', NOW)); assert.equal(S.dayKey(pm.start), '2026-10-01'); assert.equal(S.dayKey(pm.end), '2026-11-01');
  const py = S.prevRange(S.rangeFor('thisYear', NOW)); assert.equal(S.dayKey(py.start), '2025-01-01');
  const p7 = S.prevRange(S.rangeFor('last7', NOW)); assert.equal(S.dayKey(p7.start), '2026-10-26'); assert.equal(S.dayKey(p7.end), '2026-11-02');
});
t('today summary: only confirmed-or-later orders count as sales', () => {
  const s = S.summary(orders, S.rangeFor('today', NOW));
  assert.equal(s.orders, 4); assert.equal(s.sales, 160.3); assert.equal(s.countedOrders, 3);
  assert.equal(s.pending, 1); assert.equal(s.pendingValue, 30); assert.equal(s.confirmed, 2); assert.equal(s.completed, 1); assert.equal(s.cancelled, 0);
  assert.equal(s.aov, 53.43);
});
t('yesterday, this month, previous month', () => {
  assert.equal(S.summary(orders, S.rangeFor('yesterday', NOW)).sales, 200);
  const m = S.summary(orders, S.rangeFor('thisMonth', NOW)); assert.equal(m.sales, 360.3); assert.equal(m.cancelled, 1); assert.equal(m.orders, 6);
  assert.equal(S.summary(orders, S.rangeFor('prevMonth', NOW)).sales, 300);
});
t('cancelled orders never add to sales', () => { assert.equal(S.summary(orders, S.rangeFor('last7', NOW)).sales, 360.3); });
t('no floating-point drift (0.1+0.2 style sums)', () => {
  const o = [mk('a', '2026-11-08T04:00:00Z', 'delivered', 0.1), mk('b', '2026-11-08T04:00:00Z', 'delivered', 0.2)];
  assert.equal(S.summary(o, S.rangeFor('today', NOW)).sales, 0.3);
});
t('empty data gives zeros, not invented numbers', () => {
  const s = S.summary([], S.rangeFor('thisYear', NOW)); assert.deepEqual([s.orders, s.sales, s.aov, s.pending], [0, 0, 0, 0]);
  assert.equal(S.pctChange(5, 0), null);
});
t('daily series zero-fills every day of the range', () => {
  const d = S.dailySeries(orders, S.rangeFor('last7', NOW)); assert.equal(d.length, 7);
  assert.equal(d[0].key, '2026-11-02'); assert.equal(d[6].key, '2026-11-08');
  assert.equal(d[6].sales, 160.3); assert.equal(d[5].sales, 200); assert.equal(d[4].sales, 0); // 6th = cancelled only
  assert.equal(d.reduce((s, x) => s + x.sales, 0), 360.3);
});
t('weekly series (Monday start) and monthly series', () => {
  const w = S.weeklySeries(orders, NOW, 8); assert.equal(w.length, 8); assert.equal(w[7].key, '2026-11-02'); assert.equal(w[7].sales, 360.3);
  assert.equal(w[5].key, '2026-10-19'); assert.equal(w[4].key, '2026-10-12'); assert.equal(w[4].sales, 300);
  const m = S.monthlySeries(orders, NOW, 12); assert.equal(m.length, 12); assert.equal(m[11].key, '2026-11'); assert.equal(m[11].sales, 360.3); assert.equal(m[10].sales, 300); assert.equal(m[0].key, '2025-12');
  const y = S.yearlySeries(orders, NOW, 3); assert.deepEqual(y.map(x => x.key), ['2024', '2025', '2026']); assert.equal(y[2].sales, 660.3);
});
t('status and payment counts', () => {
  const sc = S.statusCounts(orders, S.rangeFor('thisMonth', NOW)); const g = k => (sc.find(x => x.key === k) || {}).count || 0;
  assert.equal(g('confirmed'), 2); assert.equal(g('delivered'), 2); assert.equal(g('cancelled'), 1); assert.equal(g('awaiting_confirmation'), 1); assert.equal(g('preparing'), 0);
  const pc = S.paymentCounts(orders, S.rangeFor('thisMonth', NOW)); assert.equal(pc.find(x => x.key === 'paid').count, 2); assert.equal(pc.find(x => x.key === 'pending').count, 3); // cancelled excluded
});
t('product sales ranks by revenue and ignores pending/cancelled', () => {
  const o = [
    mk('a', '2026-11-08T04:00:00Z', 'delivered', 0, { items: [{ id: 'f1', name: 'Banana', unit: 'kg', qty: 1.5, lineTotal: 6.75, cat: 'fruits' }, { id: 'd1', name: 'Milk', unit: 'pc', qty: 2, lineTotal: 13 }] }),
    mk('b', '2026-11-08T04:00:00Z', 'confirmed', 0, { items: [{ id: 'f1', name: 'Banana', unit: 'kg', qty: 0.5, lineTotal: 2.25 }] }),
    mk('c', '2026-11-08T04:00:00Z', 'awaiting_confirmation', 0, { items: [{ id: 'f1', name: 'Banana', unit: 'kg', qty: 9, lineTotal: 40.5 }] }),
    mk('d', '2026-11-08T04:00:00Z', 'cancelled', 0, { items: [{ id: 'd1', name: 'Milk', unit: 'pc', qty: 9, lineTotal: 58.5 }] })
  ];
  const p = S.productSales(o, S.rangeFor('today', NOW));
  assert.deepEqual(p.map(x => [x.id, x.qty, x.revenue]), [['d1', 2, 13], ['f1', 2, 9]]); assert.equal(p.find(x => x.id === 'f1').cat, 'fruits');
});
t('customers: verified spend counts only paid orders; cancelled-only people excluded', () => {
  const c = S.buildCustomers(orders, {}, NOW), by = Object.fromEntries(c.map(x => [x.phone, x]));
  assert.equal(c.length, 3); assert.ok(!by['971504444444']);
  assert.equal(by['971501111111'].orders, 3); assert.equal(by['971501111111'].verified, 250.2); assert.equal(by['971501111111'].segment, 'returning');
  assert.equal(by['971501111111'].id, 'C-971501111111'); assert.equal(by['971501111111'].address, 'Mirdif 1');
  assert.equal(by['971502222222'].verified, 0); assert.equal(by['971502222222'].segment, 'new'); assert.equal(by['971502222222'].inactive, false);
  assert.equal(by['971503333333'].orders, 2); assert.equal(S.tms({ createdAt: at('2026-10-15T10:00:00Z') }), by['971503333333'].first);
});
t('customer segments: regular, high value, inactive; notes merge in', () => {
  const many = Array.from({ length: 5 }, (_, i) => mk('r' + i, `2026-11-0${i + 1}T08:00:00Z`, 'delivered', 10, { customer: B }));
  assert.equal(S.buildCustomers(many, {}, NOW)[0].segment, 'regular');
  const big = [mk('h', '2026-11-01T08:00:00Z', 'delivered', 1000, { customer: B, paymentStatus: 'paid' })];
  assert.equal(S.buildCustomers(big, {}, NOW)[0].segment, 'high_value');
  const unpaidBig = [mk('h', '2026-11-01T08:00:00Z', 'delivered', 5000, { customer: B })];
  assert.equal(S.buildCustomers(unpaidBig, {}, NOW)[0].segment, 'new'); // unverified money never makes someone high-value
  const old = [mk('x', '2026-08-01T08:00:00Z', 'delivered', 10, { customer: B })];
  assert.equal(S.buildCustomers(old, {}, NOW)[0].inactive, true);
  assert.equal(S.buildCustomers(old, { 'C-971502222222': { notes: 'Allergic to nuts' } }, NOW)[0].notes, 'Allergic to nuts');
});
t('new customers in range uses first order date', () => {
  const c = S.buildCustomers(orders, {}, NOW);
  assert.equal(S.newCustomersIn(c, S.rangeFor('today', NOW)), 1);      // Bob only: Alice's first order was yesterday, Cara's in October
  assert.equal(S.newCustomersIn(c, S.rangeFor('thisMonth', NOW)), 2);  // Alice and Bob
});
t('order warnings catch arithmetic errors and price changes', () => {
  const good = { items: [{ id: 'f1', name: 'Banana', qty: 1, unitPrice: 4.5, lineTotal: 4.5 }], subtotal: 4.5, discount: 0, deliveryCharge: 0, total: 4.5, totalsVerified: true };
  assert.deepEqual(S.orderWarnings(good, [{ id: 'f1', price: 4.5 }]), []);
  assert.ok(S.orderWarnings({ ...good, total: 1 }).some(x => /add up to the total/.test(x)));
  assert.ok(S.orderWarnings({ ...good, subtotal: 9 }).some(x => /subtotal/.test(x)));
  assert.ok(S.orderWarnings(good, [{ id: 'f1', price: 5 }]).some(x => /current price is AED 5.00/.test(x)));
  assert.ok(S.orderWarnings(good, [{ id: 'zz', price: 5 }]).some(x => /no longer in the catalogue/.test(x)));
  assert.ok(S.orderWarnings({ ...good, totalsVerified: false }).some(x => /not been verified/.test(x)));
});
t('CSV: quoting, BOM, and formula-injection guard', () => {
  const csv = S.toCSV([{ n: 'Ali, "Al"', p: '=HYPERLINK("x")', q: '+971', v: -5 }], [{ label: 'Name', get: r => r.n }, { label: 'P', get: r => r.p }, { label: 'Q', get: r => r.q }, { label: 'V', get: r => r.v }]);
  assert.ok(csv.startsWith('﻿Name,P,Q,V\r\n')); assert.ok(csv.includes('"Ali, ""Al"""')); assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`)); assert.ok(csv.includes("'+971")); assert.ok(csv.endsWith(',-5'));
});
t('timestamp parsing accepts Timestamp-like, seconds, ISO and number', () => {
  assert.equal(S.tms({ createdAt: { toMillis: () => 42 } }), 42); assert.equal(S.tms({ createdAt: { seconds: 2, nanoseconds: 5e6 } }), 2005);
  assert.equal(S.tms({ clientCreatedAt: '2026-11-08T04:00:00Z' }), Date.parse('2026-11-08T04:00:00Z')); assert.equal(S.tms({}), 0);
});
console.log(`\n${n} test groups passed`);
