import { test, expect } from '@playwright/test';
import {
  addToCart, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, setQty, signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('a reservation holds stock without decrementing on-hand warehouse stock', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14'); // stock BOS 2 + NJ 1
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-14')).toHaveText('2');
  await expect(tid(page, 'warehouse-stock-NJ-EST-14')).toHaveText('1');

  await page.goto('/admin');
  await tid(page, `admin-approve-${id}`).click();
  await expectStatus(page, id, 'APPROVED');
  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-14')).toHaveText('1');
  await expect(tid(page, 'warehouse-stock-NJ-EST-14')).toHaveText('1');
});

test('allocation exhausts the lower warehouse id and refunds return there first', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // stock BOS 6 + NJ 4
  await page.goto('/cart');
  await setQty(page, 'EST-8', 8);
  await expect(tid(page, 'cart-subtotal')).toHaveText('$3,348.00');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await tid(page, `admin-approve-${id}`).click();
  await expectStatus(page, id, 'APPROVED');

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-8')).toHaveText('0');
  await expect(tid(page, 'warehouse-stock-NJ-EST-8')).toHaveText('2');

  await page.goto(`/admin/orders/${id}`);
  await tid(page, 'refund-qty-EST-8').fill('8');
  await tid(page, 'refund-submit').click();
  await expectStatus(page, id, 'REFUNDED');

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-8')).toHaveText('6');
  await expect(tid(page, 'warehouse-stock-NJ-EST-8')).toHaveText('4');
  await page.goto('/item/EST-8');
  await expect(tid(page, 'item-stock')).toHaveText('In stock');
});

test('warehouse stock is admin only', async ({ browser, page }) => {
  await registerOk(page, newUser());
  await page.goto('/admin/warehouses');
  await expect(tid(page, 'forbidden')).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto('/admin/warehouses');
  await expect(other).toHaveURL(/\/signin/);
  await ctx.close();
});
