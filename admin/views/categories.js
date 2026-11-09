// Categories: rename, reorder, show/hide, and set each category photo (an https link or a file in the repo, e.g. images/cat/fruits.jpg).
import { esc, num, empty, openModal, closeModal, toast, icon, $ } from '../ui.js';

export function validateCategory(v, taken = []) {
  if (!v.n || v.n.trim().length < 2) return 'Enter a category name (at least 2 letters).';
  if (v.n.length > 60) return 'The name is too long (60 characters at most).';
  if (!Number.isFinite(v.order) || v.order < 0 || v.order > 999) return 'Order must be a number from 0 to 999.';
  const u = (v.imageUrl || '').trim();
  if (u && !/^https:\/\/\S+$/i.test(u) && !/^images\/[A-Za-z0-9_\-\/]+\.(jpe?g|png|webp|avif)$/i.test(u)) return 'The photo must be an https link or a repo path like images/cat/fruits.jpg.';
  if (v.id && taken.includes(v.id)) return 'A category with that ID already exists.';
  return '';
}
export const slug = n => n.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function editor(ctx, c) {
  const isNew = !c, docs = ctx.categoryDocs;
  const m = openModal(`<h2>${isNew ? 'Add category' : 'Edit category'}</h2><form id="cf" class="fgrid" novalidate>
<label class="full">Name *<input id="cn" maxlength="60" required value="${esc(c && c.n)}"></label>
<label>Display order<input id="co" type="number" min="0" max="999" step="1" value="${c ? esc(c.order || 0) : docs.length + 1}"></label>
<label class="ck"><input id="cv" type="checkbox"${!c || c.visible !== false ? ' checked' : ''}> Show on website</label>
<label class="full">Photo (https link or repo path)<input id="ci" placeholder="images/cat/fruits.jpg" value="${esc(c && c.imageUrl)}"></label>
<p class="fine full">Best size 1200 x 900 px, a real photograph, under 300 KB. Put the file in the <b>images/cat/</b> folder of the GitHub repository, then enter its path here. Leave empty to show the branded placeholder.</p>
${c ? `<p class="fine full">Category ID: <b>${esc(c.id)}</b> (fixed, because products refer to it)</p>` : ''}
<p class="er full" id="ce" role="alert"></p><div class="row full"><button class="btn" id="csv" type="submit">Save category</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>`, { label: 'Category' });
  $('#cf', m).addEventListener('submit', async e => {
    e.preventDefault(); const v = { n: $('#cn', m).value.trim(), order: Number($('#co', m).value), visible: $('#cv', m).checked, imageUrl: $('#ci', m).value.trim() }, id = c ? c.id : slug(v.n);
    const err = validateCategory({ ...v, id: isNew ? id : '' }, docs.map(d => d.id)) || (isNew && !id ? 'Use letters or numbers in the name.' : '');
    if (err) return $('#ce', m).textContent = err;
    const b = $('#csv', m); b.disabled = true;
    try { await ctx.api.saveCategory(v, id); closeModal(); toast('Category saved. The website shows it after a refresh.'); ctx.rerender(); } catch (x) { $('#ce', m).textContent = ctx.api.errorText(x); b.disabled = false; }
  });
}

export default {
  id: 'categories', title: 'Categories',
  render(root, ctx) {
    const edit = ctx.can('categories.edit'), docs = ctx.categoryDocs, count = id => ctx.products.filter(p => p.category === id).length;
    root.innerHTML = `${ctx.categoriesError ? `<div class="note warn"><b>Categories could not be loaded.</b> ${esc(ctx.categoriesError)}</div>` : ''}
${!docs.length ? `<div class="note"><b>Categories are not saved in Firebase yet.</b> The website is using its built-in list of 12 categories. ${edit ? 'Save them to Firebase once, then you can rename, reorder, hide and change photos here.' : ''}</div>${edit ? '<p><button class="btn" id="cseed">Save the 12 default categories</button></p>' : ''}` :
        `<div class="bar2"><span class="fine">${num(docs.length)} categories</span><span class="sp"></span>${edit ? '<button class="btn" id="cadd">+ Add category</button>' : ''}</div>
<div class="tw"><table class="tbl"><thead><tr><th>Order</th><th>Category</th><th class="hs">Photo</th><th class="r">Products</th><th>Website</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${docs.map(c => `<tr><td>${esc(c.order || 0)}</td><td><b>${esc(c.n || c.id)}</b><small>${esc(c.id)}</small></td><td class="hs">${c.imageUrl ? esc(c.imageUrl) : '<span class="muted">Placeholder</span>'}</td><td class="r">${num(count(c.id))}</td><td>${c.visible === false ? '<span class="bd st-cancelled">Hidden</span>' : '<span class="bd st-delivered">Visible</span>'}</td>${edit ? `<td class="r"><button class="btn ghost sm" data-edit="${esc(c.id)}">Edit</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
<p class="fine">Hiding a category also hides its products on the website. Products are not deleted.</p>`}`;
    root.onclick = async e => {
      if (e.target.closest('#cadd')) return editor(ctx, null);
      const ed = e.target.closest('[data-edit]'); if (ed) return editor(ctx, docs.find(d => d.id === ed.dataset.edit));
      if (e.target.closest('#cseed') && confirm('Save the 12 default categories to Firebase?')) { try { toast(`${await ctx.api.seedCategories()} categories saved.`); ctx.rerender(); } catch (x) { toast(ctx.api.errorText(x), 'err'); } }
    };
  }
};
