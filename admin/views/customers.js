import * as S from '../stats.js';
import { esc, aed, num, dt, dOnly, statusBadge, empty, openModal, toast, download, stamp, icon, debounce, $ } from '../ui.js';

const F = { q: '', seg: '', sort: 'last' };
const SORTS = { last: 'Most recent order', spend: 'Highest verified spending', orders: 'Most orders', name: 'Name A to Z' };
const segBadge = c => `<span class="bd sg-${c.segment}">${esc(S.SEGMENTS[c.segment])}</span>${c.inactive ? ' <span class="bd sg-inactive">Inactive</span>' : ''}`;

export function filterCustomers(list, f) {
  const q = f.q.trim().toLowerCase(), qd = S.phoneQuery(f.q);
  const out = list.filter(c => (!f.seg || (f.seg === 'inactive' ? c.inactive : c.segment === f.seg)) && (!q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (qd && c.phone.replace(/\D/g, '').includes(qd)) || c.address.toLowerCase().includes(q)));
  const by = { last: (a, b) => b.last - a.last, spend: (a, b) => b.verified - a.verified, orders: (a, b) => b.orders - a.orders, name: (a, b) => a.name.localeCompare(b.name) }[f.sort] || (() => 0);
  return out.sort(by);
}

function openCustomer(ctx, custId) {
  const all = S.buildCustomers(ctx.orders, ctx.customerDocs, ctx.now()), c = all.find(x => x.id === custId);
  if (!c) return toast('That customer was not found.', 'err');
  const hist = ctx.orders.filter(o => (o.customer || {}).phone === c.phone).sort((a, b) => S.tms(b) - S.tms(a)), edit = ctx.can('customers.editNotes');
  const m = openModal(`<div class="dh"><div><h2>${esc(c.name)}</h2><p class="muted">${esc(c.id)}</p></div><div class="dbadges">${segBadge(c)}</div></div>
<div class="dgrid"><section><h4>Contact</h4><p>WhatsApp <a href="https://wa.me/${esc(c.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(c.phone)}</a></p><p>${c.address ? esc(c.address) : '<span class="muted">No delivery address on file</span>'}</p></section>
<section><h4>Activity</h4><p>First order: ${dOnly(c.first)}</p><p>Last order: ${dOnly(c.last)}</p><p>Orders: <b>${num(c.orders)}</b></p><p>Verified spending: <b>${aed(c.verified)}</b></p><p class="fine">Verified spending counts only orders staff have marked Paid.</p></section></div>
<h4>Notes</h4><textarea id="cn" rows="3" maxlength="500" ${edit ? '' : 'readonly'} placeholder="${edit ? 'Delivery instructions, preferences, allergies…' : ''}">${esc(c.notes)}</textarea>${edit ? '<div class="row"><button class="btn" id="csave">Save notes</button><span class="er" id="cer" role="alert"></span></div>' : ''}
<h4>Order history</h4><div class="tw"><table class="tbl"><thead><tr><th>Order</th><th>Date</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>${hist.map(o => `<tr data-go="#/orders/${esc(o.orderId || o.id)}" tabindex="0"><td><b>${esc(o.orderId || o.id)}</b></td><td>${dt(S.tms(o))}</td><td class="r">${aed(o.total)}</td><td>${statusBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>`, { wide: true, label: 'Customer ' + c.name });
  m.addEventListener('click', e => { const r = e.target.closest('[data-go]'); if (r) { location.hash = r.dataset.go; } });
  const b = $('#csave', m); if (b) b.addEventListener('click', async () => {
    b.disabled = true;
    try { await ctx.api.saveCustomerNote(c, $('#cn', m).value.trim()); toast('Notes saved.'); } catch (e) { $('#cer', m).textContent = ctx.api.errorText(e); } finally { b.disabled = false; }
  });
}

export default {
  id: 'customers', title: 'Customers / CRM',
  render(root, ctx) {
    const all = S.buildCustomers(ctx.orders, ctx.customerDocs, ctx.now()), rows = filterCustomers(all, F);
    const cnt = k => all.filter(c => c.segment === k).length, inactive = all.filter(c => c.inactive).length;
    root.innerHTML = `<section class="kgrid k5"><div class="kpi"><span class="kl">Customers</span><b class="kv">${num(all.length)}</b><span class="ks">With at least one non-cancelled order</span></div>
${['new', 'returning', 'regular', 'high_value'].map(k => `<div class="kpi"><span class="kl">${esc(S.SEGMENTS[k])}</span><b class="kv">${num(cnt(k))}</b><span class="ks"></span></div>`).join('')}</section>
<p class="fine"><b>Segments:</b> New = 1 order · Returning = 2 to ${S.SEG.regularOrders - 1} orders · Regular = ${S.SEG.regularOrders}+ orders · High-Value = verified spending of AED ${num(S.SEG.highValueAed)}+ · Inactive = no order for ${S.SEG.inactiveDays}+ days (${num(inactive)} now). Customers are identified by WhatsApp number, the only contact detail the website collects.</p>
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="cq" type="search" placeholder="Search name, WhatsApp number, ID, address" value="${esc(F.q)}" aria-label="Search customers"></div>
<select id="cs" aria-label="Filter by segment"><option value="">All segments</option>${Object.entries(S.SEGMENTS).map(([k, v]) => `<option value="${k}"${F.seg === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}<option value="inactive"${F.seg === 'inactive' ? ' selected' : ''}>Inactive</option></select>
<select id="cso" aria-label="Sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}"${F.sort === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select><span class="sp"></span>${ctx.can('export.customers') ? `<button class="btn ghost" id="ccsv">${icon('download', 16)} CSV</button>` : ''}</div>
${rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Customer</th><th class="hs">ID</th><th class="hs">First order</th><th>Last order</th><th class="r">Orders</th><th class="r">Verified spending</th><th>Segment</th></tr></thead><tbody>${rows.map(c => `<tr data-open="${esc(c.id)}" tabindex="0"><td><b>${esc(c.name)}</b><small>${esc(c.phone)}</small></td><td class="hs">${esc(c.id)}</td><td class="hs">${dOnly(c.first)}</td><td>${dOnly(c.last)}</td><td class="r">${num(c.orders)}</td><td class="r">${aed(c.verified)}</td><td>${segBadge(c)}</td></tr>`).join('')}</tbody></table></div>` : empty(all.length ? 'No customers match your filters' : 'No customers yet', all.length ? 'Clear the search or choose another segment.' : 'Customer records are built from real orders. They appear here after the first order is placed on the website.')}`;
    root.onclick = e => {
      const r = e.target.closest('[data-open]'); if (r) return openCustomer(ctx, r.dataset.open);
      if (e.target.closest('#ccsv')) {
        download(`coccinelle-customers-${stamp()}.csv`, S.toCSV(rows, [{ label: 'Customer ID', get: c => c.id }, { label: 'Name', get: c => c.name }, { label: 'Phone', get: c => c.phone }, { label: 'WhatsApp', get: c => c.whatsapp }, { label: 'Address', get: c => c.address },
        { label: 'First order', get: c => dOnly(c.first) }, { label: 'Last order', get: c => dOnly(c.last) }, { label: 'Total orders', get: c => c.orders }, { label: 'Verified spending AED', get: c => c.verified.toFixed(2) }, { label: 'Segment', get: c => S.SEGMENTS[c.segment] }, { label: 'Inactive', get: c => c.inactive ? 'Yes' : 'No' }, { label: 'Notes', get: c => c.notes }]));
        ctx.api.audit('export', 'customers', `${rows.length} rows`);
      }
    };
    root.onkeydown = e => { const r = e.target.closest && e.target.closest('[data-open]'); if (r && e.key === 'Enter') openCustomer(ctx, r.dataset.open); };
    $('#cq', root).addEventListener('input', debounce(e => { F.q = e.target.value; ctx.rerender('cq'); }));
    $('#cs', root).addEventListener('change', e => { F.seg = e.target.value; ctx.rerender(); }); $('#cso', root).addEventListener('change', e => { F.sort = e.target.value; ctx.rerender(); });
    if (ctx.route.param && !root.dataset.opened) { root.dataset.opened = ctx.route.param; openCustomer(ctx, ctx.route.param); }
  }
};
