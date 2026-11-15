import { test, expect } from '@playwright/test';
import {
  addToCart, events, expectStatus, newUser, openCheckout, placeOrder, registerOk, reset, signIn, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('cancel and admin approve race leaves one terminal state', async ({ browser, request }) => {
  await reset(request);
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await registerOk(buyer, newUser());
  await addToCart(buyer, 'EST-14'); // $650.00, stays PENDING
  await openCheckout(buyer);
  const id = await placeOrder(buyer);
  await expect(tid(buyer, 'order-status')).toHaveText('PENDING');

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin', 'admin123');
  await admin.goto('/admin');
  await expect(tid(admin, `admin-order-${id}`)).toBeVisible();

  await Promise.allSettled([
    tid(buyer, 'cancel-order').click({ timeout: 5_000 }),
    tid(admin, `admin-approve-${id}`).click({ timeout: 5_000 }),
  ]);

  await expect
    .poll(
      async () => {
        await buyer.goto(`/orders/${id}`);
        return (await tid(buyer, 'order-status').innerText()).trim();
      },
      { timeout: 15_000, intervals: [500, 1_000, 2_000] },
    )
    .not.toBe('PENDING');

  const status = (await tid(buyer, 'order-status').innerText()).trim();
  expect(['CANCELLED', 'APPROVED']).toContain(status);
  expect(await events(buyer)).toEqual(['PLACED', status]);
  await expect(tid(buyer, 'cancel-order')).toHaveCount(0);

  await buyer.goto('/item/EST-14');
  await expect(tid(buyer, 'item-stock')).toHaveText(
    status === 'APPROVED' ? 'Only 2 left' : 'Only 3 left',
  );

  await buyerCtx.close();
  await adminCtx.close();
});

test('two refunds of the last unit cannot both succeed', async ({ browser, request }) => {
  await reset(request);
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await registerOk(buyer, newUser());
  await addToCart(buyer, 'EST-19'); // stock 1, $158.50, auto-approved
  await openCheckout(buyer);
  const id = await placeOrder(buyer);
  await expectStatus(buyer, id, 'APPROVED');
  await buyerCtx.close();

  const adminCtxA = await browser.newContext();
  const adminCtxB = await browser.newContext();
  const a = await adminCtxA.newPage();
  const b = await adminCtxB.newPage();
  for (const p of [a, b]) {
    await signIn(p, 'admin', 'admin123');
    await p.goto(`/admin/orders/${id}`);
    await tid(p, 'refund-qty-EST-19').fill('1');
    await expect(tid(p, 'refund-submit')).toBeVisible();
  }

  await Promise.allSettled([
    tid(a, 'refund-submit').click({ timeout: 5_000 }),
    tid(b, 'refund-submit').click({ timeout: 5_000 }),
  ]);

  await expectStatus(a, id, 'REFUNDED');
  await expect(tid(a, 'order-refunded')).toHaveText('$168.41');
  expect(await events(a)).toEqual(['PLACED', 'APPROVED', 'REFUNDED']);
  await a.goto('/item/EST-19');
  await expect(tid(a, 'item-stock')).toHaveText('Only 1 left');

  await adminCtxA.close();
  await adminCtxB.close();
});
