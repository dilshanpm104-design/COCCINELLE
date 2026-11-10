import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as S from '../admin/stats.js';
import * as F from '../admin/finance.js';
import { REPORTS, forRole, csvCols, asSheet } from '../admin/reports.js';
import { buildXlsx, crc32, safeSheetName } from '../admin/xlsx.js';
import { validateSettings } from '../admin/views/settings.js';
import { validateStaff } from '../admin/views/staff.js';
import { filterExpenses } from '../admin/views/expenses.js';
import { filterAudit } from '../admin/views/audit.js';
import { can, canSee, ACTIONS } from '../admin/perms.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
const NOW = Date.UTC(2026, 10, 10, 8, 0), R = S.rangeFor('thisMonth', NOW);
const ts = (d, h = 6) => ({ seconds: Date.UTC(2026, 10, d, h) / 1000 });
const line = (id, name, q, price, cat = 'fruits') => ({ id, name, unit: 'kg', qty: q, unitPrice: price, lineTotal: Math.round(q * price * 100) / 100, cat });
const orders = [
  { orderId: 'A', status: 'delivered', total: 40, subtotal: 40, discount: 0, deliveryCharge: 0, paymentStatus: 'paid', fulfilment: 'delivery', createdAt: ts(2), customer: { phone: '971501111111', name: 'X' }, items: [line('p1', 'Apple', 2, 10), line('p2', 'Bread', 4, 5, 'bakery')] },
  { orderId: 'B', status: 'confirmed', total: 18, subtotal: 15, discount: 0, deliveryCharge: 3, paymentStatus: 'pending', fulfilment: 'delivery', createdAt: ts(3), customer: { phone: '971502222222', name: 'Y' }, items: [line('p1', 'Apple', 1.5, 10)] },
  { orderId: 'C', status: 'cancelled', total: 100, subtotal: 100, discount: 0, deliveryCharge: 0, createdAt: ts(4), customer: { phone: '971503333333' }, items: [line('p1', 'Apple', 10, 10)] },
  { orderId: 'D', status: 'awaiting_confirmation', total: 55, subtotal: 55, discount: 0, deliveryCharge: 0, createdAt: ts(5), customer: { phone: '971504444444' }, items: [line('p3', 'Milk', 11, 5, 'dairy')] }
];
const exp = [{ id: 'e1', date: '2026-11-01', category: 'Rent', amount: 10 }, { id: 'e2', date: '2026-10-30', category: 'Rent', amount: 999 }, { id: 'e3', date: '2026-11-05', category: 'Delivery', amount: 5.55 }];
t('expenses: validation', () => {
  const ok = { date: '2026-11-01', category: 'Rent', amount: '10.5' }; assert.equal(F.validateExpense(ok), '');
  assert.match(F.validateExpense({ ...ok, amount: '0' }), /greater than zero/); assert.match(F.validateExpense({ ...ok, amount: '-4' }), /greater than zero/); assert.match(F.validateExpense({ ...ok, amount: '1.234' }), /two decimals/);
  assert.match(F.validateExpense({ ...ok, category: 'Gold' }), /category/); assert.match(F.validateExpense({ ...ok, date: '' }), /date/); assert.match(F.validateExpense({ ...ok, date: '2031-01-01' }), /future/);
});
t('expenses: totals respect the period and use exact money', () => {
  const x = F.expenseTotals(exp, R); assert.equal(x.total, 15.55); assert.equal(x.count, 2); assert.equal(x.byCat[0].cat, 'Rent');
  assert.deepEqual(filterExpenses(exp, { q: '', cat: 'Delivery' }, R).map(e => e.id), ['e3']);
});
t('profit: only counted orders, known costs only, flags an estimate', () => {
  const inv = { p1: { costPrice: 6 } };
  const p = F.profit(orders, [], exp, inv, R);
  assert.equal(p.orders, 2); assert.equal(p.revenue, 58);                         // A (40) + B (18); cancelled and unconfirmed excluded
  assert.equal(p.goodsCost, 21);                                                  // Apple 3.5kg x 6
  assert.equal(p.grossProfit, 35 - 21 + 0);                                       // Apple lines 20 + 15 = 35 revenue
  assert.equal(p.deliveryFees, 3); assert.equal(p.expenses, 15.55);
  assert.equal(p.netProfit, Math.round((14 + 3 - 15.55) * 100) / 100);
  assert.equal(p.complete, false); assert.ok(p.costCoverage > 0.6 && p.costCoverage < 0.7); assert.deepEqual(p.uncosted, ['Bread']);
});
t('profit: complete when every product has a cost; refunds reduce net sales and profit', () => {
  const inv = { p1: { costPrice: 6 }, p2: { costPrice: 3 } }, pay = [{ status: 'refunded', amount: 8, paidAt: Date.UTC(2026, 10, 6) }, { status: 'paid', amount: 40, paidAt: Date.UTC(2026, 10, 6) }];
  const p = F.profit(orders, pay, [], inv, R); assert.equal(p.complete, true); assert.equal(p.refunds, 8); assert.equal(p.netSales, 50); assert.equal(p.netProfit, 35 - 21 + 20 - 12 + 3 - 8);
  assert.equal(F.profit([], [], [], {}, R).costCoverage, null);
});
t('profit: basket discount is shared across lines (no overstated profit)', () => {
  const o = { orderId: 'Z', status: 'delivered', total: 90, subtotal: 100, discount: 10, deliveryCharge: 0, createdAt: ts(2), items: [line('p1', 'Apple', 10, 10)] };
  const p = F.profit([o], [], [], { p1: { costPrice: 6 } }, R); assert.equal(p.grossProfit, 30); assert.equal(p.complete, true);
});
const d = { orders, payments: [{ paymentId: 'P1', orderId: 'A', amount: 40, method: 'cash', status: 'paid', paidAt: Date.UTC(2026, 10, 3) }], products: [{ id: 'p1', name: 'Apple', price: 10, unit: 'kg', category: 'fruits', available: true }, { id: 'p2', name: 'Bread', price: 5, category: 'bakery' }], categories: [{ id: 'fruits', n: 'Fresh Fruits' }, { id: 'bakery', n: 'Bakery' }], inventory: [{ productId: 'p1', stock: 2, lowStockAt: 5, costPrice: 6 }], expenses: exp, audit: [{ at: NOW - 1000, email: 'o@x', role: 'owner', action: 'a.b', target: 't', detail: 'd' }], now: NOW, customerDocs: {} };
t('reports: 14 reports, every row matches its columns, nothing throws on data or on empty', () => {
  assert.equal(REPORTS.length, 14); assert.equal(new Set(REPORTS.map(r => r.id)).size, 14);
  const empt = { orders: [], payments: [], products: [], categories: [], inventory: [], expenses: [], audit: [], now: NOW, customerDocs: {} };
  for (const r of REPORTS) for (const src of [d, empt]) { const o = r.build(src, R); assert.ok(o.cols.length && Array.isArray(o.rows) && Array.isArray(o.notes), r.id); for (const row of o.rows) { assert.equal(row.length, o.cols.length, r.id + ' row width'); for (const v of row) assert.ok(v === '' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v), r.id + ' cell ' + v); } }
});
t('reports: key numbers are right', () => {
  const by = id => REPORTS.find(r => r.id === id).build(d, R);
  const daily = by('daily-sales'); assert.equal(daily.rows.reduce((s, r) => s + r[2], 0), 58); assert.equal(daily.rows.reduce((s, r) => s + r[1], 0), 2);
  const prod = by('product-sales'); assert.equal(prod.rows[0][0], 'Apple'); assert.equal(prod.rows[0][3], 3.5); assert.equal(Math.round(prod.rows.reduce((s, r) => s + r[6], 0) * 1000) / 1000, 1);
  assert.equal(by('category-sales').rows.find(r => r[0] === 'Fresh Fruits')[3], 35);
  assert.equal(by('orders').rows.length, 4); assert.equal(by('low-stock').rows[0][4], 'Low stock'); assert.equal(by('expenses').rows.at(-1)[4], 15.55);
  assert.equal(by('cancelled-unpaid').rows.map(r => r[0]).join(), 'C'); // C is cancelled; A is delivered but paid, so it is not listed
});
t('reports: role restrictions', () => { assert.ok(!forRole('viewer').some(r => r.id === 'activity') && forRole('owner').some(r => r.id === 'activity') && forRole('manager').length === 14 && forRole('viewer').length === 13); });
t('xlsx: crc32 known value, safe sheet names, formulas stay text', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.ok(!/[\\\/?*\[\]:]/.test(safeSheetName('A/B:C?*[x]'))); assert.ok(safeSheetName('x'.repeat(50)).length <= 31); assert.equal(safeSheetName('Sales', ['sales']), 'Sales 2');
});
t('xlsx: file opens in a real spreadsheet reader with correct values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xl-')), f = join(dir, 't.xlsx'), rep = REPORTS.find(r => r.id === 'product-sales').build(d, R);
  writeFileSync(f, buildXlsx([asSheet(rep, 'Product sales'), { name: 'Danger', cols: [{ label: 'Text' }, { label: 'Amt', fmt: 'money' }], rows: [['=HYPERLINK("http://x")', 1.5], ['+cmd|x', 2]] }]));
  let out; try { out = execFileSync('python3', ['-I', '-W', 'error', '-c', "import sys,openpyxl;wb=openpyxl.load_workbook(sys.argv[1]);a=wb['Product sales'];b=wb['Danger'];print(a.max_row,a['A4'].value,a['F4'].value,a['F4'].number_format,b['A2'].value,b['A2'].data_type,b['B2'].value)", f], { encoding: 'utf8' }); } catch (e) { if (/openpyxl|No module/.test(String(e.stderr))) { console.log('  (openpyxl missing, skipped)'); return; } throw e; }
  assert.match(out.trim(), /^\d+ Apple 35(\.0)? #,##0\.00 =HYPERLINK\("http:\/\/x"\) s 1\.5$/); assert.equal(execFileSync('unzip', ['-tq', f], { encoding: 'utf8' }).includes('No errors'), true);
});
t('csv of a report is safe and has a header', () => { const rep = REPORTS.find(r => r.id === 'orders').build(d, R), csv = S.toCSV(rep.rows, csvCols(rep)); assert.ok(csv.startsWith('﻿Order,')); assert.equal(csv.split('\r\n').length, rep.rows.length + 1); });
t('settings validation', () => {
  const ok = { wa: '971585060627', phone: '+97143499605', phoneLabel: '+971 4 349 9605', map: 'https://maps.app.goo.gl/x', hours: '7 to 12', addr: 'Mirdif', free: 'Free delivery' };
  assert.equal(validateSettings(ok, true), ''); assert.match(validateSettings({ ...ok, wa: '123' }, true), /WhatsApp/); assert.match(validateSettings({ ...ok, map: 'javascript:1' }, true), /https/); assert.match(validateSettings({ ...ok, phone: 'abc' }, true), /phone/);
  assert.equal(validateSettings({ ...ok, wa: 'bad', map: 'x' }, false), ''); assert.match(validateSettings({ ...ok, hours: '' }, false), /hours/); assert.match(validateSettings({ ...ok, free: 'x'.repeat(81) }, false), /80/);
});
t('staff validation', () => {
  const ok = { email: 'a@b.ae', role: 'sales', password: 'abcdefgh', password2: 'abcdefgh' }; assert.equal(validateStaff(ok), '');
  assert.match(validateStaff({ ...ok, email: 'a b' }), /username/); assert.equal(validateStaff({ ...ok, email: 'sam01' }), ''); assert.match(validateStaff({ ...ok, role: 'owner' }), /role/); assert.match(validateStaff({ ...ok, password: 'short', password2: 'short' }), /8 characters/); assert.match(validateStaff({ ...ok, password2: 'x' }), /match/);
});
t('audit filter', () => { const a = [{ email: 'o@x', action: 'status.confirmed', target: 'CC-1', detail: '' }, { email: 'p@x', action: 'export.orders', target: 'orders', detail: '' }]; assert.equal(filterAudit(a, { q: '', action: 'export' }).length, 1); assert.equal(filterAudit(a, { q: 'cc-1', action: '' }).length, 1); });
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), blk = nm => { const i = rules.indexOf(`match /${nm}/{`); return rules.slice(i, rules.indexOf('\n    }', i)); };
const roles = txt => [...new Set([...txt.matchAll(/'(owner|manager|sales|inventory|viewer|staff)'/g)].map(m => m[1]))].sort();
t('rules <-> UI: expenses, staff, settings, audit', () => {
  assert.deepEqual(roles(/allow create, update: if (hasRole\([^)]*\))/.exec(blk('expenses'))[1]), ACTIONS['expenses.edit'].slice().sort()); assert.deepEqual(roles(/allow delete: if ([^;]*);/.exec(blk('expenses'))[1]), ACTIONS['expenses.delete']);
  assert.deepEqual(roles(/allow write: if ([^;]*);/.exec(blk('admins'))[1]), ['owner']); assert.deepEqual(ACTIONS['staff.manage'], ['owner']);
  assert.match(blk('settings'), /hasAny\(\['wa', 'phone', 'phoneLabel', 'map'\]\)/); assert.deepEqual(ACTIONS['settings.contact'], ['owner']);
  assert.match(blk('expenses'), /amount > 0/); assert.match(blk('audit_logs'), /allow update, delete: if false/);
  assert.ok(can('owner', 'staff.manage') && !can('manager', 'staff.manage') && can('manager', 'expenses.edit') && !can('viewer', 'expenses.edit') && !can('manager', 'expenses.delete') && !can('manager', 'settings.contact') && can('viewer', 'export.reports') && !can('sales', 'export.reports'));
  assert.ok(canSee('viewer', 'expenses') && !canSee('sales', 'expenses') && !canSee('manager', 'staff') && canSee('manager', 'audit') && !canSee('viewer', 'audit') && !canSee('inventory', 'reports'));
});
console.log(`\n${n} test groups passed`);
