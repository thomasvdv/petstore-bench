import { test, expect, type Page } from '@playwright/test';
import {
  addToCart, applyCoupon, applyGiftcard, events, expectStatus, newUser, openCheckout, placeOrder, registerOk,
  reset, setQty, signIn, signOut, tid,
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

test('refunds return to the gift card before the card', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-6'); // $5.50
  await page.goto('/cart');
  await setQty(page, 'EST-6', 4); // $22.00
  await expect(tid(page, 'cart-subtotal')).toHaveText('$22.00');
  await openCheckout(page);

  // $22.00 + $9.99 shipping + $1.38 tax = $33.37
  await expect(tid(page, 'checkout-total')).toHaveText('$33.37');
  await applyGiftcard(page, 'GIFT5');
  await expect(tid(page, 'checkout-giftcard')).toHaveText('$5.00');
  await expect(tid(page, 'checkout-card')).toHaveText('$28.37');
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });

  await asAdmin(page);
  await refund(page, id, { 'EST-6': 2 });
  await expectStatus(page, id, 'PARTIALLY_REFUNDED');
  // 2 of 4: net $11.00 + tax $0.69 = $11.69; gift card first, then card.
  await expect(tid(page, 'order-refunded')).toHaveText('$11.69');
  await expect(tid(page, 'order-refunded-giftcard')).toHaveText('$5.00');
  await expect(tid(page, 'order-refunded-card')).toHaveText('$6.69');

  await refund(page, id, { 'EST-6': 2 });
  await expectStatus(page, id, 'REFUNDED');
  await expect(tid(page, 'order-refunded')).toHaveText('$23.38');
  await expect(tid(page, 'order-refunded-giftcard')).toHaveText('$5.00');
  await expect(tid(page, 'order-refunded-card')).toHaveText('$18.38');
  expect(await events(page)).toEqual(['PLACED', 'APPROVED', 'REFUNDED', 'REFUNDED']);
});

test('a gift card cannot be spent twice', async ({ browser, request }) => {
  await reset(request);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await registerOk(a, newUser('gA'));
  await addToCart(a, 'EST-8');
  await openCheckout(a);
  await applyGiftcard(a, 'GIFT50');
  await expect(tid(a, 'checkout-giftcard')).toHaveText('$50.00');

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await registerOk(b, newUser('gB'));
  await addToCart(b, 'EST-8');
  await openCheckout(b);
  await applyGiftcard(b, 'GIFT50');
  await expect(tid(b, 'checkout-giftcard')).toHaveText('$50.00');

  await placeOrder(a); // spends the card
  await tid(b, 'place-order').click();
  await expect(tid(b, 'checkout-error')).toBeVisible();
  await expect(b).toHaveURL(/\/checkout$/);

  await ctxA.close();
  await ctxB.close();
});

test('a gift card applies to the post-discount total', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await applyCoupon(page, 'PET10');
  await openCheckout(page);

  // subtotal $418.50, discount $41.85, net $376.65, tax $23.54
  await expect(tid(page, 'checkout-discount')).toHaveText('$41.85');
  await expect(tid(page, 'checkout-total')).toHaveText('$400.19');
  await applyGiftcard(page, 'GIFT200');
  await expect(tid(page, 'checkout-giftcard')).toHaveText('$200.00');
  await expect(tid(page, 'checkout-card')).toHaveText('$200.19');

  await placeOrder(page);
  await expect(tid(page, 'order-giftcard')).toHaveText('$200.00');
  await expect(tid(page, 'order-card')).toHaveText('$200.19');
});
