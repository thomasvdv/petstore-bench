import { test, expect } from '@playwright/test';
import {
  addToCart, applyCoupon, newUser, openCheckout, registerOk, reset, setQty, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('free shipping starts exactly at $100 net', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-1'); // $16.50
  await addToCart(page, 'EST-3'); // $18.50
  await addToCart(page, 'EST-6'); // $5.50
  await page.goto('/cart');
  await setQty(page, 'EST-1', 4); // $66.00, fish
  await expect(tid(page, 'cart-subtotal')).toHaveText('$90.00');
  await setQty(page, 'EST-3', 2); // $37.00, fish
  await expect(tid(page, 'cart-subtotal')).toHaveText('$108.50');
  await setQty(page, 'EST-6', 4); // $22.00, fish
  await expect(tid(page, 'cart-subtotal')).toHaveText('$125.00');

  await applyCoupon(page, 'FISH20'); // 20% of $125.00 = $25.00
  await expect(tid(page, 'cart-subtotal')).toHaveText('$125.00');
  await expect(tid(page, 'cart-discount')).toHaveText('$25.00');
  await expect(tid(page, 'cart-shipping')).toHaveText('$0.00'); // net exactly $100.00

  await setQty(page, 'EST-6', 3); // subtotal $119.50, discount $23.90, net $95.60
  await expect(tid(page, 'cart-subtotal')).toHaveText('$119.50');
  await expect(tid(page, 'cart-discount')).toHaveText('$23.90');
  await expect(tid(page, 'cart-shipping')).toHaveText('$9.99');

  await setQty(page, 'EST-6', 4);
  await expect(tid(page, 'cart-shipping')).toHaveText('$0.00');

  await openCheckout(page);
  await expect(tid(page, 'checkout-subtotal')).toHaveText('$125.00');
  await expect(tid(page, 'checkout-discount')).toHaveText('$25.00');
  await expect(tid(page, 'checkout-shipping')).toHaveText('$0.00');
  await expect(tid(page, 'checkout-tax')).toHaveText('$6.25');
  await expect(tid(page, 'checkout-total')).toHaveText('$106.25');
});

test('tax rounds an exact half cent up', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-7'); // $5.29
  await page.goto('/cart');
  await setQty(page, 'EST-7', 8); // $42.32
  await expect(tid(page, 'cart-subtotal')).toHaveText('$42.32');

  await openCheckout(page);
  await expect(tid(page, 'checkout-subtotal')).toHaveText('$42.32');
  await expect(tid(page, 'checkout-shipping')).toHaveText('$9.99');
  // 6.25% of 4232c = 264.5c -> 265c
  await expect(tid(page, 'checkout-tax')).toHaveText('$2.65');
  await expect(tid(page, 'checkout-total')).toHaveText('$54.96');
});
