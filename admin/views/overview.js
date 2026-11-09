import * as S from '../stats.js';
import { esc, aed, num, dt, statusBadge, empty, icon } from '../ui.js';
import * as K from '../stock.js';
import { barChart, lineChart, donut, STATUS_COLORS, PAY_COLORS } from '../charts.js';

const delta = (cur, prev) => { const p = S.pctChange(cur, prev); return p === null ? '<span class="dl na">no earlier data</span>' : `<span class="dl ${p >= 0 ? 'up' : 'dn'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs previous</span>`; };
const kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><span class="kl">${esc(label)}</span><b class="kv">${value}</b><span class="ks">${sub}</span></div>`;
const legend = items => `<ul class="lg2">${items.map(i => `<li><i style="background:${i.color}"></i>${esc(i.label)}<b>${num(i.value)}</b></li>`).join('')}</ul>`;
const dayLabel = k => k.slice(8) + '/' + k.slice(5, 7);

export default {
  id: 'overview', title: 'Overview', usesRange: true,
  render(root, ctx) {
    const { orders, range } = ctx, now = ctx.now(), today = S.rangeFor('today', now), yest = S.rangeFor('yesterday', now), month = S.rangeFor('thisMonth', now);
    const s = S.summary(orders, range), prev = S.summary(orders, S.prevRange(range));
    const custs = S.buildCustomers(orders, ctx.customerDocs, now), newC = S.newCustomersIn(custs, range);
    const top = S.productSales(orders, range), pending = orders.filter(o => S.PENDING.includes(o.status));
    const stockAll = K.stockRows(ctx.products, K.mapInventory(ctx.inventory || [])), ss = K.stockSummary(stockAll), alerts = stockAll.filter(r => r.state === 'low' || r.state === 'out').sort((a, b) => (a.state === 'out' ? 0 : 1) - (b.state === 'out' ? 0 : 1));
    const lowKpi = ss.tracked ? kpi('Low stock products', num(alerts.length), `${num(ss.out)} out of stock`, alerts.length ? 'warn' : '') : kpi('Low stock products', '<span class="na">Not set up</span>', 'Add stock quantities in Inventory & Stock');
    const lowCard = `<article class="card"><h3>Low-stock notifications</h3>${!ss.tracked ? empty('Inventory is not set up yet', 'Add stock quantities and a low-stock level for each product in Inventory & Stock and alerts will appear here.') : alerts.length ? `<ul class="lst">${alerts.slice(0, 8).map(r => `<li><span>${esc(r.product.name)}</span><b>${r.state === 'out' ? 'Out of stock' : esc(r.inv.stock) + ' ' + esc(r.product.unit || '') + ' left'}</b></li>`).join('')}</ul><p class="fine"><a href="#/inventory">Open Inventory & Stock</a></p>` : empty('No low-stock products', 'Every tracked product is above its alert level.')}</article>`;
    const banners = [];
    if (ctx.ordersError) banners.push(`<div class="note warn"><b>Orders could not be loaded.</b> ${esc(ctx.ordersError)} If you have not published the new Firestore rules yet, see docs/FIRESTORE_SETUP.md.</div>`);
    else if (!orders.length) banners.push('<div class="note"><b>No orders recorded yet.</b> Every figure below is calculated from saved orders, so they will fill in as soon as customers place orders on the website. Nothing here is sample data.</div>');
    if (ctx.ordersTruncated) banners.push(`<div class="note warn">Showing the latest ${num(ctx.orders.length)} orders only. Older orders are not included in these figures.</div>`);
    if (range.invalid) banners.push('<div class="note warn">The custom date range is not valid. Choose a start date that is on or before the end date.</div>');
    const daily = S.dailySeries(orders, range), weekly = S.weeklySeries(orders, now, 8), monthly = S.monthlySeries(orders, now, 12);
    const stat = S.statusCounts(orders, range), pay = S.paymentCounts(orders, range);
    const sLeg = stat.map(x => ({ label: S.STATUS[x.key], value: x.count, color: STATUS_COLORS[x.key] })), pLeg = pay.map(x => ({ label: S.PAY_STATUS[x.key], value: x.count, color: PAY_COLORS[x.key] }));
    const recent = orders.slice().sort((a, b) => S.tms(b) - S.tms(a)).slice(0, 8);
    const sales = v => aed(v);

    root.innerHTML = `${banners.join('')}
