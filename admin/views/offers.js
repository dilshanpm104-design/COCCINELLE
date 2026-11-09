// Offers & Promotions: pricing rules (delivery fee, minimum order, basket discount), deal of the day, and a list of products on offer.
// Every value is saved to settings/public, which the website reads. Defaults are all zero: no fee, no minimum, no discount.
import { validatePricing } from '../stock.js';
import { esc, aed, num, empty, toast, $ } from '../ui.js';

const FIELDS = [['deliveryFee', 'Delivery fee (AED)', 'Charged on delivery orders. 0 = free delivery.'], ['minOrder', 'Minimum order (AED)', '0 = no minimum.'], ['discountPct', 'Basket discount (%)', '0 = no discount. Maximum 50.'], ['discountMin', 'Discount from spend of (AED)', 'Only used when the discount is above 0.']];

export default {
  id: 'offers', title: 'Offers & Promotions',
  render(root, ctx) {
    const edit = ctx.can('offers.edit'), s = ctx.settings || {}, val = k => s[k] === undefined ? '' : s[k], deal = ctx.products.find(p => p.deal);
    const onOffer = ctx.products.filter(p => Number(p.oldPrice) > Number(p.price) && p.available !== false);
    root.innerHTML = `<div class="note"><b>Today the website charges no delivery fee, has no minimum order and gives no discount.</b> Change a value below only when you decide to. It applies to the website as soon as visitors reload.</div>
<div class="two"><article class="card"><h3>Pricing rules</h3><form id="of" class="fgrid" novalidate>${FIELDS.map(([k, l, h]) => `<label>${l}<input id="o-${k}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${esc(val(k))}" ${edit ? '' : 'readonly'}><small class="fine">${h}</small></label>`).join('')}
<p class="er full" id="oe" role="alert"></p>${edit ? '<div class="row full"><button class="btn" id="osv" type="submit">Save pricing rules</button></div>' : '<p class="fine full">Your role can view these rules but not change them.</p>'}</form></article>
<article class="card"><h3>Deal of the day</h3><p class="fine">One product is featured as the deal on the homepage.</p>${deal ? `<p><b>${esc(deal.name)}</b><br>${aed(deal.price)}${deal.oldPrice ? ` <s class="muted">${aed(deal.oldPrice)}</s>` : ''}</p>` : '<p class="muted">No deal selected.</p>'}
${edit ? `<div class="row"><select id="od" aria-label="Choose deal product"><option value="">Choose a product…</option>${ctx.products.filter(p => p.available !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(p => `<option value="${esc(p.id)}"${deal && deal.id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn" id="odo">Set deal</button>${deal ? '<button class="btn ghost" id="odc">Clear</button>' : ''}</div><p class="fine">For a deal price, set the product's old price in Products so the saving shows.</p><p class="er" id="ode" role="alert"></p>` : ''}</article></div>
<article class="card"><h3>Products on offer <small>${num(onOffer.length)}</small></h3>${onOffer.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Product</th><th class="r">Was</th><th class="r">Now</th><th class="r">Saving</th></tr></thead><tbody>${onOffer.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="r">${aed(p.oldPrice)}</td><td class="r">${aed(p.price)}</td><td class="r">${Math.round((1 - p.price / p.oldPrice) * 100)}%</td></tr>`).join('')}</tbody></table></div><p class="fine">A product is on offer when its old price is higher than its price. Edit these in Products.</p>` : empty('No products on offer', 'Add an old price (higher than the current price) to a product in Products and it appears here and on the Offers page of the website.')}</article>`;
    const run = async (btn, fn, ok) => { btn.disabled = true; try { await fn(); toast(ok); ctx.rerender(); } catch (x) { $('#ode', root).textContent = ctx.api.errorText(x); btn.disabled = false; } };
    $('#of', root).addEventListener('submit', async e => {
      e.preventDefault(); if (!edit) return; const v = Object.fromEntries(FIELDS.map(([k]) => [k, $('#o-' + k, root).value.trim()])), err = validatePricing(v); $('#oe', root).textContent = err; if (err) return;
      const b = $('#osv', root); b.disabled = true; try { await ctx.api.savePublicSettings(Object.fromEntries(FIELDS.map(([k]) => [k, v[k] === '' ? 0 : Number(v[k])]))); toast('Pricing rules saved.'); ctx.rerender(); } catch (x) { $('#oe', root).textContent = ctx.api.errorText(x); b.disabled = false; }
    });
    if (edit) {
      $('#odo', root).addEventListener('click', e => { const p = ctx.products.find(x => x.id === $('#od', root).value); if (!p) return $('#ode', root).textContent = 'Choose a product first.'; run(e.currentTarget, () => ctx.api.setDeal(p), 'Deal of the day set.'); });
      const c = $('#odc', root); if (c) c.addEventListener('click', e => run(e.currentTarget, () => ctx.api.setDeal(null), 'Deal cleared.'));
    }
  }
};
