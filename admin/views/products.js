// Products: the v1 product manager (search, add, edit, delete, availability, deal of the day, photo) carried over,
// now inside the new shell, with featured / best-seller flags that the public homepage reads.
import { esc, aed, num, empty, openModal, closeModal, toast, icon, debounce, $ } from '../ui.js';

let q = '', photo = '';
const shrink = f => new Promise((ok, no) => { const i = new Image(); i.onload = () => { const s = Math.min(1, 320 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * s); c.height = Math.round(i.height * s); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(i.src); ok(c.toDataURL('image/jpeg', .72)); }; i.onerror = () => no(new Error('Could not read the photo')); i.src = URL.createObjectURL(f); });

function openEditor(ctx, p) {
  photo = (p && p.imageData) || '';
  const cats = ctx.categories, has = p && cats.some(c => c.id === p.category);
  const m = openModal(`<h2>${p ? 'Edit product' : 'Add product'}</h2><form id="pf" class="fgrid" novalidate>
<label class="full">Product name (English) *<input id="pn" required maxlength="160" value="${esc(p && p.name)}"></label>
<label>Price (AED) *<input id="pp" type="number" min="0" step="0.01" inputmode="decimal" required value="${p && p.price != null ? esc(p.price) : ''}"></label>
<label>Sold by<select id="pu">${['kg', 'pc', 'pack'].map(u => `<option value="${u}"${(p && p.unit || 'pc') === u ? ' selected' : ''}>per ${u === 'pc' ? 'piece' : u}</option>`).join('')}</select></label>
<label>Category<select id="pc">${!has && p ? `<option value="${esc(p.category)}" selected>${esc(p.category || 'Uncategorised')} (choose a new category)</option>` : ''}${cats.map(c => `<option value="${esc(c.id)}"${p && p.category === c.id ? ' selected' : ''}>${esc(c.n)}</option>`).join('')}</select></label>
<label>Old price (only for an offer)<input id="po" type="number" min="0" step="0.01" inputmode="decimal" value="${p && p.oldPrice ? esc(p.oldPrice) : ''}"></label>
<label class="full">Description (English)<textarea id="pd" maxlength="400">${esc(p && (p.note || p.description))}</textarea></label>
<label>Arabic name (optional)<input id="pna" dir="auto" value="${esc(p && p.nameAr)}"></label><label>French name (optional)<input id="pnf" value="${esc(p && p.nameFr)}"></label>
<label class="full">Product photo (take a photo or choose one)<input id="pph" type="file" accept="image/*"></label><div class="full"><img id="ppv" class="pv${photo ? '' : ' hidden'}" alt="Photo preview" src="${esc(photo)}"></div>
<label class="full">Image URL (optional, https only)<input id="pim" type="url" placeholder="https://…" value="${esc(p && (p.imageUrl || p.image))}"></label>
<label class="ck full"><input id="pav" type="checkbox"${!p || p.available !== false ? ' checked' : ''}> Available on website</label>
<label class="ck"><input id="pde" type="checkbox"${p && p.deal ? ' checked' : ''}> Deal of the day (only one)</label>
<label class="ck"><input id="pft" type="checkbox"${p && p.featured ? ' checked' : ''}> Featured on homepage</label>
<label class="ck"><input id="pbs" type="checkbox"${p && p.bestSeller ? ' checked' : ''}> Show in Best sellers</label>
<p class="er full" id="pe" role="alert"></p><div class="row full"><button class="btn" id="psv" type="submit">Save product</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>`, { wide: true, label: p ? 'Edit product' : 'Add product' });
  $('#pph', m).addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { photo = await shrink(f); const i = $('#ppv', m); i.src = photo; i.classList.remove('hidden'); } catch (x) { $('#pe', m).textContent = x.message; } });
  $('#pf', m).addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#pe', m), name = $('#pn', m).value.trim(), price = Number($('#pp', m).value), old = Number($('#po', m).value) || 0, url = $('#pim', m).value.trim();
    if (!name) return err.textContent = 'Enter the product name.';
    if (!Number.isFinite(price) || price < 0 || $('#pp', m).value === '') return err.textContent = 'Enter a valid price.';
    if (old && old <= price) return err.textContent = 'The old price must be higher than the price, or leave it empty.';
    if (url) { try { if (new URL(url).protocol !== 'https:') throw 0; } catch { return err.textContent = 'Enter a valid https image URL.'; } }
    const data = { name, price, unit: $('#pu', m).value, category: $('#pc', m).value, oldPrice: old, deal: $('#pde', m).checked, featured: $('#pft', m).checked, bestSeller: $('#pbs', m).checked, imageData: photo, imageUrl: url, note: $('#pd', m).value.trim(), nameAr: $('#pna', m).value.trim(), nameFr: $('#pnf', m).value.trim(), available: $('#pav', m).checked };
    const b = $('#psv', m); b.disabled = true; b.textContent = 'Saving…';
    try { await ctx.api.saveProduct(data, p && p.id); closeModal(); toast('Product saved.'); ctx.rerender(); } catch (x) { err.textContent = ctx.api.errorText(x); b.disabled = false; b.textContent = 'Save product'; }
  });
}

