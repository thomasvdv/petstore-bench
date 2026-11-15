import { test, expect } from '@playwright/test';
import {
  addToCart, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, setQty, signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('admin sees per-warehouse stock', async ({ page }) => {
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await expect(tid(page, 'admin-warehouses-link')).toBeVisible();

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-14')).toHaveText('2');
  await expect(tid(page, 'warehouse-stock-NJ-EST-14')).toHaveText('1');
});

test('approval and refund move the allocated warehouse stock', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14');
  await page.goto('/cart');
  await setQty(page, 'EST-14', 3);
  await expect(tid(page, 'cart-subtotal')).toHaveText('$1,950.00');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await tid(page, `admin-approve-${id}`).click();
  await expectStatus(page, id, 'APPROVED');

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-14')).toHaveText('0');
  await expect(tid(page, 'warehouse-stock-NJ-EST-14')).toHaveText('0');

  await page.goto(`/admin/orders/${id}`);
  await tid(page, 'refund-qty-EST-14').fill('1');
  await tid(page, 'refund-submit').click();
  await expectStatus(page, id, 'PARTIALLY_REFUNDED');

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-14')).toHaveText('1');
  await expect(tid(page, 'warehouse-stock-NJ-EST-14')).toHaveText('0');
  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 1 left');
});
