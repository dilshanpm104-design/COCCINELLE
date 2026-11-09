// Inventory & Stock. Stock numbers are entered by staff (the website does not deduct stock automatically on the free plan).
// Cost prices live only in the private `inventory` collection, never in the public product documents.
import * as S from '../stats.js';
import * as K from '../stock.js';
import { esc, aed, num, dt, empty, openModal, closeModal, toast, download, stamp, icon, debounce, $ } from '../ui.js';

const F = { q: '', state: '' };
const BD = { ok: ['In stock', 'st-delivered'], low: ['Low stock', 'st-awaiting_confirmation'], out: ['Out of stock', 'st-cancelled'], untracked: ['Not tracked', ''] };
const badge = s => `<span class="bd ${BD[s][1]}">${BD[s][0]}</span>`;
export const filterRows = (rows, f) => { const q = f.q.trim().toLowerCase(); return rows.filter(r => (!f.state || r.state === f.state) && (!q || [r.product.name, r.product.category, r.inv && r.inv.sku, r.inv && r.inv.supplier].filter(Boolean).join(' ').toLowerCase().includes(q))).sort((a, b) => ({ out: 0, low: 1, ok: 2, untracked: 3 }[a.state] - { out: 0, low: 1, ok: 2, untracked: 3 }[b.state]) || (a.product.name || '').localeCompare(b.product.name || '')); };

async function openStock(ctx, p) {
  const inv = ctx.inventory.find(i => i.id === p.id) || null, edit = ctx.can('inventory.edit'), unit = p.unit || 'pc';
  const m = openModal(`<div class="dh"><div><h2>${esc(p.name)}</h2><p class="muted">Selling price ${aed(p.price)} / ${esc(unit)} · ${inv && inv.stock != null ? `<b>${esc(K.r3(inv.stock))} ${esc(unit)}</b> in stock` : 'stock not tracked yet'}</p></div>${badge(K.stockState(inv))}</div>
${edit ? `<form id="sf" class="fgrid" novalidate><h4 class="full">${inv && inv.stock != null ? 'Record a stock change' : 'Set opening stock'}</h4>
<label>Type<select id="st">${(inv && inv.stock != null ? Object.entries(K.MOVES) : [['adjustment', K.MOVES.adjustment]]).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
<label>Quantity (${esc(unit)})<input id="sq" type="number" step="any" min="0" inputmode="decimal"></label>
<label class="full">Note (supplier invoice, reason…)<input id="sn" maxlength="200"></label>
<h4 class="full">Details</h4>
<label>SKU / code<input id="sk" maxlength="40" value="${esc(inv && inv.sku)}"></label><label>Low-stock alert at (${esc(unit)})<input id="sl" type="number" step="any" min="0" value="${inv && inv.lowStockAt ? esc(inv.lowStockAt) : ''}"></label>
<label>Purchase cost per ${esc(unit)} (AED)<input id="sc" type="number" step="0.01" min="0" value="${inv && inv.costPrice ? esc(inv.costPrice) : ''}"></label><label>Supplier<input id="ss" maxlength="80" value="${esc(inv && inv.supplier)}"></label>
<p class="fine full">Purchase cost is private. It is never shown on the website. Leave the quantity empty to save only the details.</p>
<p class="er full" id="se" role="alert"></p><div class="row full"><button class="btn" id="ssv" type="submit">Save</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>` : '<p class="fine">Your role can view stock but not change it.</p>'}
<h4>History</h4><div id="sh"><p class="muted">Loading…</p></div>`, { wide: true, label: 'Stock ' + p.name });
  $('#sf', m) && $('#sf', m).addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#se', m), g = id => $(id, m).value.trim(), num0 = (id) => g(id) === '' ? 0 : Number(g(id));
    const meta = { sku: g('#sk'), lowStockAt: num0('#sl'), costPrice: num0('#sc'), supplier: g('#ss') };
    if (![meta.lowStockAt, meta.costPrice].every(x => Number.isFinite(x) && x >= 0)) return err.textContent = 'Low-stock level and cost must be zero or more.';
    let move = null; if (g('#sq') !== '') { const plan = K.planMovement(g('#st'), g('#sq'), inv && inv.stock); if (plan.error) return err.textContent = plan.error; move = { type: g('#st'), qty: Number(g('#sq')), note: g('#sn') }; }
    const b = $('#ssv', m); b.disabled = true;
    try { await ctx.api.saveStock(p, meta, move); closeModal(); toast('Stock saved.'); ctx.rerender(); } catch (x) { err.textContent = ctx.api.errorText(x); b.disabled = false; }
  });
  try {
    const list = await ctx.api.loadMovements(p.id), box = $('#sh', m); if (!box) return;
    box.innerHTML = list.length ? `<div class="tw"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th class="r">Change</th><th class="r">After</th><th>Note</th><th class="hs">By</th></tr></thead><tbody>${list.map(x => `<tr><td>${dt(S.tms(x, 'at'))}</td><td>${esc(K.MOVES[x.type] || x.type)}</td><td class="r">${x.qty > 0 ? '+' : ''}${esc(x.qty)}</td><td class="r">${esc(x.after)}</td><td>${esc(x.note)}</td><td class="hs">${esc(x.byName)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No stock changes recorded yet.</p>';
  } catch (x) { const box = $('#sh', m); if (box) box.innerHTML = `<p class="er">${esc(ctx.api.errorText(x))}</p>`; }
}

