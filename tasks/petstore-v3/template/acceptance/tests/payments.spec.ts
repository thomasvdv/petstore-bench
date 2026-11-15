import { test, expect } from '@playwright/test';
import {
  addToCart, applyGiftcard, newUser, openCheckout, placeOrder, registerOk, reset, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('a gift card pays part of the order and the card pays the rest', async ({ page }) => {
  await registerOk(page, newUser());
  await addToCart(page, 'EST-8'); // $418.50
  await openCheckout(page);

  // subtotal $418.50, free shipping, MA tax $26.16, total $444.66
  await expect(tid(page, 'checkout-total')).toHaveText('$444.66');
  await applyGiftcard(page, 'GIFT50');
  await expect(tid(page, 'checkout-giftcard')).toHaveText('$50.00');
  await expect(tid(page, 'checkout-card')).toHaveText('$394.66');

  await placeOrder(page);
  await expect(tid(page, 'order-total')).toHaveText('$444.66');
  await expect(tid(page, 'order-giftcard')).toHaveText('$50.00');
  await expect(tid(page, 'order-card')).toHaveText('$394.66');
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 15_000 });
});
