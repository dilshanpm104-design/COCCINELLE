// Role permissions for the dashboard UI. The UI only HIDES things for convenience;
// the real enforcement is in firestore.rules (keep the two in step - see tests/perms.test.mjs).
export const ROLES = { owner: 'Owner / Super Admin', manager: 'Manager', sales: 'Sales Staff', inventory: 'Inventory Staff', viewer: 'Report Viewer', staff: 'Staff (legacy)' };

// Sections in sidebar order. `roles` = who can open the section.
export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'grid', roles: ['owner', 'manager', 'viewer'] },
  { id: 'analytics', label: 'Sales & Analytics', icon: 'chart', roles: ['owner', 'manager', 'viewer'] },
  { id: 'orders', label: 'Orders', icon: 'bag', roles: ['owner', 'manager', 'sales', 'viewer'] },
  { id: 'customers', label: 'Customers / CRM', icon: 'users', roles: ['owner', 'manager', 'sales'] },
  { id: 'payments', label: 'Payments', icon: 'card', roles: ['owner', 'manager', 'sales', 'viewer'] },
  { id: 'products', label: 'Products', icon: 'box', roles: ['owner', 'manager', 'inventory', 'sales', 'staff'] },
  { id: 'categories', label: 'Categories', icon: 'tag', roles: ['owner', 'manager', 'inventory'] },
  { id: 'inventory', label: 'Inventory & Stock', icon: 'stack', roles: ['owner', 'manager', 'inventory', 'viewer'] },
  { id: 'offers', label: 'Offers & Promotions', icon: 'spark', roles: ['owner', 'manager'] },
  { id: 'reports', label: 'Reports & Excel', icon: 'file', roles: ['owner', 'manager', 'viewer'] },
  { id: 'expenses', label: 'Expenses & Profit', icon: 'coin', roles: ['owner', 'manager', 'viewer'] },
  { id: 'staff', label: 'Staff', icon: 'shield', roles: ['owner'] },
  { id: 'settings', label: 'Store Settings', icon: 'cog', roles: ['owner', 'manager'] },
  { id: 'audit', label: 'Activity Log', icon: 'clock', roles: ['owner', 'manager'] }
];

// Single actions (buttons) and who may use them.
export const ACTIONS = {
  'orders.updateStatus': ['owner', 'manager', 'sales'],
  'orders.verifyTotals': ['owner', 'manager'],
  'payments.record': ['owner', 'manager'],
  'customers.editNotes': ['owner', 'manager', 'sales'],
  'products.edit': ['owner', 'manager', 'inventory', 'staff'],
  'categories.edit': ['owner', 'manager', 'inventory'],
  'inventory.edit': ['owner', 'manager', 'inventory'],
  'offers.edit': ['owner', 'manager'],
  'expenses.edit': ['owner', 'manager'],
  'expenses.delete': ['owner'],
  'staff.manage': ['owner'],
  'settings.edit': ['owner', 'manager'],
  'settings.contact': ['owner'],
  'export.reports': ['owner', 'manager', 'viewer'],
  'export.inventory': ['owner', 'manager', 'inventory', 'viewer'],
  'export.orders': ['owner', 'manager', 'viewer'],
  'export.customers': ['owner', 'manager'],
  'export.payments': ['owner', 'manager', 'viewer']
};
export const canSee = (role, section) => { const s = SECTIONS.find(x => x.id === section); return !!s && s.roles.includes(role); };
export const can = (role, action) => (ACTIONS[action] || []).includes(role);
export const firstSection = role => (SECTIONS.find(s => s.roles.includes(role)) || {}).id || null;
