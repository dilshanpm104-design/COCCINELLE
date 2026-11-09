// COCCINELLE admin - pure calculation layer (no DOM, no Firebase). Unit-tested in tests/stats.test.mjs.
// All business figures come from order records. Nothing here invents data.
// Money is summed in integer fils (1 AED = 100 fils) to avoid floating-point drift.

export const TZ_OFFSET_MS = 4 * 3600e3; // UAE (Asia/Dubai) is UTC+4 all year, no daylight saving.
const DAY = 86400e3;

export const STATUS = {
  new: 'New Order', awaiting_confirmation: 'Awaiting WhatsApp Confirmation', confirmed: 'Confirmed',
  preparing: 'Preparing', ready_for_delivery: 'Ready for Delivery', out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered', collected: 'Collected', cancelled: 'Cancelled'
};
export const PENDING = ['new', 'awaiting_confirmation'];
export const IN_PROGRESS = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery'];
export const COMPLETED = ['delivered', 'collected'];
// An order counts as a SALE once the shop has confirmed it. Pending and cancelled orders never count.
export const COUNTED = [...IN_PROGRESS, ...COMPLETED];
export const PAY_STATUS = { pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Partially Refunded' };
export const PAY_METHOD = { cash: 'Cash', card: 'Card', bank_transfer: 'Bank Transfer', cash_on_delivery: 'Cash on Delivery', online: 'Online Payment', other: 'Other' };
export const SEG = { highValueAed: 1000, regularOrders: 5, newDays: 30, inactiveDays: 60 };

/** Same rule the website checkout uses: digits only, 00 prefix dropped, a leading 0 becomes the UAE code 971. */
export function normPhone(v) { let d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0')) d = '971' + d.slice(1); return d; }
/** Search helper: needs at least 3 typed digits, then matches any phone format (050 123 4567, +971 50 123 4567, 971501234567). */
export function phoneQuery(q) { const raw = String(q || '').replace(/\D/g, ''); return raw.length >= 3 ? normPhone(raw) : ''; }

export const fils = n => Math.round((Number(n) || 0) * 100);
export const aed = f => f / 100;

/** Milliseconds since epoch for an order/payment, from a Firestore Timestamp, {seconds}, number or ISO string. */
export function tms(o, key) {
  const c = o && (key ? o[key] : (o.createdAt || o.paidAt));
  if (c) {
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c.seconds === 'number') return c.seconds * 1000 + Math.floor((c.nanoseconds || 0) / 1e6);
    if (typeof c === 'number') return c;
  }
  const iso = o && o.clientCreatedAt ? Date.parse(o.clientCreatedAt) : NaN;
  return Number.isFinite(iso) ? iso : 0;
}

// ---------- calendar helpers in Dubai time ----------
export const dayStart = t => Math.floor((t + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS;
export const dayKey = t => new Date(t + TZ_OFFSET_MS).toISOString().slice(0, 10);
const ymd = t => { const d = new Date(t + TZ_OFFSET_MS); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
export const monthStart = (t, add = 0) => { const [y, m] = ymd(t); return Date.UTC(y, m + add, 1) - TZ_OFFSET_MS; };
export const yearStart = (t, add = 0) => { const [y] = ymd(t); return Date.UTC(y + add, 0, 1) - TZ_OFFSET_MS; };
export const weekStart = t => { const s = dayStart(t), dow = new Date(s + TZ_OFFSET_MS).getUTCDay(); return s - ((dow + 6) % 7) * DAY; }; // Monday
export const parseDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - TZ_OFFSET_MS : NaN; };

export const RANGES = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'],
  ['thisMonth', 'This month'], ['prevMonth', 'Previous month'], ['thisYear', 'This year'], ['custom', 'Custom range']
];

/** Returns {key,label,start,end} where end is exclusive. */
export function rangeFor(key, now = Date.now(), custom = {}) {
  const t0 = dayStart(now), label = (RANGES.find(r => r[0] === key) || [0, key])[1];
  switch (key) {
    case 'today': return { key, label, start: t0, end: t0 + DAY };
    case 'yesterday': return { key, label, start: t0 - DAY, end: t0 };
    case 'last7': return { key, label, start: t0 - 6 * DAY, end: t0 + DAY };
    case 'last30': return { key, label, start: t0 - 29 * DAY, end: t0 + DAY };
    case 'thisMonth': return { key, label, start: monthStart(now), end: monthStart(now, 1) };
    case 'prevMonth': return { key, label, start: monthStart(now, -1), end: monthStart(now) };
    case 'thisYear': return { key, label, start: yearStart(now), end: yearStart(now, 1) };
    case 'custom': {
      const a = parseDay(custom.from), b = parseDay(custom.to);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return { key, label, start: t0, end: t0 + DAY, invalid: true };
      return { key, label, start: a, end: b + DAY };
    }
    default: return rangeFor('last30', now);
  }
}
/** The period to compare against: calendar-aware for months/years, otherwise the same length immediately before. */
export function prevRange(r) {
  if (r.key === 'thisMonth') return { start: monthStart(r.start, -1), end: r.start };
  if (r.key === 'prevMonth') return { start: monthStart(r.start, -1), end: r.start };
  if (r.key === 'thisYear') return { start: yearStart(r.start, -1), end: r.start };
  const len = r.end - r.start; return { start: r.start - len, end: r.start };
}
export const inRange = (o, r) => { const t = tms(o); return t >= r.start && t < r.end; };
export const pctChange = (cur, prev) => prev > 0 ? (cur - prev) / prev * 100 : null;

// ---------- aggregates ----------
export function summary(orders, r) {
  const list = orders.filter(o => inRange(o, r));
  let salesF = 0, counted = 0, pending = 0, inprog = 0, done = 0, cancelled = 0, pendingF = 0;
  for (const o of list) {
    const s = o.status, f = fils(o.total);
    if (COUNTED.includes(s)) { salesF += f; counted++; }
    if (PENDING.includes(s)) { pending++; pendingF += f; }
    if (IN_PROGRESS.includes(s)) inprog++;
    if (COMPLETED.includes(s)) done++;
    if (s === 'cancelled') cancelled++;
  }
  return {
    orders: list.length, sales: aed(salesF), countedOrders: counted, pending, confirmed: inprog, completed: done, cancelled,
    pendingValue: aed(pendingF), aov: counted ? aed(Math.round(salesF / counted)) : 0
  };
}
const bucket = (orders, keys, keyOf) => {
  const m = new Map(keys.map(k => [k, { sales: 0, orders: 0 }]));
  for (const o of orders) {
    if (!COUNTED.includes(o.status)) continue;
    const b = m.get(keyOf(tms(o))); if (b) { b.sales += fils(o.total); b.orders++; }
  }
  return keys.map(k => ({ key: k, sales: aed(m.get(k).sales), orders: m.get(k).orders }));
};
export function dailySeries(orders, r) {
  const keys = []; for (let t = r.start; t < r.end; t += DAY) keys.push(dayKey(t));
  return bucket(orders, keys, dayKey);
}
export function weeklySeries(orders, now, n = 8) {
  const w0 = weekStart(now), starts = Array.from({ length: n }, (_, i) => w0 - (n - 1 - i) * 7 * DAY), keys = starts.map(dayKey);
  return bucket(orders, keys, t => dayKey(weekStart(t)));
}
export function monthlySeries(orders, now, n = 12) {
  const keys = Array.from({ length: n }, (_, i) => dayKey(monthStart(now, -(n - 1 - i))).slice(0, 7));
  return bucket(orders, keys, t => dayKey(t).slice(0, 7));
}
export function yearlySeries(orders, now, n = 3) {
  const y = ymd(now)[0], keys = Array.from({ length: n }, (_, i) => String(y - (n - 1 - i)));
  return bucket(orders, keys, t => dayKey(t).slice(0, 4));
}
export function countBy(list, pick, order) {
  const m = {}; for (const o of list) { const k = pick(o); m[k] = (m[k] || 0) + 1; }
  return (order || Object.keys(m)).map(k => ({ key: k, count: m[k] || 0 })).filter(x => x.count > 0);
}
export const statusCounts = (orders, r) => countBy(orders.filter(o => inRange(o, r)), o => o.status || 'new', Object.keys(STATUS));
export const paymentCounts = (orders, r) => countBy(orders.filter(o => inRange(o, r) && o.status !== 'cancelled'), o => o.paymentStatus || 'pending', Object.keys(PAY_STATUS));

/** Product sales from counted orders in range. Slow movers are listed by the caller using the product catalogue. */
export function productSales(orders, r) {
  const m = new Map();
  for (const o of orders) {
    if (!inRange(o, r) || !COUNTED.includes(o.status)) continue;
    for (const i of o.items || []) {
      const k = String(i.id != null ? i.id : i.name), e = m.get(k) || { id: k, name: i.name, unit: i.unit, cat: i.cat || '', qty: 0, revF: 0, orders: 0 };
      e.qty = +(e.qty + (Number(i.qty) || 0)).toFixed(3); e.revF += fils(i.lineTotal); e.orders++; if (i.cat) e.cat = i.cat; m.set(k, e);
    }
  }
  return [...m.values()].map(e => ({ id: e.id, name: e.name, unit: e.unit, cat: e.cat, qty: e.qty, orders: e.orders, revenue: aed(e.revF) })).sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

// ---------- customers (derived from orders; notes live in the customers collection) ----------
export const customerId = phone => 'C-' + String(phone).replace(/\D/g, '');
export function buildCustomers(orders, noteDocs = {}, now = Date.now(), seg = SEG) {
  const m = new Map();
  for (const o of orders.slice().sort((a, b) => tms(a) - tms(b))) {
    const ph = o.customer && o.customer.phone; if (!ph) continue;
    const c = m.get(ph) || { id: customerId(ph), phone: ph, whatsapp: ph, name: '', address: '', first: 0, last: 0, orders: 0, allOrders: 0, verifiedF: 0, orderIds: [], notes: '' };
    const t = tms(o);
    c.allOrders++; c.orderIds.push(o.orderId || o.id);
    if (o.status !== 'cancelled') {
      c.orders++; if (!c.first) c.first = t; c.last = t;
      if (o.paymentStatus === 'paid') c.verifiedF += fils(o.total);
    }
    c.name = o.customer.name || c.name; if (o.customer.address) c.address = o.customer.address;
    m.set(ph, c);
  }
  const list = [];
  for (const c of m.values()) {
    if (!c.orders) continue; // someone who only ever cancelled is not counted as a customer yet
    const n = noteDocs[c.id]; if (n) { c.notes = n.notes || ''; if (n.name) c.name = n.name; }
    c.verified = aed(c.verifiedF); delete c.verifiedF;
    c.segment = c.verified >= seg.highValueAed ? 'high_value' : c.orders >= seg.regularOrders ? 'regular' : c.orders >= 2 ? 'returning' : 'new';
    c.inactive = now - c.last > seg.inactiveDays * DAY;
    list.push(c);
  }
  return list.sort((a, b) => b.last - a.last);
}
export const SEGMENTS = { new: 'New', returning: 'Returning', regular: 'Regular', high_value: 'High-Value' };
export const newCustomersIn = (customers, r) => customers.filter(c => c.first >= r.start && c.first < r.end).length;

// ---------- order sanity checks ----------
/** Compares what the customer's browser recorded with arithmetic and the live catalogue. Returns warning strings. */
export function orderWarnings(o, products = []) {
  const w = [], items = o.items || [];
  const lines = items.reduce((s, i) => s + fils(i.lineTotal), 0);
  if (lines !== fils(o.subtotal)) w.push('Item lines do not add up to the subtotal.');
  if (fils(o.subtotal) - fils(o.discount) + fils(o.deliveryCharge) !== fils(o.total)) w.push('Subtotal, discount and delivery do not add up to the total.');
  const byId = new Map(products.map(p => [String(p.id), p]));
  for (const i of items) {
    const p = byId.get(String(i.id));
    if (p && fils(p.price) !== fils(i.unitPrice)) w.push(`${i.name}: ordered at AED ${Number(i.unitPrice).toFixed(2)}, current price is AED ${Number(p.price).toFixed(2)}.`);
    if (!p && products.length) w.push(`${i.name}: product no longer in the catalogue.`);
  }
  if (!o.totalsVerified) w.push('Totals were calculated in the customer\'s browser and have not been verified by staff.');
  return w;
}

// ---------- CSV ----------
/** RFC-4180 CSV. Cells starting with = + - @ are prefixed with ' so spreadsheet apps never run them as formulas. */
export function toCSV(rows, cols) {
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(c.get(r))).join(','))].join('\r\n');
}
