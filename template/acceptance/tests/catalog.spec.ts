import { test, expect } from '@playwright/test';
import { catalog, item, money, reset, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('home lists every category', async ({ page }) => {
  await page.goto('/');
  for (const c of catalog.categories) {
    await expect(tid(page, `category-link-${c.id}`)).toContainText(c.name);
  }
});

test('browse from category to product to item', async ({ page }) => {
  await page.goto('/');
  await tid(page, 'category-link-FISH').click();
  await expect(page).toHaveURL(/\/category\/FISH$/);
  await tid(page, 'product-link-FI-SW-01').click();
  await expect(page).toHaveURL(/\/product\/FI-SW-01$/);

  for (const id of ['EST-1', 'EST-2']) {
    await expect(tid(page, `item-row-${id}`)).toBeVisible();
    await expect(tid(page, `item-link-${id}`)).toContainText(item(id).attribute);
    await expect(tid(page, `item-price-${id}`)).toHaveText(money(item(id).price));
  }

  await tid(page, 'item-link-EST-1').click();
  await expect(page).toHaveURL(/\/item\/EST-1$/);
  await expect(tid(page, 'item-name')).toHaveText('Angelfish');
  await expect(tid(page, 'item-attribute')).toHaveText('Large');
  await expect(tid(page, 'item-price')).toHaveText('$16.50');
  await expect(tid(page, 'item-stock')).toHaveText('In stock');
  await expect(tid(page, 'add-to-cart')).toBeEnabled();
});

test('prices use a thousands separator', async ({ page }) => {
  await page.goto('/item/EST-21');
  await expect(tid(page, 'item-price')).toHaveText('$1,250.00');
});
