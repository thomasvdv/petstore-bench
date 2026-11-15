import { test, expect } from '@playwright/test';
import {
  addToCart, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('refunds use the order price snapshot after an admin price change', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-19'); // $158.50, stock 1
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
  await expect(tid(page, 'order-total')).toHaveText('$168.41');
  await expect(tid(page, 'order-line-price-EST-19')).toHaveText('$158.50');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin/items');
  await tid(page, 'admin-item-price-EST-19').fill('200.00');
  await tid(page, 'admin-item-save-EST-19').click();
  await expect(tid(page, 'admin-item-saved-EST-19')).toBeVisible();

  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-price')).toHaveText('$200.00');

  // The admin may view the order page (spec section 9); it shows the stored unit price.
  await page.goto(`/orders/${id}`);
  await expect(tid(page, 'order-line-price-EST-19')).toHaveText('$158.50');

  await page.goto(`/admin/orders/${id}`);
  await tid(page, 'refund-qty-EST-19').fill('1');
  await tid(page, 'refund-submit').click();

  await expectStatus(page, id, 'REFUNDED');
  // Old net $158.50 + old tax $9.91. The new $200 price would refund $212.50.
  await expect(tid(page, 'order-refunded')).toHaveText('$168.41');
  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Only 1 left');
});

test('price editing is admin only and rejects invalid prices', async ({ browser, page }) => {
  await registerOk(page, newUser());
  await page.goto('/admin/items');
  await expect(tid(page, 'forbidden')).toBeVisible();

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin, 'admin', 'admin123');
  await admin.goto('/admin/items');
  await tid(admin, 'admin-item-price-EST-1').fill('1.234');
  await tid(admin, 'admin-item-save-EST-1').click();
  await expect(tid(admin, 'admin-item-error')).toBeVisible();

  await admin.goto('/item/EST-1');
  await expect(tid(admin, 'item-price')).toHaveText('$16.50');
  await ctx.close();
});
