// Expenses and profit. Money is handled in integer fils. Profit uses only what is actually recorded:
// orders staff have not cancelled, purchase costs saved in Inventory, and expenses entered by staff.
import * as S from './stats.js';
export const EXP_CATS = ['Rent', 'Electricity & water', 'Salaries', 'Delivery', 'Packaging', 'Supplies', 'Marketing', 'Maintenance', 'Other'];
export const expTime = e => S.parseDay(e && e.date);
export const expInRange = (e, r) => { const t = expTime(e); return t >= r.start && t < r.end; };

export function validateExpense(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '') || !Number.isFinite(S.parseDay(v.date))) return 'Choose the expense date.';
  if (S.parseDay(v.date) > Date.now() + 2 * 86400e3) return 'The date is in the future.';
  if (!EXP_CATS.includes(v.category)) return 'Choose a category.';
  const a = Number(v.amount); if (!Number.isFinite(a) || a <= 0) return 'Amount must be greater than zero.'; if (a > 1e7) return 'That amount is too large.';
  if (Math.abs(a * 100 - Math.round(a * 100)) > 1e-6) return 'Use at most two decimals.';
  if ((v.note || '').length > 200 || (v.vendor || '').length > 80) return 'Note or vendor is too long.';
  return '';
}
export function expenseTotals(expenses, r) {
  const list = expenses.filter(e => expInRange(e, r)); let f = 0; const m = new Map();
  for (const e of list) { const x = S.fils(e.amount); f += x; m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + x); }
  return { count: list.length, total: S.aed(f), byCat: [...m].map(([cat, x]) => ({ cat, amount: S.aed(x) })).sort((a, b) => b.amount - a.amount) };
}
const isRefund = p => ['refunded', 'partially_refunded'].includes(p.status);
export function profit(orders, payments, expenses, invMap, r) {
  let revF = 0, delF = 0, discF = 0, itemsF = 0, costedF = 0, cogsF = 0, n = 0, unc = new Map();
  for (const o of orders) {
    if (!S.inRange(o, r) || !S.COUNTED.includes(o.status)) continue;
    n++; revF += S.fils(o.total); delF += S.fils(o.deliveryCharge); discF += S.fils(o.discount);
    const lines = (o.items || []), subF = lines.reduce((s, i) => s + S.fils(i.lineTotal), 0), k = subF > 0 ? Math.max(0, subF - S.fils(o.discount)) / subF : 1;
    for (const i of lines) {
      const lf = Math.round(S.fils(i.lineTotal) * k), inv = invMap[String(i.id)], c = inv && Number(inv.costPrice) > 0 ? S.fils(inv.costPrice) : 0;
      itemsF += lf;
      if (c) { costedF += lf; cogsF += Math.round(c * (Number(i.qty) || 0)); } else unc.set(String(i.id), i.name);
    }
  }
  const refundF = payments.filter(p => isRefund(p) && p.paidAt >= r.start && p.paidAt < r.end).reduce((s, p) => s + S.fils(p.amount), 0);
  const ex = expenseTotals(expenses, r), gpF = costedF - cogsF, netF = gpF + delF - S.fils(ex.total) - refundF;
  return {
    orders: n, grossSales: S.aed(revF + discF - delF), discounts: S.aed(discF), deliveryFees: S.aed(delF), revenue: S.aed(revF), refunds: S.aed(refundF), netSales: S.aed(revF - refundF),
    goodsCost: S.aed(cogsF), grossProfit: S.aed(gpF), expenses: ex.total, expenseByCat: ex.byCat, netProfit: S.aed(netF),
    costCoverage: itemsF ? costedF / itemsF : null, complete: n > 0 && itemsF > 0 && costedF === itemsF, uncosted: [...unc.values()]
  };
}