<section class="kgrid k3" aria-label="Key sales figures">
${kpi("Today's sales", sales(S.summary(orders, today).sales), `${num(S.summary(orders, today).countedOrders)} confirmed orders`, 'hero')}
${kpi("Yesterday's sales", sales(S.summary(orders, yest).sales), `${num(S.summary(orders, yest).countedOrders)} confirmed orders`)}
${kpi('Monthly revenue', sales(S.summary(orders, month).sales), 'This calendar month')}
</section>
<h2 class="sec">Selected period <small>${esc(range.label)}</small></h2>
<section class="kgrid" aria-label="Period figures">
${kpi('Total orders', num(s.orders), delta(s.orders, prev.orders))}
${kpi('Sales (confirmed orders)', sales(s.sales), delta(s.sales, prev.sales))}
${kpi('Average order value', sales(s.aov), delta(s.aov, prev.aov))}
${kpi('Pending orders', num(s.pending), s.pending ? `${aed(s.pendingValue)} waiting for confirmation` : 'Nothing waiting', s.pending ? 'warn' : '')}
${kpi('Confirmed / in progress', num(s.confirmed), 'Confirmed, preparing, ready, out for delivery')}
${kpi('Completed orders', num(s.completed), 'Delivered or collected')}
${kpi('Cancelled orders', num(s.cancelled), '')}
${kpi('New customers', num(newC), 'First order in this period')}
${lowKpi}
${kpi('Best seller', top[0] ? esc(top[0].name) : '<span class="na">None yet</span>', top[0] ? `${num(top[0].qty)} ${esc(top[0].unit || '')} · ${aed(top[0].revenue)}` : 'No confirmed sales in this period')}
</section>
<p class="fine">“Sales” count orders once your team has confirmed them. Pending and cancelled orders are never counted. Payment received is tracked separately under Payments.</p>

<section class="cgrid">
<article class="card wide2"><h3>Daily sales <small>${esc(range.label)}</small></h3>${S.summary(orders, range).countedOrders ? lineChart({ data: daily.map(d => ({ label: dayLabel(d.key), title: d.key, value: d.sales })), fmt: aed, label: 'Daily sales in AED for ' + range.label }) : empty('No confirmed sales in this period', 'Try a wider date range.')}</article>
<article class="card"><h3>Order status <small>${esc(range.label)}</small></h3>${s.orders ? `<div class="dn">${donut({ data: sLeg, label: 'Orders by status' })}${legend(sLeg)}</div>` : empty('No orders in this period')}</article>
<article class="card"><h3>Payment status <small>${esc(range.label)}</small></h3>${pay.length ? `<div class="dn">${donut({ data: pLeg, label: 'Orders by payment status', center: pay.reduce((a, b) => a + b.count, 0) })}${legend(pLeg)}</div><p class="fine">Cancelled orders excluded. An order is Paid only after staff record a verified payment.</p>` : empty('No orders in this period')}</article>
<article class="card"><h3>Weekly sales <small>Last 8 weeks (Mon to Sun)</small></h3>${barChart({ data: weekly.map(w => ({ label: dayLabel(w.key), title: 'Week of ' + w.key, value: w.sales })), fmt: aed, label: 'Weekly sales in AED, last 8 weeks' })}</article>
<article class="card"><h3>Monthly revenue <small>Last 12 months</small></h3>${barChart({ data: monthly.map(m => ({ label: m.key.slice(5) + '/' + m.key.slice(2, 4), title: m.key, value: m.sales })), fmt: aed, label: 'Monthly revenue in AED, last 12 months' })}</article>
</section>

<section class="cgrid">
<article class="card"><h3>Best-selling products <small>${esc(range.label)}</small></h3>${top.length ? `<ol class="rank">${top.slice(0, 8).map(p => `<li><span>${esc(p.name)}<small>${num(p.qty)} ${esc(p.unit || '')}</small></span><b>${aed(p.revenue)}</b></li>`).join('')}</ol>` : empty('No confirmed sales yet', 'Products appear here once orders are confirmed.')}</article>
${lowCard}
<article class="card wide2"><div class="chd"><h3>Recent orders</h3><a href="#/orders" class="lnk">View all orders</a></div>${recent.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th class="r">Total</th><th>Status</th></tr></thead><tbody>${recent.map(o => `<tr data-go="#/orders/${esc(o.orderId || o.id)}" tabindex="0"><td><b>${esc(o.orderId || o.id)}</b></td><td>${dt(S.tms(o))}</td><td>${esc((o.customer || {}).name)}</td><td class="r">${aed(o.total)}</td><td>${statusBadge(o.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('No orders yet', 'Orders placed on the website will appear here.')}</article>
</section>
${pending.length ? `<p class="fine">${icon('bell', 14)} ${pending.length} order${pending.length == 1 ? '' : 's'} waiting for confirmation: <a href="#/orders?s=pending" class="lnk">review now</a></p>` : ''}`;
  }
};
