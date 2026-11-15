import { test, expect } from '@playwright/test';
import {
  addToCart, advanceTime, BASE_NOW, events, newUser, openCheckout, placeOrder, registerOk, reset, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('advancing the business clock expires a pending reservation', async ({ page, request }) => {
  await reset(request, { now: BASE_NOW, reservationTtlSeconds: 60 });
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14'); // $650.00, stays PENDING
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await advanceTime(request, 50);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await advanceTime(request, 15);
  await expect(tid(page, 'order-status')).toHaveText('EXPIRED', { timeout: 10_000 });
  expect(await events(page)).toEqual(['PLACED', 'EXPIRED']);

  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 3 left');
});
