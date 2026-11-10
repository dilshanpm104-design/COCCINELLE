// Reports & Excel: 14 reports shown on screen, then exported as Excel (.xlsx), CSV or printed / saved as PDF through the browser.
import * as S from '../stats.js';
import * as K from '../stock.js';
import { REPORTS, forRole, reportById, csvCols, asSheet } from '../reports.js';
import { buildXlsx } from '../xlsx.js';
import { esc, num, empty, download, stamp, icon, $ } from '../ui.js';

let sel = 'daily-sales';
const fmtCell = (v, c) => v === '' || v == null ? '' : typeof v === 'number' ? (c.fmt === 'money' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : c.fmt === 'pct' ? (v * 100).toFixed(1) + '%' : num(v)) : esc(v);
const data = ctx => ({ orders: ctx.orders, payments: ctx.payments, products: ctx.products, categories: ctx.categories, inventory: ctx.inventory, expenses: ctx.expenses, audit: ctx.audit, now: ctx.now(), customerDocs: ctx.customerDocs });
const loadedKey = new Set();
export default {
  id: 'reports', title: 'Reports & Excel', usesRange: true,
  render(root, ctx) {
    const list = forRole(ctx.role); if (!list.some(x => x.id === sel)) sel = list[0].id;
    const rep = reportById(sel); if (rep.needs.includes('audit') && !loadedKey.has('audit')) { loadedKey.add('audit'); ctx.api.loadAudit().then(() => ctx.rerender()); }
    const out = rep.build(data(ctx), ctx.range), can = ctx.can('export.reports'), big = out.rows.length > 500;
    root.innerHTML = `<div class="two rep"><article class="card"><h3>Reports</h3><ul class="rl">${list.map(x => `<li><button class="rb${x.id === sel ? ' on' : ''}" data-rep="${x.id}"><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></button></li>`).join('')}</ul></article>
<article class="card"><div class="chh"><h3>${esc(rep.title)} <small>${num(out.rows.length)} rows</small></h3>${can ? `<div class="row"><button class="btn" id="rpx">${icon('download', 16)} Excel</button><button class="btn ghost" id="rpc">CSV</button><button class="btn ghost" id="rpp">${icon('print', 16)} Print / PDF</button></div>` : ''}</div>
${out.notes.filter(Boolean).map(n => `<p class="fine">${esc(n)}</p>`).join('')}${out.rows.length ? `<div class="tw"><table class="tbl"><thead><tr>${out.cols.map(c => `<th${c.fmt ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${out.rows.slice(0, 500).map(r => `<tr>${r.map((v, i) => `<td${out.cols[i].fmt ? ' class="r"' : ''}>${fmtCell(v, out.cols[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${big ? `<p class="fine">The screen shows the first 500 rows. Excel and CSV contain all ${num(out.rows.length)}.</p>` : ''}` : empty('No data for this report', 'Choose another period at the top, or add the missing records first.')}</article></div>`;
    root.onclick = e => {
      const b = e.target.closest('[data-rep]'); if (b) { sel = b.dataset.rep; return ctx.rerender(); }
      const tag = `${rep.id}-${stamp()}`;
      if (e.target.closest('#rpx')) { const bytes = buildXlsx([asSheet(out, rep.title)]); download(`coccinelle-${tag}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); ctx.api.audit('export', rep.id, `xlsx ${out.rows.length} rows`); }
      if (e.target.closest('#rpc')) { download(`coccinelle-${tag}.csv`, S.toCSV(out.rows, csvCols(out)), 'text/csv;charset=utf-8'); ctx.api.audit('export', rep.id, `csv ${out.rows.length} rows`); }
      if (e.target.closest('#rpp')) {
        $('#print').innerHTML = `<h1>COCCINELLE Supermarket</h1><p>The Commons, Mirdif, Dubai</p><h2>${esc(rep.title)}</h2>${out.notes.filter(Boolean).map(n => `<p>${esc(n)}</p>`).join('')}<table><thead><tr>${out.cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${out.rows.map(r => `<tr>${r.map((v, i) => `<td${out.cols[i].fmt ? ' style="text-align:right"' : ''}>${fmtCell(v, out.cols[i])}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Printed ${new Date(ctx.now() + S.TZ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ')} Dubai time</p>`;
        document.body.classList.add('printing'); window.print(); setTimeout(() => { document.body.classList.remove('printing'); $('#print').innerHTML = ''; }, 500); ctx.api.audit('export', rep.id, 'print');
      }
    };
  }
};
