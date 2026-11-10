import { test, expect } from '@playwright/test';
import { addToCart, item, money, reset, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('add items and see totals', async ({ page }) => {
  await page.goto('/');
  await expect(tid(page, 'cart-count')).toHaveText('0');

  await addToCart(page, 'EST-1', 2);
  await addToCart(page, 'EST-15');
  await expect(tid(page, 'cart-count')).toHaveText('3');

  await tid(page, 'cart-link').click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(tid(page, 'cart-qty-EST-1')).toHaveValue('2');
  await expect(tid(page, 'cart-line-total-EST-1')).toHaveText(money(item('EST-1').price * 2));
  await expect(tid(page, 'cart-line-total-EST-15')).toHaveText(money(item('EST-15').price));
  await expect(tid(page, 'cart-subtotal')).toHaveText(
    money(item('EST-1').price * 2 + item('EST-15').price),
  );
  await expect(tid(page, 'checkout-button')).toBeVisible();
});

test('empty cart', async ({ page }) => {
  await page.goto('/cart');
  await expect(tid(page, 'cart-empty')).toBeVisible();
  await expect(tid(page, 'checkout-button')).toHaveCount(0);
});
