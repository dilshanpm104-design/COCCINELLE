import * as S from '../stats.js';
import { esc, aed, num, dt, statusBadge, payBadge, empty, openModal, closeModal, toast, download, stamp, icon, debounce, $, $$ } from '../ui.js';
import { openPaymentForm } from './payments.js';

const F = { q: '', status: '', pay: '', ful: '', scope: 'all', limit: 50 };
const GROUPS = { pending: S.PENDING, progress: S.IN_PROGRESS, done: S.COMPLETED };
const id = o => o.orderId || o.id;
const phoneDigits = s => String(s || '').replace(/\D/g, '');

/** The next sensible step in the workflow, or '' when the order is finished. Pickup orders skip the delivery steps. */
export function nextStatus(o) {
  const s = o.status, pick = o.fulfilment === 'pickup';
  if (s === 'new' || s === 'awaiting_confirmation') return 'confirmed';
  if (s === 'confirmed') return 'preparing';
  if (s === 'preparing') return pick ? 'collected' : 'ready_for_delivery';
  if (s === 'ready_for_delivery') return 'out_for_delivery';
  if (s === 'out_for_delivery') return 'delivered';
  return '';
}
export function filterOrders(orders, f, range) {
  const q = f.q.trim().toLowerCase(), qd = S.phoneQuery(f.q);
  return orders.filter(o => {
    if (f.scope === 'range' && !S.inRange(o, range)) return false;
    if (f.status) { if (GROUPS[f.status.replace('group:', '')] && f.status.startsWith('group:')) { if (!GROUPS[f.status.slice(6)].includes(o.status)) return false; } else if (o.status !== f.status) return false; }
    if (f.pay && (o.paymentStatus || 'pending') !== f.pay) return false;
    if (f.ful && o.fulfilment !== f.ful) return false;
    if (!q) return true;
    const c = o.customer || {};
    return id(o).toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q) || String(c.address || '').toLowerCase().includes(q) || (qd && phoneDigits(c.phone).includes(qd));
  }).sort((a, b) => S.tms(b) - S.tms(a));
}
const itemsText = o => (o.items || []).map(i => `${i.name} x ${i.qty} ${i.unit || ''}`).join('; ');

