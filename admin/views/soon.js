// Sections that are planned but not built yet. They show what is coming and never show sample numbers.
import { esc, icon } from '../ui.js';
const PLAN = {
  analytics: ['Sales & Analytics', 'M6', ['Daily, weekly, monthly and yearly sales', 'Product-wise and category-wise sales', 'Best sellers and slow movers', 'Revenue, order and customer trends', 'Period comparisons']],
  categories: ['Categories', 'M4', ['Edit category names and order', 'Change each category photo without editing code', 'Show or hide a category']],
  inventory: ['Inventory & Stock', 'M4', ['SKU, stock quantity, purchase and selling price', 'Stock received, sold, damaged and expired', 'Adjustments and full stock history', 'Low-stock and out-of-stock alerts']],
  offers: ['Offers & Promotions', 'M4', ['Deal of the day schedule', 'Percentage and amount discounts', 'Delivery fee and minimum order settings']],
  reports: ['Reports & Excel', 'M6', ['14 downloadable reports in Excel (.xlsx), CSV and print-to-PDF', 'Date filters, totals and clear headings']],
  expenses: ['Expenses & Profit', 'M5', ['Record rent, electricity, salaries, delivery and other costs', 'Gross sales, net sales, cost of goods, gross profit, net profit', 'Clear warnings when purchase prices are missing, so profit is never overstated']],
  staff: ['Staff', 'M5', ['Add staff and choose a role: Manager, Sales, Inventory or Report Viewer', 'Deactivate accounts instantly']],
  settings: ['Store Settings', 'M5', ['Store name, contact, WhatsApp number, address, opening hours', 'Delivery fee, minimum order, discounts and tax', 'One source of truth for the website and dashboard']],
  audit: ['Activity Log', 'M5', ['Who changed what and when', 'Order, payment, product and settings changes']]
};
export const soonView = id => ({
  id, title: PLAN[id][0],
  render(root) {
    const [t, m, items] = PLAN[id];
    root.innerHTML = `<div class="card soon"><span class="bd">${icon('clock', 14)} Coming in milestone ${esc(m)}</span><h2>${esc(t)}</h2><p>This section is not built yet. When it is, it will include:</p><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><p class="fine">Nothing is shown here until it works with real data.</p></div>`;
  }
});
