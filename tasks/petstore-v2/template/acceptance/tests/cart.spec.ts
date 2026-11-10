import { test, expect } from '@playwright/test';
import { addToCart, applyCoupon, reset, setQty, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('totals, percent coupon and free shipping', async ({ page }) => {
  await addToCart(page, 'EST-1', 2); // 2 x $16.50 = $33.00
  await addToCart(page, 'EST-15'); //   1 x $125.50
  await page.goto('/cart');
  await expect(tid(page, 'cart-line-total-EST-1')).toHaveText('$33.00');
  await expect(tid(page, 'cart-subtotal')).toHaveText('$158.50');
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
  await expect(tid(page, 'cart-shipping')).toHaveText('$0.00');

  await applyCoupon(page, 'PET10'); // 3.30 + 12.55
  await expect(tid(page, 'coupon-applied')).toContainText('PET10');
  await expect(tid(page, 'cart-discount')).toHaveText('$15.85');
  await expect(tid(page, 'cart-shipping')).toHaveText('$0.00'); // net $142.65

  await tid(page, 'coupon-remove').click();
  await expect(tid(page, 'coupon-applied')).toHaveCount(0);
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
});

test('shipping applies under $100 net', async ({ page }) => {
  await addToCart(page, 'EST-6');
  await page.goto('/cart');
  await setQty(page, 'EST-6', 2);
  await expect(tid(page, 'cart-subtotal')).toHaveText('$11.00');
  await expect(tid(page, 'cart-shipping')).toHaveText('$9.99');
  await expect(tid(page, 'cart-count')).toHaveText('2');
});

test('unknown and expired coupons are rejected', async ({ page }) => {
  await addToCart(page, 'EST-1');
  await applyCoupon(page, 'NOPE');
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-applied')).toHaveCount(0);

  await applyCoupon(page, 'EXPIRED5');
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-applied')).toHaveCount(0);
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
});

test('empty cart', async ({ page }) => {
  await page.goto('/cart');
  await expect(tid(page, 'cart-empty')).toBeVisible();
  await expect(tid(page, 'checkout-button')).toHaveCount(0);
});
