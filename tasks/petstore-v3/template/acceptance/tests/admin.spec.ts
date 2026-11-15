import { test, expect } from '@playwright/test';
import {
  addToCart, reset, signIn, tid,
} from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('admin price changes show in the catalog and cart', async ({ page }) => {
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin/items');
  await tid(page, 'admin-item-price-EST-1').fill('20.00');
  await tid(page, 'admin-item-save-EST-1').click();
  await expect(tid(page, 'admin-item-saved-EST-1')).toBeVisible();

  await page.goto('/item/EST-1');
  await expect(tid(page, 'item-price')).toHaveText('$20.00');

  await addToCart(page, 'EST-1');
  await page.goto('/cart');
  await expect(tid(page, 'cart-line-total-EST-1')).toHaveText('$20.00');
});