export default {
  id: 'products', title: 'Products',
  render(root, ctx) {
    const edit = ctx.can('products.edit'), list = ctx.products.filter(p => [p.name, p.nameAr, p.nameFr, p.category].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const catName = id => (ctx.categories.find(c => c.id === id) || {}).n, bad = ctx.products.filter(p => !catName(p.category)).length;
    root.innerHTML = `${ctx.productsError ? `<div class="note warn"><b>Products could not be loaded.</b> ${esc(ctx.productsError)}</div>` : ''}${bad ? `<div class="note warn"><b>${bad} product${bad == 1 ? ' needs' : 's need'} a new category.</b> The shop now has 12 categories. Open the product and choose one. Until then the website guesses from the product name.</div>` : ''}
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="sq" type="search" placeholder="Search product name or category" value="${esc(q)}" aria-label="Search products"></div><span class="fine">${num(list.length)} of ${num(ctx.products.length)}</span><span class="sp"></span>
<button class="btn ghost" id="prf">${icon('refresh', 16)} Refresh</button>${edit && !ctx.products.length ? '<button class="btn ghost" id="seed">Load sample products</button>' : ''}${edit ? '<button class="btn" id="add">+ Add product</button>' : ''}</div>
${!edit ? '<p class="fine">Your role can view products but not change them.</p>' : ''}
${list.length ? `<div class="pgrid">${list.map(p => `<article class="pcard"><div class="pim">${(p.imageUrl || p.imageData) ? `<img loading="lazy" alt="" src="${esc(p.imageUrl || p.imageData)}" onerror="this.remove()">` : '<span>No photo</span>'}</div><div class="pinfo"><h3>${esc(p.name || 'Unnamed product')}</h3><div class="pprice">${aed(p.price)} <small>/ ${esc(p.unit || '')}</small>${p.oldPrice > p.price ? ` <s>${aed(p.oldPrice)}</s>` : ''}</div><div class="fine">${esc(catName(p.category) || 'Needs category')} · ${p.available === false ? 'Hidden' : 'Visible'}${p.deal ? ' · Deal' : ''}${p.featured ? ' · Featured' : ''}${p.bestSeller ? ' · Best seller' : ''}</div>${edit ? `<div class="row"><button class="btn ghost sm" data-edit="${esc(p.id)}">Edit</button><button class="btn danger sm" data-del="${esc(p.id)}">Delete</button></div>` : ''}</div></article>`).join('')}</div>` : empty(ctx.products.length ? 'No matching products' : 'No products in the database yet', ctx.products.length ? 'Try another search.' : 'The website shows its built-in product list until products exist here. Use “Load sample products” once to copy it in, then edit freely.')}`;
    root.onclick = async e => {
      const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
      if (e.target.closest('#add')) return openEditor(ctx, null);
      if (ed) return openEditor(ctx, ctx.products.find(p => p.id === ed.dataset.edit));
      if (e.target.closest('#prf')) { await ctx.api.loadProducts(); ctx.rerender(); }
      if (dl) { const p = ctx.products.find(x => x.id === dl.dataset.del); if (p && confirm(`Delete "${p.name}"? This cannot be undone.`)) { try { await ctx.api.deleteProduct(p); toast('Product deleted.'); ctx.rerender(); } catch (x) { toast(ctx.api.errorText(x), 'err'); } } }
      if (e.target.closest('#seed') && confirm('Add the 50 sample products from the website? You can edit or delete them afterwards.')) { try { const n = await ctx.api.seedProducts(); toast(`${n} sample products added.`); ctx.rerender(); } catch (x) { toast(ctx.api.errorText(x), 'err'); } }
    };
    $('#sq', root).addEventListener('input', debounce(e => { q = e.target.value; ctx.rerender('sq'); }));
  }
};
