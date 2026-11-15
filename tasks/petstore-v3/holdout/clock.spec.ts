import { test, expect } from '@playwright/test';
import {
  addToCart, advanceTime, BASE_NOW, events, newUser, openCheckout, placeOrder, registerOk, reset, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('a reservation does not expire before its deadline', async ({ page, request }) => {
  await reset(request, { now: BASE_NOW, reservationTtlSeconds: 30 });
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14'); // $650.00, stays PENDING
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await advanceTime(request, 25);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await advanceTime(request, 10);
  await expect(tid(page, 'order-status')).toHaveText('EXPIRED', { timeout: 10_000 });
  expect(await events(page)).toEqual(['PLACED', 'EXPIRED']);

  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 3 left');
});

test('a small order is approved after the business clock advances', async ({ page, request }) => {
  await reset(request, { now: BASE_NOW });
  await registerOk(page, newUser());
  await addToCart(page, 'EST-1'); // $16.50
  await openCheckout(page);
  await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await advanceTime(request, 2);
  await expect(tid(page, 'order-status')).toHaveText('APPROVED', { timeout: 5_000 });
});
