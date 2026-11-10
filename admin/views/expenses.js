// Expenses & Profit. Profit is an estimate that uses only recorded data and says clearly when it is incomplete.
import * as S from '../stats.js';
import * as K from '../stock.js';
import * as F from '../finance.js';
import { barChart } from '../charts.js';
import { esc, aed, num, empty, openModal, closeModal, toast, download, stamp, icon, debounce, $ } from '../ui.js';

const Q = { q: '', cat: '' };
export const filterExpenses = (list, f, r) => { const q = f.q.trim().toLowerCase(); return list.filter(e => F.expInRange(e, r) && (!f.cat || e.category === f.cat) && (!q || [e.vendor, e.note, e.category].join(' ').toLowerCase().includes(q))).sort((a, b) => F.expTime(b) - F.expTime(a)); };

function editor(ctx, e) {
  const m = openModal(`<h2>${e ? 'Edit expense' : 'Add expense'}</h2><form id="xf" class="fgrid" novalidate>
<label>Date *<input id="xd" type="date" required value="${esc(e ? e.date : S.dayKey(ctx.now()))}"></label>
<label>Category *<select id="xc">${F.EXP_CATS.map(c => `<option${e && e.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
<label>Amount (AED) *<input id="xa" type="number" step="0.01" min="0.01" inputmode="decimal" value="${e ? esc(e.amount) : ''}"></label>
<label>Vendor<input id="xv" maxlength="80" value="${esc(e && e.vendor)}"></label>
<label class="full">Note<input id="xn" maxlength="200" value="${esc(e && e.note)}"></label>
<p class="er full" id="xe" role="alert"></p><div class="row full"><button class="btn" id="xs" type="submit">Save expense</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>`, { label: 'Expense' });
  $('#xf', m).addEventListener('submit', async ev => {
    ev.preventDefault(); const v = { date: $('#xd', m).value, category: $('#xc', m).value, amount: $('#xa', m).value, vendor: $('#xv', m).value.trim(), note: $('#xn', m).value.trim() }, err = F.validateExpense(v);
    if (err) return $('#xe', m).textContent = err; const b = $('#xs', m); b.disabled = true;
    try { await ctx.api.saveExpense(v, e && e.id); closeModal(); toast('Expense saved.'); ctx.rerender(); } catch (x) { $('#xe', m).textContent = ctx.api.errorText(x); b.disabled = false; }
  });
}
const row = (l, v, o = {}) => `<tr class="${o.b ? 'tot' : ''}"><td>${l}${o.s ? `<small>${o.s}</small>` : ''}</td><td class="r">${v}</td></tr>`;

export default {
  id: 'expenses', title: 'Expenses & Profit', usesRange: true,
  render(root, ctx) {
    const r = ctx.range, edit = ctx.can('expenses.edit'), del = ctx.can('expenses.delete'), inv = K.mapInventory(ctx.inventory || []);
    const p = F.profit(ctx.orders, ctx.payments, ctx.expenses, inv, r), rows = filterExpenses(ctx.expenses, Q, r), tot = F.expenseTotals(ctx.expenses, r), kpi = (l, v, s = '') => `<div class="kpi"><span class="kl">${l}</span><b class="kv">${v}</b><span class="ks">${s}</span></div>`;
    const cov = p.costCoverage == null ? 'No sales in this period' : p.complete ? 'Purchase cost known for every product sold' : `Purchase cost known for ${(p.costCoverage * 100).toFixed(0)}% of product sales`;
    root.innerHTML = `${ctx.expensesError ? `<div class="note warn"><b>Expenses could not be loaded.</b> ${esc(ctx.expensesError)} If you have not published the new Firestore rules yet, see docs/FIRESTORE_SETUP.md.</div>` : ''}
<section class="kgrid k5">${kpi('Net sales', aed(p.netSales), `${num(p.orders)} counted orders`)}${kpi('Expenses', aed(p.expenses), `${num(tot.count)} entries`)}${kpi('Gross profit', p.costCoverage == null ? '<span class="na">-</span>' : aed(p.grossProfit), cov)}${kpi('Estimated net profit', p.orders || tot.count ? aed(p.netProfit) : '<span class="na">-</span>', p.complete ? 'Complete' : 'Estimate, see note below')}${kpi('Refunds', aed(p.refunds), 'Recorded by staff')}</section>
${p.orders && !p.complete ? `<div class="note warn"><b>This profit figure is an estimate.</b> ${p.costCoverage ? `Purchase cost is saved for ${(p.costCoverage * 100).toFixed(0)}% of product sales.` : 'No product has a purchase cost saved yet.'} Products without a cost are left out of cost of goods, so gross profit is understated. Add purchase costs in Inventory & Stock.${p.uncosted.length ? ` Missing: ${esc(p.uncosted.slice(0, 6).join(', '))}${p.uncosted.length > 6 ? ` and ${p.uncosted.length - 6} more` : ''}.` : ''}</div>` : ''}
<div class="two"><article class="card"><h3>Profit summary <small>${esc(r.label)}</small></h3><div class="tw"><table class="tbl"><tbody>${row('Sales (confirmed and later orders)', aed(p.revenue))}${row('Refunds recorded', '-' + aed(p.refunds))}${row('Net sales', aed(p.netSales), { b: 1 })}${row('Cost of goods', '-' + aed(p.goodsCost), { s: 'Products with a purchase cost only' })}${row('Gross profit', aed(p.grossProfit), { b: 1 })}${row('Delivery fees collected', aed(p.deliveryFees))}${row('Expenses', '-' + aed(p.expenses))}${row('Estimated net profit', aed(p.netProfit), { b: 1 })}</tbody></table></div><p class="fine">Unconfirmed and cancelled orders are not counted. VAT is not calculated.</p></article>
<article class="card"><h3>Expenses by category <small>${esc(r.label)}</small></h3>${tot.byCat.length ? barChart({ data: tot.byCat.map(c => ({ label: c.cat.split(' ')[0], title: c.cat, value: c.amount })), fmt: aed, label: 'Expenses by category in AED' }) : empty('No expenses in this period', 'Add an expense to see the breakdown.')}</article></div>
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="xq" type="search" placeholder="Search vendor or note" value="${esc(Q.q)}" aria-label="Search expenses"></div><select id="xcat" aria-label="Filter by category"><option value="">All categories</option>${F.EXP_CATS.map(c => `<option${Q.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="sp"></span>${edit ? '<button class="btn" id="xadd">+ Add expense</button>' : ''}<button class="btn ghost" id="xcsv">${icon('download', 16)} CSV</button></div>
${rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Date</th><th>Category</th><th class="hs">Vendor</th><th class="hs">Note</th><th class="r">Amount</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.category)}</td><td class="hs">${esc(e.vendor)}</td><td class="hs">${esc(e.note)}</td><td class="r">${aed(e.amount)}</td>${edit ? `<td class="r"><button class="btn ghost sm" data-ed="${esc(e.id)}">Edit</button>${del ? ` <button class="btn ghost sm" data-del="${esc(e.id)}">Delete</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty(ctx.expenses.length ? 'No expenses match' : 'No expenses recorded yet', ctx.expenses.length ? 'Change the period, search or category.' : 'Record rent, salaries, utilities and other costs here. Nothing is estimated for you.')}`;
    root.onclick = async ev => {
      if (ev.target.closest('#xadd')) return editor(ctx, null);
      const ed = ev.target.closest('[data-ed]'); if (ed) return editor(ctx, ctx.expenses.find(x => x.id === ed.dataset.ed));
      const dl = ev.target.closest('[data-del]'); if (dl) { const x = ctx.expenses.find(y => y.id === dl.dataset.del); if (x && confirm(`Delete this ${x.category} expense of ${aed(x.amount)}?`)) { try { await ctx.api.deleteExpense(x); toast('Expense deleted.'); ctx.rerender(); } catch (e) { toast(ctx.api.errorText(e), 'err'); } } return; }
      if (ev.target.closest('#xcsv')) { download(`coccinelle-expenses-${stamp()}.csv`, S.toCSV(rows, [{ label: 'Date', get: e => e.date }, { label: 'Category', get: e => e.category }, { label: 'Vendor', get: e => e.vendor }, { label: 'Note', get: e => e.note }, { label: 'Amount AED', get: e => Number(e.amount).toFixed(2) }])); ctx.api.audit('export', 'expenses', `${rows.length} rows`); }
    };
    $('#xq', root).addEventListener('input', debounce(e => { Q.q = e.target.value; ctx.rerender('xq'); })); $('#xcat', root).addEventListener('change', e => { Q.cat = e.target.value; ctx.rerender(); });
  }
};
