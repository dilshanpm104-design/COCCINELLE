// Activity Log: the latest 300 saved staff actions. Entries cannot be edited or deleted (the rules forbid it).
import * as S from '../stats.js';
import { esc, dt, empty, download, stamp, icon, debounce, $ } from '../ui.js';
const Q = { q: '', action: '' };
export const filterAudit = (list, f) => { const q = f.q.trim().toLowerCase(); return list.filter(a => (!f.action || (a.action || '').split('.')[0] === f.action) && (!q || [a.email, a.action, a.target, a.detail].join(' ').toLowerCase().includes(q))); };
let loaded = false;
export default {
  id: 'audit', title: 'Activity Log',
  render(root, ctx) {
    if (!loaded) { loaded = true; ctx.api.loadAudit().then(() => ctx.rerender()); }
    const rows = filterAudit(ctx.audit, Q), groups = [...new Set(ctx.audit.map(a => (a.action || '').split('.')[0]).filter(Boolean))].sort();
    root.innerHTML = `${ctx.auditError ? `<div class="note warn"><b>The activity log could not be loaded.</b> ${esc(ctx.auditError)}</div>` : ''}
<div class="note">Every important change made in this dashboard is recorded here with who did it and when: status changes, payments, product and stock edits, price rules, staff changes and exports. Entries cannot be edited or deleted. Shows the latest 300.</div>
<div class="bar2"><div class="srch">${icon('search', 16)}<input id="aq" type="search" placeholder="Search staff, action, target" value="${esc(Q.q)}" aria-label="Search activity"></div><select id="aa" aria-label="Filter by action"><option value="">All actions</option>${groups.map(g => `<option${Q.action === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select><span class="sp"></span><button class="btn ghost" id="acsv">${icon('download', 16)} CSV</button><button class="btn ghost" id="arf">Refresh</button></div>
${rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>When</th><th>Staff</th><th class="hs">Role</th><th>Action</th><th>Target</th><th class="hs">Detail</th></tr></thead><tbody>${rows.map(a => `<tr><td>${dt(a.at)}</td><td>${esc(a.email)}</td><td class="hs">${esc(a.role)}</td><td><b>${esc(a.action)}</b></td><td>${esc(a.target)}</td><td class="hs">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>` : empty(ctx.audit.length ? 'No entries match' : 'No activity yet', ctx.audit.length ? 'Clear the search or action filter.' : 'Actions appear here as soon as staff make changes.')}`;
    root.onclick = async e => { if (e.target.closest('#arf')) { await ctx.api.loadAudit(); ctx.rerender(); } if (e.target.closest('#acsv')) download(`coccinelle-activity-${stamp()}.csv`, S.toCSV(rows, [{ label: 'When (Dubai)', get: a => new Date(a.at + S.TZ_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) }, { label: 'Staff', get: a => a.email }, { label: 'Role', get: a => a.role }, { label: 'Action', get: a => a.action }, { label: 'Target', get: a => a.target }, { label: 'Detail', get: a => a.detail }])); };
    $('#aq', root).addEventListener('input', debounce(e => { Q.q = e.target.value; ctx.rerender('aq'); })); $('#aa', root).addEventListener('change', e => { Q.action = e.target.value; ctx.rerender(); });
  }
};
