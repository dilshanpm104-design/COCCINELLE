import * as S from '../stats.js';
import { esc, aed, num, dt, payBadge, empty, openModal, closeModal, toast, download, stamp, icon, debounce, $ } from '../ui.js';

const F = { q: '', status: '', method: '' };
const opts = (obj, sel, all) => (all ? `<option value="">${all}</option>` : '') + Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

/** Validation for a payment entry. Pure and exported so it can be unit-tested. */
export function validatePayment({ order, amount, method, status, reference }) {
  const total = S.fils(order.total), amt = S.fils(amount);
  if (!order) return 'Choose an order.';
  if (!Number.isFinite(Number(amount)) || amt <= 0) return 'Enter an amount greater than zero.';
  if (amt > total) return `The amount cannot be more than the order total (${aed(order.total)}).`;
  if (!S.PAY_METHOD[method]) return 'Choose a payment method.';
  if (!S.PAY_STATUS[status]) return 'Choose a payment status.';
  if (status === 'paid') {
    if (order.status === 'cancelled') return 'A cancelled order cannot be marked as paid.';
    if (order.paymentStatus === 'paid') return 'This order is already marked as paid.';
    if (amt !== total) return `A Paid payment must equal the full order total (${aed(order.total)}). Partial payments are not tracked yet: use Pending until the full amount is received.`;
    if (['card', 'bank_transfer', 'online'].includes(method) && String(reference || '').trim().length < 3) return 'Enter the transaction reference so this payment can be verified later.';
  }
  if (status === 'refunded' && amt !== total) return 'A full refund must equal the order total. Use Partially Refunded for a smaller amount.';
  if (status === 'partially_refunded' && amt >= total) return 'A partial refund must be less than the order total.';
  if ((status === 'refunded' || status === 'partially_refunded') && order.paymentStatus !== 'paid' && order.paymentStatus !== 'partially_refunded') return 'Only a paid order can be refunded.';
  return '';
}

export function openPaymentForm(ctx, order = null, after = () => { }) {
  if (!ctx.can('payments.record')) return toast('Your role cannot record payments.', 'err');
  const list = ctx.orders.filter(o => o.status !== 'cancelled').sort((a, b) => S.tms(b) - S.tms(a)).slice(0, 300);
  const nowLocal = new Date(ctx.now() + S.TZ_OFFSET_MS).toISOString().slice(0, 16);
  const m = openModal(`<h2>Record payment</h2><p class="muted">Only record money you have actually received or checked. An order becomes <b>Paid</b> only when you save a verified Paid payment here.</p>
<form id="pf" class="fgrid" novalidate>
<label class="full">Order<select id="pfo" ${order ? 'disabled' : ''}>${order ? `<option>${esc(order.orderId)} · ${esc((order.customer || {}).name)} · ${aed(order.total)}</option>` : '<option value="">Select an order…</option>' + list.map(o => `<option value="${esc(o.orderId || o.id)}">${esc(o.orderId || o.id)} · ${esc((o.customer || {}).name)} · ${aed(o.total)} · ${esc(S.PAY_STATUS[o.paymentStatus || 'pending'])}</option>`).join('')}</select></label>
<label>Amount (AED)<input id="pfa" type="number" min="0" step="0.01" inputmode="decimal" value="${order ? Number(order.total).toFixed(2) : ''}"></label>
<label>Payment method<select id="pfm">${opts(S.PAY_METHOD, 'cash')}</select></label>
<label>Payment status<select id="pfs">${opts(S.PAY_STATUS, 'paid')}</select></label>
<label>Payment date and time (Dubai)<input id="pfd" type="datetime-local" value="${nowLocal}"></label>
<label class="full">Transaction reference <small>(required for card, bank transfer and online payments)</small><input id="pfr" maxlength="80" autocomplete="off"></label>
<p class="er full" id="pfe" role="alert"></p>
<div class="row full"><button class="btn" id="pfsave" type="submit">Save payment</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>`, { label: 'Record payment' });
  const sel = $('#pfo', m), amt = $('#pfa', m);
  const cur = () => order || ctx.orders.find(o => (o.orderId || o.id) === sel.value);
  if (!order) sel.addEventListener('change', () => { const o = cur(); amt.value = o ? Number(o.total).toFixed(2) : ''; });
  $('#pf', m).addEventListener('submit', async e => {
    e.preventDefault(); const o = cur(), err = $('#pfe', m);
    const v = { order: o, amount: $('#pfa', m).value, method: $('#pfm', m).value, status: $('#pfs', m).value, reference: $('#pfr', m).value };
    const bad = o ? validatePayment(v) : 'Choose an order.'; if (bad) { err.textContent = bad; return; }
    const at = Date.parse($('#pfd', m).value + ':00+04:00'); if (!Number.isFinite(at)) { err.textContent = 'Enter a valid payment date.'; return; }
    const b = $('#pfsave', m); b.disabled = true; b.textContent = 'Saving…';
    try { const id = await ctx.api.recordPayment({ order: o, amount: Number(v.amount), method: v.method, status: v.status, reference: v.reference.trim(), paidAt: at }); closeModal(); toast(`Payment ${id} saved.`); after(); }
    catch (x) { err.textContent = ctx.api.errorText(x); b.disabled = false; b.textContent = 'Save payment'; }
  });
}

