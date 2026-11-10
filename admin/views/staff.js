// Staff (owner only): create sign-ins, assign roles, deactivate. The rules also restrict this to the owner.
import { ROLES } from '../perms.js';
import { esc, dt, empty, openModal, closeModal, toast, $ } from '../ui.js';
const ASSIGN = ['manager', 'sales', 'inventory', 'viewer'];
const DESC = { owner: 'Everything, including staff and all settings', manager: 'Everything except Staff', sales: 'Orders (status only), customers, products view', inventory: 'Products, categories, stock', viewer: 'View only: overview, orders, payments, stock, expenses, reports' };
export function validateStaff(v) {
  if (!/^([^\s@]+@[^\s@]+\.[^\s@]{2,}|[a-z0-9._-]{3,30})$/i.test(v.email || '')) return 'Enter a username (letters and numbers, 3 or more) or a valid email address.';
  if (!ASSIGN.includes(v.role)) return 'Choose a role.';
  if (!v.password || v.password.length < 8) return 'The password must be at least 8 characters.';
  if (v.password !== v.password2) return 'The two passwords do not match.';
  if ((v.name || '').length > 60) return 'The name is too long.';
  return '';
}
export const loginEmail = v => v.includes('@') ? v : v + '@coccinelle-admin.com';
let loaded = false;
function addForm(ctx) {
  const m = openModal(`<h2>Add staff member</h2><form id="tf" class="fgrid" novalidate><label>Name<input id="tn" maxlength="60"></label><label>Username or email (their sign-in) *<input id="te" autocomplete="off" autocapitalize="none"></label>
<label>Role *<select id="tr">${ASSIGN.map(r => `<option value="${r}">${esc(ROLES[r])}</option>`).join('')}</select></label><label>Temporary password *<input id="tp" type="password" autocomplete="new-password"></label><label>Repeat password *<input id="tp2" type="password" autocomplete="new-password"></label>
<p class="fine full" id="td">${esc(DESC.manager)}</p><p class="fine full">Share the password privately. They can change it with "Forgot password" later, or you can send a reset email from this page.</p><p class="er full" id="tx" role="alert"></p><div class="row full"><button class="btn" id="ts" type="submit">Create account</button><button class="btn ghost" type="button" data-close-modal>Cancel</button></div></form>`, { label: 'Add staff' });
  $('#tr', m).addEventListener('change', e => $('#td', m).textContent = DESC[e.target.value]);
  $('#tf', m).addEventListener('submit', async e => {
    e.preventDefault(); const v = { name: $('#tn', m).value.trim(), email: loginEmail($('#te', m).value.trim().toLowerCase()), role: $('#tr', m).value, password: $('#tp', m).value, password2: $('#tp2', m).value }, err = validateStaff(v);
    if (err) return $('#tx', m).textContent = err; const b = $('#ts', m); b.disabled = true;
    try { await ctx.api.addStaff(v); closeModal(); toast('Staff account created.'); ctx.rerender(); } catch (x) { $('#tx', m).textContent = /email-already-in-use/.test(x.code || x.message) ? 'That email already has an account. Ask the owner to add it from the Firebase Console, or use another email.' : ctx.api.errorText(x); b.disabled = false; }
  });
}
export default {
  id: 'staff', title: 'Staff',
  render(root, ctx) {
    if (!loaded) { loaded = true; ctx.api.loadStaff().then(() => ctx.rerender()); }
    const list = ctx.staff.slice().sort((a, b) => (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || (a.email || '').localeCompare(b.email || '')), me = ctx.user.uid;
    root.innerHTML = `${ctx.staffError ? `<div class="note warn"><b>Staff could not be loaded.</b> ${esc(ctx.staffError)}</div>` : ''}
<div class="note"><b>Roles:</b> ${Object.keys(DESC).map(k => `${esc(ROLES[k] || k)}: ${esc(DESC[k])}`).join(' · ')}. These limits are enforced by the database rules, not only hidden in the screen.</div>
<div class="bar2"><span class="fine">${list.length} accounts</span><span class="sp"></span><button class="btn" id="tadd">+ Add staff member</button></div>
${list.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th class="hs">Added</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td><b>${esc(a.name || a.email || a.id)}</b><small>${esc(a.email || a.id)}${a.id === me ? ' · you' : ''}</small></td><td>${a.id === me || a.role === 'owner' ? `<b>${esc(ROLES[a.role] || a.role)}</b>` : `<select data-role="${esc(a.id)}" aria-label="Role for ${esc(a.email)}">${['owner', ...ASSIGN].filter(r => r !== 'owner' || a.role === 'owner').map(r => `<option value="${r}"${a.role === r ? ' selected' : ''}>${esc(ROLES[r])}</option>`).join('')}</select>`}</td><td>${a.active === false ? '<span class="bd st-cancelled">Deactivated</span>' : '<span class="bd st-delivered">Active</span>'}</td><td class="hs">${a.createdAt && a.createdAt.toMillis ? dt(a.createdAt.toMillis()) : '-'}</td><td class="r">${a.id === me || a.role === 'owner' ? '' : `<button class="btn ghost sm" data-act="${esc(a.id)}">${a.active === false ? 'Reactivate' : 'Deactivate'}</button> <button class="btn ghost sm" data-rs="${esc(a.email || '')}">Send password reset</button>`}</td></tr>`).join('')}</tbody></table></div>` : empty('No staff loaded', 'Your own owner account appears here once the rules are published.')}
<p class="fine">You cannot change or deactivate your own account here, so you can never lock yourself out. Deactivated staff stay in this list and cannot sign in to the dashboard.</p>`;
    root.onclick = async e => {
      if (e.target.closest('#tadd')) return addForm(ctx);
      const act = e.target.closest('[data-act]'); if (act) { const a = ctx.staff.find(x => x.id === act.dataset.act); try { await ctx.api.updateStaff(a.id, { active: a.active === false }); toast(a.active === false ? 'Reactivated.' : 'Deactivated.'); ctx.rerender(); } catch (x) { toast(ctx.api.errorText(x), 'err'); } return; }
      const rs = e.target.closest('[data-rs]'); if (rs && rs.dataset.rs) { try { await ctx.api.resetPassword(rs.dataset.rs); toast('Password reset email sent.'); } catch (x) { toast(ctx.api.errorText(x), 'err'); } }
    };
    root.onchange = async e => { const s = e.target.closest('[data-role]'); if (!s) return; try { await ctx.api.updateStaff(s.dataset.role, { role: s.value }); toast('Role updated.'); } catch (x) { toast(ctx.api.errorText(x), 'err'); ctx.rerender(); } };
  }
};
