import { expect, type APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type Category = { id: string; name: string; description: string };
export type Product = { id: string; categoryId: string; name: string; description: string };
export type Item = { id: string; productId: string; attribute: string; price: number; stock: number };
export type Catalog = { categories: Category[]; products: Product[]; items: Item[] };

const seedPath =
  process.env.SEED_PATH ??
  path.resolve(process.env.APP_DIR ?? path.resolve(__dirname, '..'), 'seed', 'catalog.json');

export const catalog: Catalog = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

export const item = (id: string) => catalog.items.find((i) => i.id === id)!;
export const product = (id: string) => catalog.products.find((p) => p.id === id)!;

export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export const tid = (page: Page, id: string) => page.getByTestId(id);

export async function reset(request: APIRequestContext, reservationTtlSeconds?: number) {
  const res = await request.post('/api/test/reset', {
    data: reservationTtlSeconds === undefined ? {} : { reservationTtlSeconds },
  });
  expect(res.status()).toBe(200);
}

/** Cents to display string, e.g. 2168 -> "$21.68". */
export const usd = (cents: number) => money(cents / 100);

let counter = 0;
export function newUser(prefix = 'user') {
  counter += 1;
  const u = `${prefix}${Date.now().toString(36)}${counter}`;
  return {
    username: u,
    password: 'pw-' + u,
    email: `${u}@example.com`,
    firstName: 'Pat',
    lastName: 'Tester',
    address: '12 Harbor Street',
    city: 'Boston',
    state: 'MA',
    zip: '02110',
  };
}
export type User = ReturnType<typeof newUser>;

export async function register(page: Page, u: User) {
  await page.goto('/register');
  await tid(page, 'register-username').fill(u.username);
  await tid(page, 'register-password').fill(u.password);
  await tid(page, 'register-email').fill(u.email);
  await tid(page, 'register-first-name').fill(u.firstName);
  await tid(page, 'register-last-name').fill(u.lastName);
  await tid(page, 'register-address').fill(u.address);
  await tid(page, 'register-city').fill(u.city);
  await tid(page, 'register-state').fill(u.state);
  await tid(page, 'register-zip').fill(u.zip);
  await tid(page, 'register-submit').click();
}

export async function registerOk(page: Page, u: User) {
  await register(page, u);
  await expect(tid(page, 'account-name')).toHaveText(u.username);
}

export async function fillSignIn(page: Page, username: string, password: string) {
  await tid(page, 'signin-username').fill(username);
  await tid(page, 'signin-password').fill(password);
  await tid(page, 'signin-submit').click();
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/signin');
  await fillSignIn(page, username, password);
  await expect(tid(page, 'account-name')).toHaveText(username);
}

export async function signOut(page: Page) {
  await tid(page, 'signout-button').click();
  await expect(tid(page, 'signin-link')).toBeVisible();
}

/** Sets a cart line's quantity on /cart. */
export async function setQty(page: Page, itemId: string, qty: number) {
  await tid(page, `cart-qty-${itemId}`).fill(String(qty));
  await tid(page, `cart-qty-${itemId}`).press('Enter');
}

export async function applyCoupon(page: Page, code: string) {
  await page.goto('/cart');
  await tid(page, 'coupon-input').fill(code);
  await tid(page, 'coupon-apply').click();
}

/** Opens checkout and fills a valid card. Optionally sets the ship state. */
export async function openCheckout(page: Page, state?: string) {
  await page.goto('/checkout');
  if (state) {
    await tid(page, 'ship-state').fill(state);
    await tid(page, 'ship-state').blur();
  }
  await tid(page, 'card-number').fill('4111 1111 1111 1111');
  await tid(page, 'card-expiry').fill(futureExpiry());
}

export async function placeOrder(page: Page) {
  await tid(page, 'place-order').click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  return (await tid(page, 'order-id').innerText()).trim();
}

export async function events(page: Page) {
  return (await page.getByTestId('order-event').allInnerTexts()).map((t) => t.trim());
}

export async function addToCart(page: Page, itemId: string, times = 1) {
  await page.goto(`/item/${itemId}`);
  for (let i = 0; i < times; i++) {
    const before = Number((await tid(page, 'cart-count').innerText()).trim());
    await tid(page, 'add-to-cart').click();
    await expect(tid(page, 'cart-count')).toHaveText(String(before + 1));
  }
}

export function futureExpiry() {
  const d = new Date();
  const yy = String((d.getFullYear() + 2) % 100).padStart(2, '0');
  return `12/${yy}`;
}

/** Place an order for whatever is in the cart. Returns the order id. */
export async function checkout(page: Page, card = '4111 1111 1111 1111', expiry = futureExpiry()) {
  await page.goto('/checkout');
  await tid(page, 'card-number').fill(card);
  await tid(page, 'card-expiry').fill(expiry);
  await tid(page, 'place-order').click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  const id = (await tid(page, 'order-id').innerText()).trim();
  expect(id.length).toBeGreaterThan(0);
  return id;
}

export async function expectStatus(page: Page, orderId: string, status: string, timeout = 15_000) {
  await page.goto(`/orders/${orderId}`);
  await expect(tid(page, 'order-status')).toHaveText(status, { timeout });
}
