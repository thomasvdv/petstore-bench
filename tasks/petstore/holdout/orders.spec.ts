import { test, expect, type Browser } from '@playwright/test';
import {
  addToCart, checkout, expectStatus, futureExpiry, item, money, newUser, registerOk, reset,
  signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('invalid card creates no order and keeps the cart', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-3');
  await page.goto('/checkout');

  await tid(page, 'card-number').fill('4111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  await tid(page, 'place-order').click();
  await expect(tid(page, 'checkout-error')).toBeVisible();

  await tid(page, 'card-number').fill('4111 1111 1111 1111');
  await tid(page, 'card-expiry').fill('01/20');
  await tid(page, 'place-order').click();
  await expect(tid(page, 'checkout-error')).toBeVisible();

  await expect(tid(page, 'cart-count')).toHaveText('1');
  await page.goto('/orders');
  await expect(page.locator('[data-testid^="order-row-"]')).toHaveCount(0);
});

test('checkout is prefilled from the account', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-3');
  await page.goto('/checkout');
  await expect(tid(page, 'ship-address')).toHaveValue(u.address);
  await expect(tid(page, 'ship-city')).toHaveValue(u.city);
  await expect(tid(page, 'ship-state')).toHaveValue(u.state);
  await expect(tid(page, 'ship-zip')).toHaveValue(u.zip);
});

test('multi-line order total and order list', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-7', 3);
  await addToCart(page, 'EST-16');
  const id = await checkout(page);
  await expect(tid(page, 'order-total')).toHaveText(
    money(item('EST-7').price * 3 + item('EST-16').price),
  );
  await page.goto('/orders');
  await expect(tid(page, `order-row-${id}`)).toBeVisible();
});

test('admin denies a large order and stock is unchanged', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-22'); // $935.50, stock 5
  const id = await checkout(page);
  await signOut(page);

  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await tid(page, `admin-deny-${id}`).click();
  await expect(tid(page, `admin-order-${id}`)).toHaveCount(0);
  await expectStatus(page, id, 'DENIED');

  // Stock unchanged: a 5-unit order still approves.
  await signOut(page);
  await signIn(page, u.username, u.password);
  await addToCart(page, 'EST-22', 5);
  const id2 = await checkout(page);
  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await tid(page, `admin-approve-${id2}`).click();
  await expectStatus(page, id2, 'APPROVED');
  await page.goto('/item/EST-22');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');
});

async function userOrdering(browser: Browser, itemId: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const u = newUser('race');
  await registerOk(page, u);
  await addToCart(page, itemId);
  await page.goto('/checkout');
  await tid(page, 'card-number').fill('4111111111111111');
  await tid(page, 'card-expiry').fill(futureExpiry());
  return { ctx, page };
}

test('two orders for the last unit: one approved, one denied', async ({ browser, page }) => {
  // EST-19 has stock 1 and costs under $500, so both orders are auto-processed.
  const a = await userOrdering(browser, 'EST-19');
  const b = await userOrdering(browser, 'EST-19');
  await Promise.all([a.page.getByTestId('place-order').click(), b.page.getByTestId('place-order').click()]);
  await expect(a.page).toHaveURL(/\/orders\/[^/]+$/);
  await expect(b.page).toHaveURL(/\/orders\/[^/]+$/);

  const final = async (p: typeof a.page) => {
    await expect(p.getByTestId('order-status')).not.toHaveText('PENDING', { timeout: 15_000 });
    return (await p.getByTestId('order-status').innerText()).trim();
  };
  const statuses = [await final(a.page), await final(b.page)].sort();
  expect(statuses).toEqual(['APPROVED', 'DENIED']);

  await page.goto('/item/EST-19');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');
  await a.ctx.close();
  await b.ctx.close();
});

test('orders are private to their owner', async ({ browser, page }) => {
  const owner = newUser('own');
  await registerOk(page, owner);
  await addToCart(page, 'EST-1');
  const id = await checkout(page);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await registerOk(other, newUser('peek'));
  await other.goto(`/orders/${id}`);
  await expect(other.getByTestId('order-total')).toHaveCount(0);
  await ctx.close();
});
