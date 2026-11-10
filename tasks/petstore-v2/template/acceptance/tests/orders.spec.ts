import { test, expect } from '@playwright/test';
import {
  addToCart, events, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, setQty,
  signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('placing an order reserves stock immediately', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-19'); // stock 1, $158.50
  await openCheckout(page);
  await placeOrder(page);
  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');
});

test('cancelling a pending order releases its reservation', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14'); // stock 3, $650.00
  await page.goto('/cart');
  await setQty(page, 'EST-14', 3);
  await openCheckout(page);
  // net $1,950.00, free shipping, MA tax 121.875 -> $121.88
  await expect(tid(page, 'checkout-total')).toHaveText('$2,071.88');
  const id = await placeOrder(page);

  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');

  await page.goto(`/orders/${id}`);
  await tid(page, 'cancel-order').click();
  await expect(tid(page, 'order-status')).toHaveText('CANCELLED');
  expect(await events(page)).toEqual(['PLACED', 'CANCELLED']);
  await expect(tid(page, 'cancel-order')).toHaveCount(0);

  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 3 left');
});

test('large order waits for the admin, approval turns it into a sale', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-14');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-total')).toHaveText('$690.63'); // 650 + 40.625 -> 40.63

  await page.waitForTimeout(11_000);
  await page.reload();
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await tid(page, 'admin-link').click();
  await tid(page, `admin-approve-${id}`).click();
  await expect(tid(page, `admin-order-${id}`)).toHaveCount(0);
  await expectStatus(page, id, 'APPROVED');
  expect(await events(page)).toEqual(['PLACED', 'APPROVED']);

  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 2 left');
});
