import { test, expect } from '@playwright/test';
import {
  addToCart, fillSignIn, futureExpiry, item, money, newUser, registerOk, reset, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('small order: sign-in redirect, pending, then auto-approved', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await signOut(page);

  await addToCart(page, 'EST-4', 2);
  await page.goto('/cart');
  await tid(page, 'checkout-button').click();

  // Signed out: redirected to sign in, then back to checkout.
  await expect(page).toHaveURL(/\/signin/);
  await fillSignIn(page, u.username, u.password);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(tid(page, 'ship-address')).toHaveValue(u.address);

  await tid(page, 'card-number').fill('4111 1111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  await tid(page, 'place-order').click();

  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  const orderId = (await tid(page, 'order-id').innerText()).trim();
  expect(page.url().endsWith(`/orders/${orderId}`)).toBe(true);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');
  await expect(tid(page, 'order-total')).toHaveText(money(item('EST-4').price * 2));
  await expect(tid(page, 'cart-count')).toHaveText('0');

  // Auto-approval arrives without a manual reload.
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });

  await tid(page, 'orders-link').click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(tid(page, `order-row-status-${orderId}`)).toHaveText('APPROVED');
});
