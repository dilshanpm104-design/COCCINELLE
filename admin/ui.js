// Shared UI helpers. Everything user-supplied goes through esc() before it reaches innerHTML.
import { STATUS, PAY_STATUS } from './stats.js';
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt() + ';');
export const aed = n => 'AED ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = n => (Number(n) || 0).toLocaleString('en-US');
const DT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const D = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' });
export const dt = ms => ms ? DT.format(ms) : '-';
export const dOnly = ms => ms ? D.format(ms) : '-';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const debounce = (f, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

const ICONS = { // 24px stroke icons (Lucide-style paths, hand-written, no external requests)
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>', bag: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>', box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', stack: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 17.5l9 5 9-5" opacity=".6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.100-1.100 1.900-2.500 1.900A2.700 2.100 0 0 1 9.500 14.500M12 6v1.500M12 16.500V18"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.500 3.200 7.500 7.500 9 4.300-1.500 7.500-4.500 7.500-9V6z"/><path d="m9 12 2 2 4-4"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.500-3.500L4 9M4 5v4h4M4 13a8 8 0 0 0 14.500 3.500L20 15M20 19v-4h-4"/>', print: '<path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16"/>', search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
export const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

export const statusBadge = s => `<span class="bd st-${esc(s)}">${esc(STATUS[s] || s || 'Unknown')}</span>`;
export const payBadge = s => `<span class="bd pay-${esc(s || 'pending')}">${esc(PAY_STATUS[s || 'pending'] || s)}</span>`;

export function toast(msg, type = 'ok', ms = 4200) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast ' + type; el.setAttribute('role', type === 'err' ? 'alert' : 'status'); el.textContent = msg;
  box.append(el); setTimeout(() => el.remove(), ms);
}
let lastFocus = null;
export function openModal(html, { wide = false, label = 'Dialog' } = {}) {
  lastFocus = document.activeElement; const m = $('#modal');
  m.innerHTML = `<div class="mb${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="mx" data-close-modal aria-label="Close">${icon('x', 18)}</button>${html}</div>`;
  m.classList.add('o'); const f = m.querySelector('input,select,textarea,button:not(.mx)'); (f || m.querySelector('.mx')).focus(); return m.firstElementChild;
}
export function closeModal() { const m = $('#modal'); m.classList.remove('o'); m.innerHTML = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
export function download(name, text, mime = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: mime })); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
export const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b><p>${esc(text || '')}</p></div>`;
export const stamp = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
