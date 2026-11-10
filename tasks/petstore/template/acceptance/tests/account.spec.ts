import { test, expect } from '@playwright/test';
import { fillSignIn, newUser, registerOk, reset, signIn, signOut, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('register, sign out, sign back in', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await expect(page).toHaveURL(/\/$/);
  await expect(tid(page, 'orders-link')).toBeVisible();
  await expect(tid(page, 'admin-link')).toHaveCount(0);

  await signOut(page);
  await expect(tid(page, 'account-name')).toHaveCount(0);

  await signIn(page, u.username, u.password);
});

test('wrong password is rejected', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await signOut(page);
  await page.goto('/signin');
  await fillSignIn(page, u.username, 'not-the-password');
  await expect(tid(page, 'signin-error')).toBeVisible();
  await expect(tid(page, 'account-name')).toHaveCount(0);
});

test('admin sees the admin link', async ({ page }) => {
  await signIn(page, 'admin', 'admin123');
  await expect(tid(page, 'admin-link')).toBeVisible();
});
