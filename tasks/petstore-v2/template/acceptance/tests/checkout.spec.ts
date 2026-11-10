import { test, expect } from '@playwright/test';
import {
  addToCart, events, fillSignIn, futureExpiry, newUser, registerOk, reset, setQty, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('tax by state, then auto-approval', async ({ page }) => {
  const u = newUser(); // ships to MA
  await registerOk(page, u);
  await signOut(page);
  await addToCart(page, 'EST-6');
  await page.goto('/cart');
  await setQty(page, 'EST-6', 2);
  await tid(page, 'checkout-button').click();

  await expect(page).toHaveURL(/\/signin/);
  await fillSignIn(page, u.username, u.password);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(tid(page, 'ship-state')).toHaveValue('MA');

  // net $11.00, shipping $9.99, MA tax 6.25% of $11.00 = 68.75 cents -> $0.69
  await expect(tid(page, 'checkout-subtotal')).toHaveText('$11.00');
  await expect(tid(page, 'checkout-discount')).toHaveText('$0.00');
  await expect(tid(page, 'checkout-shipping')).toHaveText('$9.99');
  await expect(tid(page, 'checkout-tax')).toHaveText('$0.69');
  await expect(tid(page, 'checkout-total')).toHaveText('$21.68');

  await tid(page, 'ship-state').fill('NH');
  await tid(page, 'ship-state').blur();
  await expect(tid(page, 'checkout-tax')).toHaveText('$0.00');
  await expect(tid(page, 'checkout-total')).toHaveText('$20.99');

  await tid(page, 'ship-state').fill('CA'); // 5% of $11.00 = $0.55
  await tid(page, 'ship-state').blur();
  await expect(tid(page, 'checkout-tax')).toHaveText('$0.55');

  await tid(page, 'ship-state').fill('MA');
  await tid(page, 'ship-state').blur();
  await tid(page, 'card-number').fill('4111 1111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  await tid(page, 'place-order').click();

  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');
  await expect(tid(page, 'order-total')).toHaveText('$21.68');
  await expect(tid(page, 'order-refunded')).toHaveText('$0.00');
  await expect(tid(page, 'cart-count')).toHaveText('0');
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
  expect(await events(page)).toEqual(['PLACED', 'APPROVED']);
  await expect(tid(page, 'cancel-order')).toHaveCount(0);
});

test('double-clicking place order creates one order', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-3');
  await page.goto('/checkout');
  await tid(page, 'card-number').fill('4111 1111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  await tid(page, 'place-order').dblclick();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  await page.goto('/orders');
  await expect(page.locator('[data-testid^="order-row-status-"]')).toHaveCount(1);
});