export default {
  id: 'payments', title: 'Payments',
  render(root, ctx) {
    const pays = ctx.payments.slice().sort((a, b) => S.tms(b) - S.tms(a)), orders = ctx.orders;
    const paidF = pays.filter(p => p.status === 'paid').reduce((s, p) => s + S.fils(p.amount), 0);
    const refF = pays.filter(p => p.status === 'refunded' || p.status === 'partially_refunded').reduce((s, p) => s + S.fils(p.amount), 0);
    const unpaid = orders.filter(o => S.COUNTED.includes(o.status) && (o.paymentStatus || 'pending') === 'pending');
    const unpaidF = unpaid.reduce((s, o) => s + S.fils(o.total), 0);
    const q = F.q.trim().toLowerCase();
    const rows = pays.filter(p => (!F.status || p.status === F.status) && (!F.method || p.method === F.method) && (!q || [p.paymentId, p.orderId, (p.customer || {}).name, (p.customer || {}).phone, p.reference].join(' ').toLowerCase().includes(q)));
    root.innerHTML = `${ctx.paymentsError ? `<div class="note warn"><b>Payments could not be loaded.</b> ${esc(ctx.paymentsError)}</div>` : ''}
<section class="kgrid k3"><div class="kpi"><span class="kl">Recorded as paid</span><b class="kv">${aed(paidF / 100)}</b><span class="ks">Verified payments saved by staff</span></div>
<div class="kpi ${unpaid.length ? 'warn' : ''}"><span class="kl">Confirmed, not yet paid</span><b class="kv">${aed(unpaidF / 100)}</b><span class="ks">${num(unpaid.length)} confirmed order${unpaid.length == 1 ? '' : 's'} with payment pending</span></div>
<div class="kpi"><span class="kl">Refunded</span><b class="kv">${aed(refF / 100)}</b><span class="ks">Full and partial refunds</span></div></section>
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="pq" type="search" placeholder="Search payment, order, customer, reference" value="${esc(F.q)}" aria-label="Search payments"></div>
<select id="ps" aria-label="Filter by status">${opts(S.PAY_STATUS, F.status, 'All statuses')}</select><select id="pm" aria-label="Filter by method">${opts(S.PAY_METHOD, F.method, 'All methods')}</select>
<span class="sp"></span>${ctx.can('export.payments') ? `<button class="btn ghost" id="pcsv">${icon('download', 16)} CSV</button>` : ''}${ctx.can('payments.record') ? `<button class="btn" id="pnew">+ Record payment</button>` : ''}</div>
${rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Payment ID</th><th>Order</th><th>Customer</th><th class="r">Amount</th><th>Method</th><th class="hs">Reference</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows.map(p => `<tr data-go="#/orders/${esc(p.orderId)}" tabindex="0"><td><b>${esc(p.paymentId || p.id)}</b></td><td>${esc(p.orderId)}</td><td>${esc((p.customer || {}).name)}</td><td class="r">${aed(p.amount)}</td><td>${esc(S.PAY_METHOD[p.method] || p.method)}</td><td class="hs">${esc(p.reference || '-')}</td><td>${dt(typeof p.paidAt === 'number' ? p.paidAt : S.tms(p))}</td><td>${payBadge(p.status)}</td></tr>`).join('')}</tbody></table></div>` : empty(pays.length ? 'No payments match your filters' : 'No payments recorded yet', pays.length ? 'Clear the search or filters.' : 'When you receive payment for an order, open the order and choose Record payment. Orders are never shown as paid automatically.')}`;
    root.onclick = e => { if (e.target.closest('#pnew')) openPaymentForm(ctx, null, () => ctx.rerender()); if (e.target.closest('#pcsv')) csv(rows); const r = e.target.closest('[data-go]'); if (r) location.hash = r.dataset.go; };
    root.onkeydown = e => { const r = e.target.closest && e.target.closest('[data-go]'); if (r && e.key === 'Enter') location.hash = r.dataset.go; };
    $('#pq', root).addEventListener('input', debounce(e => { F.q = e.target.value; ctx.rerender('pq'); }));
    $('#ps', root).addEventListener('change', e => { F.status = e.target.value; ctx.rerender(); }); $('#pm', root).addEventListener('change', e => { F.method = e.target.value; ctx.rerender(); });
    function csv(list) {
      download(`coccinelle-payments-${stamp()}.csv`, S.toCSV(list, [{ label: 'Payment ID', get: p => p.paymentId || p.id }, { label: 'Order ID', get: p => p.orderId }, { label: 'Customer', get: p => (p.customer || {}).name }, { label: 'WhatsApp', get: p => (p.customer || {}).phone }, { label: 'Amount AED', get: p => Number(p.amount).toFixed(2) }, { label: 'Method', get: p => S.PAY_METHOD[p.method] || p.method }, { label: 'Transaction reference', get: p => p.reference }, { label: 'Payment date (Dubai)', get: p => dt(typeof p.paidAt === 'number' ? p.paidAt : S.tms(p)) }, { label: 'Status', get: p => S.PAY_STATUS[p.status] || p.status }]));
      ctx.api.audit('export', 'payments', `${list.length} rows`);
    }
  }
};
