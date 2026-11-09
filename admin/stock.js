// Stock logic (pure, tested). Quantities are kept to 3 decimals (kg items can be fractional).
export const MOVES = { received: 'Stock received', returned: 'Customer return', damaged: 'Damaged', expired: 'Expired', sold: 'Sold (manual entry)', adjustment: 'Stock count (set exact quantity)' };
const ADD = ['received', 'returned'], SUB = ['damaged', 'expired', 'sold'];
export const r3 = n => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

// untracked = no stock number saved for this product yet. Low stock only applies when a level was set.
export function stockState(inv) {
  if (!inv || inv.stock == null || inv.stock === '' || !Number.isFinite(Number(inv.stock))) return 'untracked';
  const s = Number(inv.stock), low = Number(inv.lowStockAt) || 0;
  if (s <= 0) return 'out'; if (low > 0 && s <= low) return 'low'; return 'ok';
}
// Returns { error, after, delta } for a stock movement.
export function planMovement(type, qty, current) {
  const q = Number(qty), cur = current == null ? 0 : Number(current);
  if (!(type in MOVES)) return { error: 'Choose a movement type.' };
  if (!Number.isFinite(q) || qty === '' || qty === null) return { error: 'Enter a quantity.' };
  if (type === 'adjustment') { if (q < 0) return { error: 'The counted quantity cannot be negative.' }; if (q > 1e6) return { error: 'That quantity is too large.' }; return { after: r3(q), delta: r3(q - cur) }; }
  if (q <= 0) return { error: 'Quantity must be greater than zero.' }; if (q > 1e6) return { error: 'That quantity is too large.' };
  if (SUB.includes(type)) { if (q > cur + 1e-9) return { error: `Only ${r3(cur)} in stock. You cannot remove ${r3(q)}.` }; return { after: r3(cur - q), delta: -r3(q) }; }
  return { after: r3(cur + q), delta: r3(q) };
}
export const mapInventory = list => Object.fromEntries(list.map(i => [i.productId || i.id, i]));
// Rows for the inventory table: every catalogue product with its stock record (if any).
export function stockRows(products, inv) {
  return products.map(p => { const i = inv[p.id] || null; return { product: p, inv: i, state: stockState(i), margin: i && Number(i.costPrice) > 0 && Number(p.price) > 0 ? (p.price - i.costPrice) / p.price : null }; });
}
export function stockSummary(rows) {
  const c = { tracked: 0, ok: 0, low: 0, out: 0, untracked: 0, value: 0, valueMissingCost: 0 };
  for (const r of rows) { c[r.state]++; if (r.state !== 'untracked') { c.tracked++; if (Number(r.inv.costPrice) > 0) c.value += r.inv.stock * r.inv.costPrice; else if (r.inv.stock > 0) c.valueMissingCost++; } }
  c.value = Math.round(c.value * 100) / 100; return c;
}
// Public pricing settings sanity check (used by the Offers form; the rules re-check on the server).
export function validatePricing(v) {
  const n = k => (v[k] === '' || v[k] == null ? 0 : Number(v[k]));
  const fee = n('deliveryFee'), min = n('minOrder'), pct = n('discountPct'), dmin = n('discountMin');
  if (![fee, min, pct, dmin].every(Number.isFinite)) return 'Use numbers only.';
  if (fee < 0 || fee > 500) return 'Delivery fee must be between AED 0 and 500.';
  if (min < 0 || min > 20000) return 'Minimum order must be between AED 0 and 20,000.';
  if (pct < 0 || pct > 50) return 'Discount must be between 0% and 50%.';
  if (dmin < 0 || dmin > 20000) return 'Discount minimum spend must be between AED 0 and 20,000.';
  return '';
}
