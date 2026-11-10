// Sales & Analytics: trends, products, categories, customers, hours. Everything is calculated from saved orders.
import * as S from '../stats.js';
import { barChart, lineChart, donut, COLORS } from '../charts.js';
import { esc, aed, num, empty } from '../ui.js';

const GR = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const dayLabel = k => k.slice(8, 10) + '/' + k.slice(5, 7);
const PAL = ['#7a0a16', '#c9a227', '#2a6fb0', '#1f7a3d', '#6b5bb5', '#e08a00', '#2b8a8a', '#8a5a44', '#a0a0a0'];
const pctTxt = (c, p) => { const v = S.pctChange(c, p); return v == null ? 'No earlier sales to compare' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}% vs previous period`; };
let gran = 'daily';
export default {
  id: 'analytics', title: 'Sales & Analytics', usesRange: true,
  render(root, ctx) {
    const r = ctx.range, pr = S.prevRange(r), now = ctx.now(), s = S.summary(ctx.orders, r), ps = S.summary(ctx.orders, pr);
    const customers = S.buildCustomers(ctx.orders, ctx.customerDocs, now), mix = S.customerMix(customers, ctx.orders, r), pc = Object.fromEntries(ctx.products.map(p => [String(p.id), p.category]));
    const prods = S.productSales(ctx.orders, r), cats = S.categorySales(ctx.orders, r, pc), slow = S.slowMovers(ctx.products, ctx.orders, r), hours = S.hourSeries(ctx.orders, r), ful = S.fulfilmentSplit(ctx.orders, r);
    const series = gran === 'daily' ? S.dailySeries(ctx.orders, r).map(d => ({ label: dayLabel(d.key), title: d.key, value: d.sales })) : gran === 'weekly' ? S.weeklySeries(ctx.orders, now, 12).map(d => ({ label: dayLabel(d.key), title: 'Week of ' + d.key, value: d.sales })) : gran === 'monthly' ? S.monthlySeries(ctx.orders, now, 12).map(d => ({ label: d.key.slice(5) + '/' + d.key.slice(2, 4), title: d.key, value: d.sales })) : S.yearlySeries(ctx.orders, now, 4).map(d => ({ label: d.key, title: d.key, value: d.sales }));
    const catName = id => (ctx.categories.find(c => c.id === id) || {}).n || (id === 'other' ? 'Other' : id), catLeg = cats.slice(0, 8).map((c, i) => ({ label: catName(c.cat), value: c.revenue, color: PAL[i] }));
    const kpi = (l, v, sub) => `<div class="kpi"><span class="kl">${l}</span><b class="kv">${v}</b><span class="ks">${sub}</span></div>`, top = prods.slice(0, 10), has = s.countedOrders > 0;
    root.innerHTML = `<section class="kgrid k5">${kpi('Sales', aed(s.sales), pctTxt(s.sales, ps.sales))}${kpi('Counted orders', num(s.countedOrders), pctTxt(s.countedOrders, ps.countedOrders))}${kpi('Average order', has ? aed(s.aov) : '<span class="na">-</span>', pctTxt(s.aov, ps.aov))}${kpi('New customers', num(mix.new), 'First order in this period')}${kpi('Returning customers', num(mix.returning), 'Ordered before and again now')}</section>
<article class="card wide2"><div class="chh"><h3>Sales trend <small>${gran === 'daily' ? esc(r.label) : gran === 'weekly' ? 'Last 12 weeks' : gran === 'monthly' ? 'Last 12 months' : 'Last 4 years'}</small></h3><div class="seg" role="group" aria-label="Group sales by">${Object.entries(GR).map(([k, v]) => `<button class="btn ghost sm${gran === k ? ' on' : ''}" data-gran="${k}" aria-pressed="${gran === k}">${v}</button>`).join('')}</div></div>${has || gran !== 'daily' ? lineChart({ data: series, fmt: aed, label: GR[gran] + ' sales in AED' }) : empty('No sales in this period', 'Counted sales appear here once orders are confirmed.')}</article>
<div class="two"><article class="card"><h3>Top products <small>${esc(r.label)}</small></h3>${top.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead><tbody>${top.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${num(p.qty)} ${esc(p.unit || '')}</td><td class="r">${aed(p.revenue)}</td></tr>`).join('')}</tbody></table></div>` : empty('No product sales in this period')}</article>
<article class="card"><h3>Sales by category <small>${esc(r.label)}</small></h3>${catLeg.length ? `<div class="dn">${donut({ data: catLeg, label: 'Sales by category', center: cats.length })}<ul class="lg2">${catLeg.map(c => `<li><i style="background:${c.color}"></i>${esc(c.label)}<b>${aed(c.value)}</b></li>`).join('')}</ul></div>` : empty('No category sales in this period')}</article></div>
<div class="two"><article class="card"><h3>Orders by hour <small>Dubai time, ${esc(r.label)}</small></h3>${has ? barChart({ data: hours.map(h => ({ label: String(h.hour), title: h.hour + ':00', value: h.orders })), fmt: v => v + ' orders', color: COLORS.brand, label: 'Orders by hour of day' }) : empty('No orders in this period')}</article>
<article class="card"><h3>Delivery and pickup <small>${esc(r.label)}</small></h3>${has ? `<div class="tw"><table class="tbl"><thead><tr><th></th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody><tr><td>Delivery</td><td class="r">${num(ful.delivery.orders)}</td><td class="r">${aed(ful.delivery.sales)}</td></tr><tr><td>Pickup</td><td class="r">${num(ful.pickup.orders)}</td><td class="r">${aed(ful.pickup.sales)}</td></tr></tbody></table></div>` : empty('No orders in this period')}</article></div>
<article class="card"><h3>Slow movers <small>${esc(r.label)}</small></h3>${ctx.products.length ? slow.length ? `<p class="fine">${num(slow.length)} available products had no counted sale in this period.</p><p>${slow.slice(0, 30).map(p => esc(p.name)).join(' · ')}${slow.length > 30 ? ` and ${slow.length - 30} more` : ''}</p>` : empty('Every available product sold', 'Each product has at least one counted sale in this period.') : empty('No products yet')}</article>`;
    root.onclick = e => { const b = e.target.closest('[data-gran]'); if (b) { gran = b.dataset.gran; ctx.rerender(); } };
  }
};
