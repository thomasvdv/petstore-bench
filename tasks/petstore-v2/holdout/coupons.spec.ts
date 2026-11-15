import { test, expect } from '@playwright/test';
import {
  addToCart, applyCoupon, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, setQty,
  signIn, tid,
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
  await expect(tid(page, 'cart-subtotal')).toHaveText('$181.74');
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

test('a coupon that would discount nothing is rejected', async ({ page }) => {
  await addToCart(page, 'EST-15'); // Chihuahua, DOGS
  await applyCoupon(page, 'FISH20');
  await expect(tid(page, 'coupon-error')).toBeVisible();
  await expect(tid(page, 'coupon-applied')).toHaveCount(0);
  await expect(tid(page, 'cart-discount')).toHaveText('$0.00');
});

test('a cancelled order does not consume a once-per-user coupon', async ({ page, request }) => {
  await reset(request);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // $418.50
  await addToCart(page, 'EST-15'); // $125.50
  await applyCoupon(page, 'BIG50');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expectStatus(page, id, 'PENDING');

  await page.goto(`/orders/${id}`);
  await tid(page, 'cancel-order').click();
  await expect(tid(page, 'order-status')).toHaveText('CANCELLED');

  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-applied')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$50.00');
});

test('a denied order does not consume a once-per-user coupon', async ({ page, browser, request }) => {
  await reset(request);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');
  await applyCoupon(page, 'BIG50');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expectStatus(page, id, 'PENDING');

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin', 'admin123');
  await admin.goto('/admin');
  await tid(admin, `admin-deny-${id}`).click();
  await expectStatus(admin, id, 'DENIED');
  await adminCtx.close();

  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-applied')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$50.00');
});

test('an expired order does not consume a once-per-user coupon', async ({ page, request }) => {
  await reset(request, 5);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');
  await applyCoupon(page, 'BIG50');
  await openCheckout(page);
  const id = await placeOrder(page);
  await expectStatus(page, id, 'EXPIRED', 20_000);

  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'BIG50');
  await expect(tid(page, 'coupon-applied')).toBeVisible();
  await expect(tid(page, 'cart-discount')).toHaveText('$50.00');
});
