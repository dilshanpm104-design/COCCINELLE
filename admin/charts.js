// Tiny dependency-free SVG charts. Each function returns an SVG string. Every chart has a text
// alternative (aria-label + <title> per mark) so it does not rely on colour alone.
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt() + ';');
export const COLORS = { brand: '#a30f20', brandSoft: '#f3d5d8', grid: '#eadfd5', ink: '#171214', muted: '#6d625f' };
// Status palette: warm = needs attention, cool = progressing, green = done, grey = cancelled.
export const STATUS_COLORS = { new: '#c9a227', awaiting_confirmation: '#e08a00', confirmed: '#2a6fb0', preparing: '#5b8fd1', ready_for_delivery: '#3a9ab5', out_for_delivery: '#6b5bb5', delivered: '#1f7a3d', collected: '#58a56f', cancelled: '#9a8f8b' };
export const PAY_COLORS = { pending: '#e08a00', paid: '#1f7a3d', failed: '#a30f20', refunded: '#6b5bb5', partially_refunded: '#3a9ab5' };

const niceMax = v => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const compact = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v * 100) / 100);

function frame(w, h, m, max, ticks = 4) {
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const y = m.t + (h - m.t - m.b) * (1 - i / ticks), v = max * i / ticks;
    g += `<line x1="${m.l}" x2="${w - m.r}" y1="${y}" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/><text x="${m.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${COLORS.muted}">${compact(v)}</text>`;
  }
  return g;
}
const xLabels = (data, x, y, every) => data.map((d, i) => i % every ? '' : `<text x="${x(i)}" y="${y}" text-anchor="middle" font-size="11" fill="${COLORS.muted}">${esc(d.label)}</text>`).join('');

/** data: [{label, value, title}] */
export function barChart({ data, fmt = v => v, color = COLORS.brand, height = 230, label = 'Bar chart' }) {
  const w = 640, h = height, m = { l: 46, r: 8, t: 10, b: 28 }, max = niceMax(Math.max(...data.map(d => d.value), 0)), n = data.length || 1;
  const bw = (w - m.l - m.r) / n, bar = Math.max(2, Math.min(38, bw * .68)), x = i => m.l + bw * i + bw / 2, ph = h - m.t - m.b;
  const bars = data.map((d, i) => { const bh = d.value / max * ph; return `<rect x="${x(i) - bar / 2}" y="${m.t + ph - bh}" width="${bar}" height="${Math.max(bh, d.value > 0 ? 1 : 0)}" rx="${Math.min(4, bar / 2)}" fill="${color}"><title>${esc(d.title || d.label)}: ${esc(fmt(d.value))}</title></rect>`; }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="chart">${frame(w, h, m, max)}${bars}${xLabels(data, x, h - 8, Math.ceil(n / 9))}</svg>`;
}
export function lineChart({ data, fmt = v => v, color = COLORS.brand, height = 230, label = 'Line chart' }) {
  const w = 640, h = height, m = { l: 46, r: 12, t: 10, b: 28 }, max = niceMax(Math.max(...data.map(d => d.value), 0)), n = data.length, ph = h - m.t - m.b;
  const x = i => n === 1 ? (m.l + w - m.r) / 2 : m.l + (w - m.l - m.r) * i / (n - 1), y = v => m.t + ph - v / max * ph;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  const area = n > 1 ? `<polygon points="${m.l},${m.t + ph} ${pts.join(' ')} ${w - m.r},${m.t + ph}" fill="${COLORS.brandSoft}" opacity=".7"/>` : '';
  const dots = n <= 40 ? data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.2" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(d.title || d.label)}: ${esc(fmt(d.value))}</title></circle>`).join('') : '';
  const hit = n > 40 ? data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="4" fill="transparent"><title>${esc(d.title || d.label)}: ${esc(fmt(d.value))}</title></circle>`).join('') : '';
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="chart">${frame(w, h, m, max)}${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}${hit}${xLabels(data, x, h - 8, Math.ceil(n / 9))}</svg>`;
}
/** data: [{label, value, color}] - the legend is rendered by the caller as HTML so it is readable without colour. */
export function donut({ data, label = 'Donut chart', center = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0), r = 52, c = 2 * Math.PI * r;
  if (!total) return `<svg viewBox="0 0 140 140" role="img" aria-label="${esc(label)}: no data" class="donut"><circle cx="70" cy="70" r="${r}" fill="none" stroke="${COLORS.grid}" stroke-width="20"/></svg>`;
  let off = 0;
  const arcs = data.filter(d => d.value > 0).map(d => { const len = d.value / total * c, s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${d.color}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(d.label)}: ${d.value}</title></circle>`; off += len; return s; }).join('');
  return `<svg viewBox="0 0 140 140" role="img" aria-label="${esc(label)}" class="donut">${arcs}<text x="70" y="68" text-anchor="middle" font-size="22" font-weight="700" fill="${COLORS.ink}">${esc(center || total)}</text><text x="70" y="86" text-anchor="middle" font-size="10" fill="${COLORS.muted}">orders</text></svg>`;
}
