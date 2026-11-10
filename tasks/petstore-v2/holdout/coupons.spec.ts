import { test, expect } from '@playwright/test';
import {
  addToCart, applyCoupon, newUser, openCheckout, placeOrder, registerOk, reset, setQty, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('category coupon discounts only that category', async ({ page }) => {
  await addToCart(page, 'EST-1'); //  Angelfish (FISH) $16.50
  await addToCart(page, 'EST-15'); // Chihuahua (DOGS) $125.50
  await applyCoupon(page, 'fish20'); // case-insensitive
  await expect(tid(page, 'coupon-applied')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$3.30');
});

test('percent discount rounds per line, half up', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-7'); //  $5.29
  await addToCart(page, 'EST-16'); // $155.29
  await page.goto('/cart');
  await setQty(page, 'EST-7', 5); //  $26.45 -> 10% = 264.5c -> $2.65
  await setQty(page, 'EST-16', 5); // $776.45 -> 10% = 7764.5c -> $77.65
  await expect(tid(page, 'cart-subtotal')).toHaveText('$802.90');
  await applyCoupon(page, 'PET10');
  await expect(tid(page, 'cart-discount')).toHaveText('$80.30'); // not $80.29
  await openCheckout(page);
  // net $722.60, free shipping, MA tax 4516.25c -> $45.16
  await expect(tid(page, 'checkout-tax')).toHaveText('$45.16');
  await expect(tid(page, 'checkout-total')).toHaveText('$767.76');
});

test('once-per-user coupon needs sign-in and works once', async ({ page }) => {
  await addToCart(page, 'EST-8'); // $418.50
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-error')).toBeVisible(); // signed out

  await registerOk(page, newUser());
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-applied')).toContainText('BIG50');
  await expect(tid(page, 'cart-discount')).toHaveText('$50.00');
  await openCheckout(page);
  // net $368.50, free shipping, MA tax 2303.125c -> $23.03
  await expect(tid(page, 'checkout-total')).toHaveText('$391.53');
  await placeOrder(page);

  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
});

test('coupon is dropped when the cart no longer qualifies', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-1');
  await applyCoupon(page, 'BIG50'); // subtotal $435.00
  await expect(tid(page, 'coupon-applied')).toBeVisible();
  await tid(page, 'cart-remove-EST-8').click(); // subtotal $16.50 < $300
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-applied')).toHaveCount(0);
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
  await expect(tid(page, 'cart-shipping')).toHaveText('$9.99');
});
