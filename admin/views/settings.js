// Store Settings: contact details and texts the website shows. Saved to settings/public, which the website reads on load.
import { esc, toast, $ } from '../ui.js';
export const digits = v => String(v || '').replace(/\D/g, '');
export function validateSettings(v, contact) {
  if (contact) {
    const wa = digits(v.wa); if (wa.length < 8 || wa.length > 15) return 'The WhatsApp number must have 8 to 15 digits with the country code, for example 971585060627.';
    const ph = String(v.phone || '').replace(/[\s()-]/g, ''); if (!/^\+?\d{8,15}$/.test(ph)) return 'Enter the store phone number with the country code, for example +97143499605.';
    if ((v.phoneLabel || '').length < 4 || v.phoneLabel.length > 30) return 'Enter the phone number as customers should see it (4 to 30 characters).';
    if (!/^https:\/\/\S+$/i.test(v.map || '') || v.map.length > 300) return 'The map link must start with https://.';
  }
  if (!v.hours || v.hours.length > 40) return 'Enter the opening hours (40 characters at most).';
  if (!v.addr || v.addr.length > 120) return 'Enter the address (120 characters at most).';
  if (!v.free || v.free.length > 80) return 'Enter the delivery message (80 characters at most).';
  return '';
}
const TXT = [['hours', 'Opening hours', 40, '7:00 AM to 12:00 AM'], ['addr', 'Address', 120, 'The Commons, Ground Floor, Mirdif, Dubai'], ['free', 'Delivery message shown on the website', 80, 'Free delivery within about 2.5 km']];
const CON = [['wa', 'WhatsApp number for orders', 20, '971585060627'], ['phone', 'Store phone (for the call button)', 20, '+97143499605'], ['phoneLabel', 'Store phone as shown to customers', 30, '+971 4 349 9605'], ['map', 'Google Maps link', 300, 'https://maps.app.goo.gl/...']];
export default {
  id: 'settings', title: 'Store Settings',
  render(root, ctx) {
    const can = ctx.can('settings.edit'), own = ctx.can('settings.contact'), s = ctx.settings || {}, f = (k, ph) => esc(s[k] !== undefined && s[k] !== '' ? s[k] : ph);
    const inp = ([k, l, max, ph], ro) => `<label class="full">${l}<input id="s-${k}" maxlength="${max}" value="${f(k, ph)}" ${ro ? 'readonly' : ''}></label>`;
    root.innerHTML = `<div class="note">These details appear on the website. Changes reach visitors the next time they open or refresh the site.</div>
<form id="sf" class="card fgrid" novalidate><h3 class="full">Contact and orders</h3>${CON.map(c => inp(c, !own)).join('')}${own ? '' : '<p class="fine full">Only the owner can change the WhatsApp number, phone number and map link, because orders are sent to that WhatsApp number.</p>'}
<h3 class="full">Opening and delivery text</h3>${TXT.map(c => inp(c, !can)).join('')}
<p class="fine full">Delivery fee, minimum order and discount are in Offers & Promotions. VAT is not calculated by this system.</p>
<p class="er full" id="se" role="alert"></p>${can ? '<div class="row full"><button class="btn" id="ssv" type="submit">Save settings</button></div>' : '<p class="fine full">Your role can view these settings but not change them.</p>'}</form>`;
    $('#sf', root).addEventListener('submit', async e => {
      e.preventDefault(); if (!can) return; const g = k => $('#s-' + k, root).value.trim(), v = { hours: g('hours'), addr: g('addr'), free: g('free') };
      if (own) Object.assign(v, { wa: digits(g('wa')), phone: g('phone').replace(/[\s()-]/g, ''), phoneLabel: g('phoneLabel'), map: g('map') });
      const err = validateSettings({ ...s, ...v }, own); $('#se', root).textContent = err; if (err) return;
      const b = $('#ssv', root); b.disabled = true; try { await ctx.api.savePublicSettings(v); toast('Settings saved.'); ctx.rerender(); } catch (x) { $('#se', root).textContent = ctx.api.errorText(x); b.disabled = false; }
    });
  }
};
