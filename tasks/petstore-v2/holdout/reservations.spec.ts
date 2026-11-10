import { test, expect, type Browser } from '@playwright/test';
import {
  addToCart, events, futureExpiry, newUser, openCheckout, placeOrder, registerOk, reset, setQty, tid,
} from '../helpers';

test('an undecided order expires and releases its reservation', async ({ page, request }) => {
  await reset(request, 6);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14'); // $650.00, needs admin
  await openCheckout(page);
  const id = await placeOrder(page);
  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 2 left');

  await page.goto(`/orders/${id}`);
  await expect(tid(page, 'order-status')).toHaveText('EXPIRED', { timeout: 25_000 });
  expect(await events(page)).toEqual(['PLACED', 'EXPIRED']);
  await page.goto('/item/EST-14');
  await expect(tid(page, 'item-stock')).toHaveText('Only 3 left');
});

async function readyToBuy(browser: Browser, itemId: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerOk(page, newUser('race'));
  await addToCart(page, itemId);
  await page.goto('/checkout');
  await tid(page, 'card-number').fill('4111111111111111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  return { ctx, page };
}

test('two buyers race for the last unit at checkout', async ({ browser, request }) => {
  await reset(request);
  const a = await readyToBuy(browser, 'EST-19'); // stock 1
  const b = await readyToBuy(browser, 'EST-19');
  await Promise.all([a.page.getByTestId('place-order').click(), b.page.getByTestId('place-order').click()]);

  const outcome = async (p: typeof a.page) => {
    await expect
      .poll(async () =>
        /\/orders\/[^/]+$/.test(p.url()) ? 'order' : (await p.getByTestId('checkout-error').isVisible()) ? 'error' : 'waiting',
      { timeout: 15_000 })
      .not.toBe('waiting');
    return /\/orders\/[^/]+$/.test(p.url()) ? 'order' : 'error';
  };
  expect([await outcome(a.page), await outcome(b.page)].sort()).toEqual(['error', 'order']);
  await a.ctx.close();
  await b.ctx.close();
});

test('cart quantity is capped at available stock', async ({ page, request }) => {
  await reset(request);
  await addToCart(page, 'EST-14'); // stock 3
  await page.goto('/cart');
  await setQty(page, 'EST-14', 5);
  await expect(tid(page, 'cart-qty-EST-14')).toHaveValue('3');
  await expect(tid(page, 'cart-line-warning-EST-14')).toBeVisible();
  await expect(tid(page, 'cart-count')).toHaveText('3');
});

test('a reservation hides stock from other customers', async ({ browser, page, request }) => {
  await reset(request);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-14');
  await page.goto('/cart');
  await setQty(page, 'EST-14', 3);
  await openCheckout(page);
  await placeOrder(page); // $2,071.88, stays pending

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto('/item/EST-14');
  await expect(other.getByTestId('item-stock')).toHaveText('Out of stock');
  await expect(other.getByTestId('add-to-cart')).toBeDisabled();
  await ctx.close();
});

test('a rejected card reserves nothing', async ({ page, request }) => {
  await reset(request);
  await registerOk(page, newUser());
  await addToCart(page, 'EST-19');
  await page.goto('/checkout');
  await tid(page, 'card-number').fill('4111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  await tid(page, 'place-order').click();
  await expect(tid(page, 'checkout-error')).toBeVisible();
  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Only 1 left');
  await expect(tid(page, 'cart-count')).toHaveText('1');
});
