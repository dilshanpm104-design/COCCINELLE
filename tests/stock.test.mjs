import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as K from '../admin/stock.js';
import { validateCategory, slug } from '../admin/views/categories.js';
import { filterRows } from '../admin/views/inventory.js';
import { can, canSee, ACTIONS, SECTIONS } from '../admin/perms.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
t('stock state: untracked / out / low / ok', () => {
  assert.equal(K.stockState(null), 'untracked'); assert.equal(K.stockState({}), 'untracked'); assert.equal(K.stockState({ stock: '' }), 'untracked');
  assert.equal(K.stockState({ stock: 0 }), 'out'); assert.equal(K.stockState({ stock: -1 }), 'out');
  assert.equal(K.stockState({ stock: 5, lowStockAt: 5 }), 'low'); assert.equal(K.stockState({ stock: 5.1, lowStockAt: 5 }), 'ok'); assert.equal(K.stockState({ stock: 2 }), 'ok'); // no alert level set = never "low"
});
t('movements: add, remove, count; cannot go negative', () => {
  assert.deepEqual(K.planMovement('received', 10, 5), { after: 15, delta: 10 });
  assert.deepEqual(K.planMovement('damaged', 2, 5), { after: 3, delta: -2 });
  assert.deepEqual(K.planMovement('adjustment', 7, 5), { after: 7, delta: 2 }); assert.deepEqual(K.planMovement('adjustment', 0, 5), { after: 0, delta: -5 });
  assert.match(K.planMovement('expired', 6, 5).error, /Only 5 in stock/); assert.match(K.planMovement('received', 0, 5).error, /greater than zero/);
  assert.match(K.planMovement('adjustment', -1, 5).error, /negative/); assert.match(K.planMovement('received', 'x', 5).error, /quantity/); assert.match(K.planMovement('magic', 1, 5).error, /type/);
  assert.deepEqual(K.planMovement('received', 1, undefined), { after: 1, delta: 1 });
});
t('movements: fractional kg stays exact', () => { assert.equal(K.planMovement('sold', 0.1, 0.3).after, 0.2); assert.equal(K.planMovement('received', 0.1, 0.2).after, 0.3); });
t('summary: value only counts products with a cost, and says how many were skipped', () => {
  const rows = K.stockRows([{ id: 'a', price: 10 }, { id: 'b', price: 10 }, { id: 'c', price: 10 }, { id: 'd', price: 10 }], K.mapInventory([{ productId: 'a', stock: 10, costPrice: 4 }, { productId: 'b', stock: 3 }, { productId: 'c', stock: 0, costPrice: 2, lowStockAt: 1 }]));
  const s = K.stockSummary(rows); assert.equal(s.value, 40); assert.equal(s.valueMissingCost, 1); assert.equal(s.out, 1); assert.equal(s.untracked, 1); assert.equal(s.tracked, 3); assert.equal(rows[0].margin, 0.6);
});
t('inventory filter + order: out first, then low', () => {
  const rows = K.stockRows([{ id: 'a', name: 'Apple', price: 1 }, { id: 'b', name: 'Bread', price: 1 }, { id: 'c', name: 'Cola', price: 1 }], K.mapInventory([{ productId: 'a', stock: 9 }, { productId: 'b', stock: 0 }, { productId: 'c', stock: 1, lowStockAt: 3, sku: 'COLA1' }]));
  assert.deepEqual(filterRows(rows, { q: '', state: '' }).map(r => r.product.id), ['b', 'c', 'a']); assert.deepEqual(filterRows(rows, { q: 'cola1', state: '' }).map(r => r.product.id), ['c']); assert.deepEqual(filterRows(rows, { q: '', state: 'low' }).map(r => r.product.id), ['c']);
});
t('pricing validation', () => {
  assert.equal(K.validatePricing({ deliveryFee: '', minOrder: '', discountPct: '', discountMin: '' }), ''); assert.equal(K.validatePricing({ deliveryFee: '5', minOrder: '30', discountPct: '10', discountMin: '100' }), '');
  assert.match(K.validatePricing({ deliveryFee: '-1' }), /Delivery fee/); assert.match(K.validatePricing({ discountPct: '60' }), /0% and 50%/); assert.match(K.validatePricing({ minOrder: 'abc' }), /numbers/); assert.match(K.validatePricing({ deliveryFee: '501' }), /Delivery fee/);
});
t('category validation and slug', () => {
  assert.equal(validateCategory({ n: 'Fresh Fruits', order: 1, imageUrl: 'images/cat/fruits.jpg' }), ''); assert.equal(validateCategory({ n: 'X', order: 1 }).length > 0, true);
  assert.match(validateCategory({ n: 'Fruits', order: 1, imageUrl: 'javascript:alert(1)' }), /https link/); assert.match(validateCategory({ n: 'Fruits', order: 1, imageUrl: 'http://x.com/a.jpg' }), /https link/); assert.match(validateCategory({ n: 'Fruits', order: 1, imageUrl: '../secret.jpg' }), /https link/);
  assert.match(validateCategory({ n: 'Fruits', order: NaN }), /Order/); assert.match(validateCategory({ n: 'Fruits', order: 1, id: 'fruits' }, ['fruits']), /already exists/); assert.equal(slug('Health & Beauty!'), 'health-and-beauty');
});
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), block = nm => { const i = rules.indexOf(`match /${nm}/{`); const e = rules.indexOf('\n    }', i); return rules.slice(i, e); };
const roles = txt => [...new Set([...txt.matchAll(/'(owner|manager|sales|inventory|viewer|staff)'/g)].map(m => m[1]))].sort();
t('rules <-> UI: categories, inventory, offers', () => {
  assert.deepEqual(roles(/allow create, update, delete: if ([^;]*);/.exec(block('categories'))[1]), ACTIONS['categories.edit'].slice().sort());
  assert.deepEqual(roles(/allow create, update: if (hasRole\([^)]*\))/.exec(block('inventory'))[1]), ACTIONS['inventory.edit'].slice().sort());
  assert.deepEqual(roles(/allow create: if (hasRole\([^)]*\))/.exec(block('stock_movements'))[1]), ACTIONS['inventory.edit'].slice().sort());
  const w = /allow write: if ([^;]*);/.exec(block('settings'))[1]; assert.deepEqual(roles(w), ['manager', 'owner']); assert.match(w, /id == 'public'/); assert.match(w, /validPublicSettings/); assert.deepEqual(ACTIONS['offers.edit'].slice().sort(), ['manager', 'owner']);
  assert.match(rules, /deliveryFee', 500/); assert.match(rules, /discountPct', 50/);
  assert.ok(!can('sales', 'inventory.edit') && !can('viewer', 'inventory.edit') && !can('inventory', 'offers.edit') && can('viewer', 'export.inventory'));
  assert.ok(!canSee('sales', 'inventory') && !canSee('inventory', 'offers') && !SECTIONS.some(s => ['categories', 'inventory', 'offers'].includes(s.id) && s.soon));
});
console.log(`\n${n} test groups passed`);
