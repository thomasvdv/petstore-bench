import { test, expect, type Page } from '@playwright/test';
import {
  addToCart, applyCoupon, events, expectStatus, newUser, openCheckout, placeOrder, registerOk,
  reset, setQty, signIn, signOut, tid, type User,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

async function refund(page: Page, orderId: string, qty: Record<string, number>) {
  await page.goto(`/admin/orders/${orderId}`);
  for (const [itemId, k] of Object.entries(qty)) {
    await tid(page, `refund-qty-${itemId}`).fill(String(k));
  }
  await tid(page, 'refund-submit').click();
}

async function asAdmin(page: Page) {
  await signOut(page);
  await signIn(page, 'admin', 'admin123');
}

test('partial then full refund, with tax and no shipping', async ({ page }) => {
  const u: User = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-6'); // $5.50
  await addToCart(page, 'EST-1'); // $16.50
  await page.goto('/cart');
  await setQty(page, 'EST-6', 4);
  await openCheckout(page);
  // subtotal $38.50 + shipping $9.99 + MA tax 240.625c -> $2.41
  await expect(tid(page, 'checkout-total')).toHaveText('$50.90');
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
  await expect(tid(page, 'cancel-order')).toHaveCount(0);

  await asAdmin(page);
  await page.goto(`/admin/orders/${id}`);
  await expect(tid(page, 'refund-remaining-EST-6')).toHaveText('4');

  // 2 of 4 EST-6: net $11.00 + tax 68.75c -> $0.69
  await refund(page, id, { 'EST-6': 2, 'EST-1': 0 });
  await expectStatus(page, id, 'PARTIALLY_REFUNDED');
  await expect(tid(page, 'order-refunded')).toHaveText('$11.69');

  // Over-refund is rejected as a whole.
  await refund(page, id, { 'EST-6': 3, 'EST-1': 1 });
  await expect(tid(page, 'refund-error')).toBeVisible();
  await expect(tid(page, 'refund-remaining-EST-6')).toHaveText('2');
  await expect(tid(page, 'refund-remaining-EST-1')).toHaveText('1');

  // The rest: $11.69 + EST-1 $16.50 + tax 103.125c -> $1.03
  await refund(page, id, { 'EST-6': 2, 'EST-1': 1 });
  await expectStatus(page, id, 'REFUNDED');
  await expect(tid(page, 'order-refunded')).toHaveText('$40.91');
  expect(await events(page)).toEqual(['PLACED', 'APPROVED', 'REFUNDED', 'REFUNDED']);

  await signOut(page);
  await signIn(page, u.username, u.password);
  await page.goto(`/orders/${id}`);
  await expect(tid(page, 'order-refunded')).toHaveText('$40.91');
});

test('fixed coupon is split across lines for refunds', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); //  $418.50
  await addToCart(page, 'EST-15'); // $125.50
  await applyCoupon(page, 'BIG50');
  await openCheckout(page);
  // net $494.00, free shipping, MA tax 3087.5c -> $30.88
  await expect(tid(page, 'checkout-total')).toHaveText('$524.88');
  const id = await placeOrder(page);

  await asAdmin(page);
  await page.goto('/admin');
  await tid(page, `admin-approve-${id}`).click();
  await expectStatus(page, id, 'APPROVED');

  // EST-15 share of $50: 5000 * 12550 / 54400 = 1153.49c -> $11.53, net $113.97
  // tax 712.3125c -> $7.12, refund $121.09
  await refund(page, id, { 'EST-15': 1, 'EST-8': 0 });
  await expectStatus(page, id, 'PARTIALLY_REFUNDED');
  await expect(tid(page, 'order-refunded')).toHaveText('$121.09');
});

test('refunded units go back to stock', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-19'); // stock 1
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');

  await asAdmin(page);
  await refund(page, id, { 'EST-19': 1 });
  await expectStatus(page, id, 'REFUNDED');
  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Only 1 left');
});

test('refund pages are admin only, orders are private', async ({ browser, page }) => {
  await registerOk(page, newUser('own'));
  await addToCart(page, 'EST-1');
  await openCheckout(page);
  const id = await placeOrder(page);

  await page.goto(`/admin/orders/${id}`);
  await expect(tid(page, 'forbidden')).toBeVisible();
  await expect(tid(page, 'refund-submit')).toHaveCount(0);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await registerOk(other, newUser('peek'));
  await other.goto(`/orders/${id}`);
  await expect(other.getByTestId('order-total')).toHaveCount(0);
  await ctx.close();
});
