import { test, expect } from '@playwright/test';
import {
  addToCart, advanceTime, applyCoupon, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset,
  signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('stacked discounts cap at the line total and tie-break by code', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // $418.50

  await applyCoupon(page, 'MEGA90'); // 90% = $376.65
  await applyCoupon(page, 'PET10'); // 10% = $41.85; together exactly the line total
  await applyCoupon(page, 'VIP20'); // 20% = $83.70; also caps, but the smaller code list wins

  await expect(tid(page, 'cart-subtotal')).toHaveText('$418.50');
  await expect(tid(page, 'cart-discount')).toHaveText('$418.50');
  await expect(tid(page, 'coupon-selected-MEGA90')).toBeVisible();
  await expect(tid(page, 'coupon-selected-PET10')).toBeVisible();
  await expect(tid(page, 'coupon-selected-VIP20')).toHaveCount(0);
  await expect(tid(page, 'coupon-applied')).toContainText('MEGA90, PET10');
  await expect(tid(page, 'cart-shipping')).toHaveText('$9.99');
});

test('a stacked order stores the combined line discounts for refunds', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // $418.50
  await addToCart(page, 'EST-15'); // $125.50

  await applyCoupon(page, 'SAVE15');
  await applyCoupon(page, 'PET10');
  await applyCoupon(page, 'VIP20');
  await expect(tid(page, 'cart-discount')).toHaveText('$244.81');

  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
  await expect(tid(page, 'order-total')).toHaveText('$317.89');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto(`/admin/orders/${id}`);
  await tid(page, 'refund-qty-EST-8').fill('1');
  await tid(page, 'refund-submit').click();
  await expectStatus(page, id, 'PARTIALLY_REFUNDED');
  // EST-8 net 418.50 - (62.78 + 41.85 + 83.70) = 230.17; tax 14.385625 -> 14.39.
  await expect(tid(page, 'order-refunded')).toHaveText('$244.56');

  await page.goto(`/admin/orders/${id}`);
  await tid(page, 'refund-qty-EST-15').fill('1');
  await tid(page, 'refund-submit').click();
  await expectStatus(page, id, 'REFUNDED');
  await expect(tid(page, 'order-refunded')).toHaveText('$317.89');
});

test('a stacked order consumes only the once-per-user coupon', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');
  await applyCoupon(page, 'VIP20');
  await applyCoupon(page, 'PET10');

  await openCheckout(page);
  await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });

  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'VIP20');
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-chip-VIP20')).toHaveCount(0);

  await applyCoupon(page, 'PET10');
  await expect(tid(page, 'coupon-selected-PET10')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$41.85');
});

test('removing a line drops a coupon that no longer meets its minimum', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');
  await applyCoupon(page, 'BIG50');
  await applyCoupon(page, 'SAVE15');
  await expect(tid(page, 'coupon-selected-SAVE15')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$81.61');

  await page.goto('/cart');
  await tid(page, 'cart-remove-EST-8').click();
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-chip-BIG50')).toHaveCount(0);
  await expect(tid(page, 'coupon-selected-SAVE15')).toBeVisible();
  await expect(tid(page, 'cart-subtotal')).toHaveText('$125.50');
  await expect(tid(page, 'cart-discount')).toHaveText('$18.83');
});

test('a fixed coupon stacks with percent coupons', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');
  await applyCoupon(page, 'BIG50');
  await applyCoupon(page, 'PET10');
  await applyCoupon(page, 'VIP20');

  // BIG50 splits 38.47 / 11.53; PET10 41.85 / 12.55; VIP20 83.70 / 25.10.
  await expect(tid(page, 'cart-discount')).toHaveText('$213.20');
  await expect(tid(page, 'coupon-selected-BIG50')).toBeVisible();
  await expect(tid(page, 'coupon-selected-PET10')).toBeVisible();
  await expect(tid(page, 'coupon-selected-VIP20')).toBeVisible();
});

test('coupon validity uses the business clock UTC date', async ({ page, request }) => {
  await reset(request, { now: '2026-01-15T23:59:00Z' });
  await addToCart(page, 'EST-1');
  await applyCoupon(page, 'EXPIRING5');
  await expect(tid(page, 'coupon-selected-EXPIRING5')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$0.83');

  await advanceTime(request, 61);
  await page.reload();
  // Reloading is not a cart change, so the spec does not require the code to leave
  // the entered list (its chip may stay) or a coupon-error. An expired coupon is
  // invalid, though, so it must not be selected and must stop discounting.
  await expect(tid(page, 'coupon-selected-EXPIRING5')).toHaveCount(0);
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
});
