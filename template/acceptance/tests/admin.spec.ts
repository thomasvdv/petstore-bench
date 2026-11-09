import { test, expect } from '@playwright/test';
import {
  addToCart, checkout, expectStatus, newUser, registerOk, reset, signIn, signOut, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('large order waits for the admin, who approves it', async ({ page }) => {
  const u = newUser();
  await registerOk(page, u);
  await addToCart(page, 'EST-14'); // $650.00
  const orderId = await checkout(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  // Past the 10 second auto-approval window, it must still be pending.
  await page.waitForTimeout(11_000);
  await page.reload();
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await tid(page, 'admin-link').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(tid(page, `admin-order-${orderId}`)).toBeVisible();
  await tid(page, `admin-approve-${orderId}`).click();
  await expect(tid(page, `admin-order-${orderId}`)).toHaveCount(0);

  await signOut(page);
  await signIn(page, u.username, u.password);
  await expectStatus(page, orderId, 'APPROVED');
});
