import { test, expect } from '@playwright/test';
import {
  addToCart, item, money, newUser, register, registerOk, reset, signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('change quantity and remove lines', async ({ page }) => {
  await addToCart(page, 'EST-6');
  await addToCart(page, 'EST-17');
  await page.goto('/cart');

  await tid(page, 'cart-qty-EST-6').fill('4');
  await tid(page, 'cart-qty-EST-6').press('Enter');
  await expect(tid(page, 'cart-line-total-EST-6')).toHaveText(money(item('EST-6').price * 4));
  await expect(tid(page, 'cart-subtotal')).toHaveText(
    money(item('EST-6').price * 4 + item('EST-17').price),
  );
  await expect(tid(page, 'cart-count')).toHaveText('5');

  await tid(page, 'cart-remove-EST-17').click();
  await expect(tid(page, 'cart-line-EST-17')).toHaveCount(0);
  await expect(tid(page, 'cart-subtotal')).toHaveText(money(item('EST-6').price * 4));

  await tid(page, 'cart-qty-EST-6').fill('0');
  await tid(page, 'cart-qty-EST-6').blur();
  await expect(tid(page, 'cart-empty')).toBeVisible();
  await expect(tid(page, 'cart-count')).toHaveText('0');
});

test('cart survives reload and sign-in', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await signOut(page);

  await addToCart(page, 'EST-23', 2);
  await page.reload();
  await expect(tid(page, 'cart-count')).toHaveText('2');

  await signIn(page, u.username, u.password);
  await page.goto('/cart');
  await expect(tid(page, 'cart-qty-EST-23')).toHaveValue('2');
});

test('duplicate username is rejected', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await signOut(page);
  await register(page, { ...u, email: 'other@example.com' });
  await expect(tid(page, 'register-error')).toBeVisible();
  await expect(tid(page, 'account-name')).toHaveCount(0);
});

test('protected pages redirect or forbid', async ({ page }) => {
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/signin/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/signin/);

  const u = newUser();
  await registerOk(page, u);
  await page.goto('/admin');
  await expect(tid(page, 'forbidden')).toBeVisible();
  await expect(page.locator('[data-testid^="admin-approve-"]')).toHaveCount(0);
});

test('sign-in returns to the page that required it', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await signOut(page);
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/signin/);
  await tid(page, 'signin-username').fill(u.username);
  await tid(page, 'signin-password').fill(u.password);
  await tid(page, 'signin-submit').click();
  await expect(page).toHaveURL(/\/orders$/);
});