export default {
  id: 'inventory', title: 'Inventory & Stock',
  render(root, ctx) {
    const edit = ctx.can('inventory.edit'), map = K.mapInventory(ctx.inventory), all = K.stockRows(ctx.products, map), sum = K.stockSummary(all), rows = filterRows(all, F);
    const kpi = (l, v, s = '') => `<div class="kpi"><span class="kl">${l}</span><b class="kv">${v}</b><span class="ks">${s}</span></div>`;
    root.innerHTML = `${ctx.inventoryError ? `<div class="note warn"><b>Stock could not be loaded.</b> ${esc(ctx.inventoryError)} If you have not published the new Firestore rules yet, see docs/FIRESTORE_SETUP.md.</div>` : ''}
<div class="note"><b>Stock is entered by your team.</b> Orders from the website do not reduce stock automatically. Record what you receive, sell off-line, damage or expire, and do a stock count now and then.</div>
<section class="kgrid k5">${kpi('Tracked products', num(sum.tracked), `${num(sum.untracked)} not tracked yet`)}${kpi('In stock', num(sum.ok))}${kpi('Low stock', num(sum.low), 'At or below the alert level')}${kpi('Out of stock', num(sum.out))}${kpi('Stock value at cost', sum.value ? aed(sum.value) : '<span class="na">-</span>', sum.valueMissingCost ? `${num(sum.valueMissingCost)} products have no cost set, so they are not counted` : 'Only products with a cost price')}</section>
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="iq" type="search" placeholder="Search product, SKU, supplier" value="${esc(F.q)}" aria-label="Search stock"></div>
<select id="is" aria-label="Filter by stock status"><option value="">All products</option>${Object.entries(BD).map(([k, v]) => `<option value="${k}"${F.state === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select><span class="sp"></span>${ctx.can('export.inventory') ? `<button class="btn ghost" id="icsv">${icon('download', 16)} CSV</button>` : ''}</div>
${!ctx.products.length ? empty('No products yet', 'Add products first, then track their stock here.') : rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Product</th><th class="hs">SKU</th><th class="r">Stock</th><th class="r hs">Alert at</th><th class="r hs">Cost</th><th class="r hs">Margin</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.product.name)}</b><small>${esc((ctx.categories.find(c => c.id === r.product.category) || {}).n || '')}${r.product.available === false ? ' · hidden on website' : ''}</small></td><td class="hs">${esc(r.inv && r.inv.sku)}</td><td class="r">${r.state === 'untracked' ? '-' : esc(K.r3(r.inv.stock)) + ' ' + esc(r.product.unit || '')}</td><td class="r hs">${r.inv && r.inv.lowStockAt ? esc(r.inv.lowStockAt) : '-'}</td><td class="r hs">${r.inv && r.inv.costPrice ? aed(r.inv.costPrice) : '-'}</td><td class="r hs">${r.margin == null ? '-' : (r.margin * 100).toFixed(0) + '%'}</td><td>${badge(r.state)}</td><td class="r"><button class="btn ghost sm" data-stock="${esc(r.product.id)}">${edit ? 'Update' : 'View'}</button>${edit && r.state === 'out' && r.product.available !== false ? ` <button class="btn ghost sm" data-hide="${esc(r.product.id)}">Hide on website</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('No products match', 'Clear the search or choose another status.')}`;
    root.onclick = async e => {
      const s = e.target.closest('[data-stock]'); if (s) return openStock(ctx, ctx.products.find(p => p.id === s.dataset.stock));
      const h = e.target.closest('[data-hide]'); if (h) { const p = ctx.products.find(x => x.id === h.dataset.hide); if (p && confirm(`Hide "${p.name}" on the website until it is back in stock?`)) { try { await ctx.api.setAvailable(p, false); toast('Hidden on the website. Turn it back on in Products.'); ctx.rerender(); } catch (x) { toast(ctx.api.errorText(x), 'err'); } } return; }
      if (e.target.closest('#icsv')) { download(`coccinelle-stock-${stamp()}.csv`, S.toCSV(rows, [{ label: 'Product', get: r => r.product.name }, { label: 'SKU', get: r => r.inv && r.inv.sku || '' }, { label: 'Unit', get: r => r.product.unit }, { label: 'Stock', get: r => r.state === 'untracked' ? '' : r.inv.stock }, { label: 'Low-stock alert at', get: r => r.inv && r.inv.lowStockAt || '' }, { label: 'Cost AED', get: r => r.inv && r.inv.costPrice || '' }, { label: 'Selling price AED', get: r => r.product.price }, { label: 'Status', get: r => BD[r.state][0] }, { label: 'Supplier', get: r => r.inv && r.inv.supplier || '' }])); ctx.api.audit('export', 'inventory', `${rows.length} rows`); }
    };
    $('#iq', root).addEventListener('input', debounce(e => { F.q = e.target.value; ctx.rerender('iq'); })); $('#is', root).addEventListener('change', e => { F.state = e.target.value; ctx.rerender(); });
  }
};
