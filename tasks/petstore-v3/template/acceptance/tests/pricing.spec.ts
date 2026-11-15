import { test, expect } from '@playwright/test';
import {
  addToCart, applyCoupon, newUser, openCheckout, registerOk, reset, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('coupons from different groups stack', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // $418.50
  await addToCart(page, 'EST-15'); // $125.50

  await applyCoupon(page, 'SAVE15'); // site: 15% of each line
  await applyCoupon(page, 'PET10'); // percent: 10% of each line
  await applyCoupon(page, 'VIP20'); // vip: 20% of each line

  await expect(tid(page, 'coupon-selected-SAVE15')).toBeVisible();
  await expect(tid(page, 'coupon-selected-PET10')).toBeVisible();
  await expect(tid(page, 'coupon-selected-VIP20')).toBeVisible();
  await expect(tid(page, 'cart-subtotal')).toHaveText('$544.00');
  // 62.78 + 41.85 + 83.70 = 188.33 on EST-8; 18.83 + 12.55 + 25.10 = 56.48 on EST-15.
  await expect(tid(page, 'cart-discount')).toHaveText('$244.81');
  await expect(tid(page, 'cart-shipping')).toHaveText('$0.00');

  await openCheckout(page);
  await expect(tid(page, 'checkout-subtotal')).toHaveText('$544.00');
  await expect(tid(page, 'checkout-discount')).toHaveText('$244.81');
  // net $299.19, tax 18.699375 -> $18.70
  await expect(tid(page, 'checkout-tax')).toHaveText('$18.70');
  await expect(tid(page, 'checkout-total')).toHaveText('$317.89');
});

test('only the best coupon from a group is selected', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await addToCart(page, 'EST-15');

  await applyCoupon(page, 'BIG50'); // site: $50 fixed
  await applyCoupon(page, 'SAVE15'); // site: 15% -> $81.61
  await applyCoupon(page, 'FLAT25'); // site: $25 fixed

  await expect(tid(page, 'coupon-selected-SAVE15')).toBeVisible();
  await expect(tid(page, 'coupon-selected-BIG50')).toHaveCount(0);
  await expect(tid(page, 'coupon-selected-FLAT25')).toHaveCount(0);
  await expect(tid(page, 'coupon-applied')).toContainText('SAVE15');
  await expect(tid(page, 'cart-discount')).toHaveText('$81.61');
});