function printOrder(o) {
  const c = o.customer || {};
  $('#print').innerHTML = `<h1>COCCINELLE Supermarket</h1><p>The Commons, Mirdif, Dubai</p><h2>Order ${esc(id(o))}</h2><p>${dt(S.tms(o))} · ${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · ${esc(S.STATUS[o.status])}</p>
<p><b>${esc(c.name)}</b><br>WhatsApp: ${esc(c.phone)}${c.address ? `<br>${esc(c.address)}` : ''}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${(o.items || []).map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.qty)} ${esc(i.unit || '')}</td><td>${aed(i.unitPrice)}</td><td>${aed(i.lineTotal)}</td></tr>`).join('')}</tbody></table>
<p>Subtotal: ${aed(o.subtotal)}${o.discount ? `<br>Discount: -${aed(o.discount)}` : ''}${o.deliveryCharge ? `<br>Delivery: ${aed(o.deliveryCharge)}` : ''}<br><b>Total: ${aed(o.total)}</b></p>
<p>Payment: ${esc(S.PAY_STATUS[o.paymentStatus || 'pending'])}${o.paymentMethod ? ' (' + esc(S.PAY_METHOD[o.paymentMethod] || o.paymentMethod) + ')' : ''}</p>${o.notes ? `<p>Notes: ${esc(o.notes)}</p>` : ''}`;
  document.body.classList.add('printing'); window.print();
  setTimeout(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; }, 500);
}

function openDetail(ctx, orderId) {
  const o = ctx.orders.find(x => id(x) === orderId);
  if (!o) { toast('That order was not found.', 'err'); return; }
  const c = o.customer || {}, warn = S.orderWarnings(o, ctx.products), nx = nextStatus(o), canUpd = ctx.can('orders.updateStatus');
  const pays = ctx.payments.filter(p => p.orderId === id(o)), custId = S.customerId(c.phone || ''), others = ctx.orders.filter(x => (x.customer || {}).phone === c.phone && id(x) !== id(o)).length;
  const hist = (o.statusHistory || []).slice().sort((a, b) => a.at - b.at);
  const real = warn.filter(w => !/not been verified/.test(w));
  const m = openModal(`<div class="dh"><div><h2>${esc(id(o))}</h2><p class="muted">${dt(S.tms(o))} · ${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · ${esc(o.source || 'website')}</p></div><div class="dbadges">${statusBadge(o.status)}${payBadge(o.paymentStatus)}</div></div>
${real.length ? `<div class="note warn"><b>Check this order</b><ul>${real.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
${!o.totalsVerified ? `<div class="note">Totals were calculated in the customer's browser. ${ctx.can('orders.verifyTotals') ? `<button class="lk" id="ver">Mark totals as checked</button>` : ''}</div>` : ''}
<div class="dgrid"><section><h4>Customer</h4><p><b>${esc(c.name)}</b></p><p>WhatsApp <a href="https://wa.me/${esc(phoneDigits(c.phone))}" target="_blank" rel="noopener">${esc(c.phone)}</a></p>${c.address ? `<p>${esc(c.address)}</p>` : '<p class="muted">Pickup: no address</p>'}${o.notes ? `<p class="qt">“${esc(o.notes)}”</p>` : ''}<p class="fine">${others ? `${others} other order${others == 1 ? '' : 's'} · ` : 'First order · '}${ctx.can('customers.editNotes') ? `<a href="#/customers/${esc(custId)}" class="lnk">View customer</a>` : ''}</p></section>
<section><h4>Totals</h4><div class="sm"><div><span>Subtotal</span><span>${aed(o.subtotal)}</span></div>${+o.discount ? `<div><span>Discount</span><span>-${aed(o.discount)}</span></div>` : ''}${+o.deliveryCharge ? `<div><span>Delivery</span><span>${aed(o.deliveryCharge)}</span></div>` : ''}<div class="tt"><span>Total</span><span>${aed(o.total)}</span></div></div><p class="fine">Payment: ${esc(S.PAY_STATUS[o.paymentStatus || 'pending'])}${o.paymentMethod ? ' · ' + esc(S.PAY_METHOD[o.paymentMethod] || o.paymentMethod) : ''}</p></section></div>
<div class="tw"><table class="tbl"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead><tbody>${(o.items || []).map(i => `<tr><td>${esc(i.name)}</td><td class="r">${esc(i.qty)} ${esc(i.unit || '')}</td><td class="r">${aed(i.unitPrice)}</td><td class="r">${aed(i.lineTotal)}</td></tr>`).join('')}</tbody></table></div>
<h4>Update status</h4>${canUpd ? `<div class="row"><select id="nst" aria-label="Order status">${Object.entries(S.STATUS).map(([k, v]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select><button class="btn" id="ust">Update</button>${nx ? `<button class="btn ghost" id="nxt">Next: ${esc(S.STATUS[nx])}</button>` : ''}</div><p class="er" id="der" role="alert"></p>` : '<p class="muted">Your role can view this order but not change it.</p>'}
<h4>History</h4><ul class="hist"><li><b>Order placed</b><span>${dt(S.tms(o))}</span></li>${hist.map(h => `<li><b>${esc(S.STATUS[h.status] || h.status)}</b><span>${dt(h.at)} · ${esc(h.byName || 'staff')}</span></li>`).join('')}</ul>
<h4>Payments</h4>${pays.length ? `<ul class="hist">${pays.map(p => `<li><b>${esc(p.paymentId || p.id)} · ${aed(p.amount)}</b><span>${esc(S.PAY_METHOD[p.method] || p.method)} · ${esc(S.PAY_STATUS[p.status] || p.status)}${p.reference ? ' · ref ' + esc(p.reference) : ''}</span></li>`).join('')}</ul>` : '<p class="muted">No payment recorded for this order.</p>'}
<div class="row dfoot">${ctx.can('payments.record') ? '<button class="btn ghost" id="pay">Record payment</button>' : ''}<button class="btn ghost" id="prt">${icon('print', 16)} Print</button></div>`, { wide: true, label: 'Order ' + id(o) });

  const err = t => { const e = $('#der', m); if (e) e.textContent = t; };
  const change = async st => {
    if (st === o.status) return err('The order already has that status.');
    if (st === 'cancelled' && !confirm('Cancel this order? Cancelled orders are not counted as sales.')) return;
    try { await ctx.api.updateOrderStatus(o, st); toast(`Order ${id(o)}: ${S.STATUS[st]}`); openDetail(ctx, orderId); ctx.rerender(); } catch (e) { err(ctx.api.errorText(e)); }
  };
  const on = (sel, fn) => { const b = $(sel, m); if (b) b.addEventListener('click', fn); };
  on('#ust', () => change($('#nst', m).value)); on('#nxt', () => change(nx));
  on('#ver', async () => { try { await ctx.api.verifyTotals(o); toast('Totals marked as checked.'); openDetail(ctx, orderId); ctx.rerender(); } catch (e) { toast(ctx.api.errorText(e), 'err'); } });
  on('#pay', () => openPaymentForm(ctx, o, () => { openDetail(ctx, orderId); ctx.rerender(); }));
  on('#prt', () => printOrder(o));
}

export default {
  id: 'orders', title: 'Orders',
  render(root, ctx) {
    if (ctx.route.query.s && !root.dataset.q) { F.status = 'group:' + ctx.route.query.s; root.dataset.q = '1'; }
    const rows = filterOrders(ctx.orders, F, ctx.range), shown = rows.slice(0, F.limit);
    root.innerHTML = `${ctx.ordersError ? `<div class="note warn"><b>Orders could not be loaded.</b> ${esc(ctx.ordersError)} If you have not published the new Firestore rules yet, see docs/FIRESTORE_SETUP.md.</div>` : ''}
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="oq" type="search" placeholder="Search order ID, name, WhatsApp number, address" value="${esc(F.q)}" aria-label="Search orders"></div>
<select id="os" aria-label="Filter by status"><option value="">All statuses</option><option value="group:pending"${F.status === 'group:pending' ? ' selected' : ''}>Needs confirmation</option><option value="group:progress"${F.status === 'group:progress' ? ' selected' : ''}>In progress</option><option value="group:done"${F.status === 'group:done' ? ' selected' : ''}>Completed</option>${Object.entries(S.STATUS).map(([k, v]) => `<option value="${k}"${F.status === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
<select id="op" aria-label="Filter by payment">${'<option value="">All payments</option>' + Object.entries(S.PAY_STATUS).map(([k, v]) => `<option value="${k}"${F.pay === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>
<select id="of" aria-label="Filter by delivery or pickup"><option value="">Delivery and pickup</option><option value="delivery"${F.ful === 'delivery' ? ' selected' : ''}>Delivery</option><option value="pickup"${F.ful === 'pickup' ? ' selected' : ''}>Pickup</option></select>
<select id="osc" aria-label="Period"><option value="all"${F.scope === 'all' ? ' selected' : ''}>All time</option><option value="range"${F.scope === 'range' ? ' selected' : ''}>${esc(ctx.range.label)}</option></select>
<span class="sp"></span>${ctx.can('export.orders') ? `<button class="btn ghost" id="ocsv">${icon('download', 16)} CSV</button>` : ''}</div>
<p class="fine">${num(rows.length)} order${rows.length == 1 ? '' : 's'}${rows.length ? ` · ${aed(rows.filter(o => S.COUNTED.includes(o.status)).reduce((s, o) => s + S.fils(o.total), 0) / 100)} confirmed sales in this list` : ''}</p>
${shown.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th class="r hs">Items</th><th class="r">Total</th><th class="hs">Type</th><th>Payment</th><th>Status</th></tr></thead><tbody>${shown.map(o => `<tr data-open="${esc(id(o))}" tabindex="0"><td><b>${esc(id(o))}</b></td><td>${dt(S.tms(o))}</td><td>${esc((o.customer || {}).name)}<small>${esc((o.customer || {}).phone)}</small></td><td class="r hs">${(o.items || []).length}</td><td class="r">${aed(o.total)}</td><td class="hs">${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</td><td>${payBadge(o.paymentStatus)}</td><td>${statusBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>${rows.length > shown.length ? `<div class="more"><button class="btn ghost" id="omore">Show more (${rows.length - shown.length} remaining)</button></div>` : ''}` : empty(ctx.orders.length ? 'No orders match your filters' : 'No orders yet', ctx.orders.length ? 'Clear the search or choose different filters.' : 'Orders placed on the website are saved here before the customer is sent to WhatsApp.')}`;
    root.onclick = e => {
      const r = e.target.closest('[data-open]'); if (r) return openDetail(ctx, r.dataset.open);
      if (e.target.closest('#omore')) { F.limit += 50; ctx.rerender(); }
      if (e.target.closest('#ocsv')) {
        download(`coccinelle-orders-${stamp()}.csv`, S.toCSV(rows, [
          { label: 'Order ID', get: id }, { label: 'Date (Dubai)', get: o => dt(S.tms(o)) }, { label: 'Customer', get: o => (o.customer || {}).name }, { label: 'WhatsApp', get: o => (o.customer || {}).phone }, { label: 'Address', get: o => (o.customer || {}).address },
          { label: 'Type', get: o => o.fulfilment }, { label: 'Products', get: itemsText }, { label: 'Subtotal AED', get: o => Number(o.subtotal).toFixed(2) }, { label: 'Discount AED', get: o => Number(o.discount || 0).toFixed(2) },
          { label: 'Delivery AED', get: o => Number(o.deliveryCharge || 0).toFixed(2) }, { label: 'Total AED', get: o => Number(o.total).toFixed(2) }, { label: 'Payment method', get: o => S.PAY_METHOD[o.paymentMethod] || '' },
          { label: 'Payment status', get: o => S.PAY_STATUS[o.paymentStatus || 'pending'] }, { label: 'Order status', get: o => S.STATUS[o.status] || o.status }]));
        ctx.api.audit('export', 'orders', `${rows.length} rows`);
      }
    };
    root.onkeydown = e => { const r = e.target.closest && e.target.closest('[data-open]'); if (r && e.key === 'Enter') openDetail(ctx, r.dataset.open); };
    $('#oq', root).addEventListener('input', debounce(e => { F.q = e.target.value; F.limit = 50; ctx.rerender('oq'); }));
    [['#os', 'status'], ['#op', 'pay'], ['#of', 'ful'], ['#osc', 'scope']].forEach(([s, k]) => $(s, root).addEventListener('change', e => { F[k] = e.target.value; F.limit = 50; ctx.rerender(); }));
    if (ctx.route.param && !root.dataset.opened) { root.dataset.opened = ctx.route.param; openDetail(ctx, ctx.route.param); } else if (!ctx.route.param) delete root.dataset.opened;
  }
};
