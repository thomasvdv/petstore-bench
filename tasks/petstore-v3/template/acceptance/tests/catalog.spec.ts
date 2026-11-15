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
  await tid(page, 'product-link-FI-SW-01').click();
  await expect(page).toHaveURL(/\/product\/FI-SW-01$/);
  for (const id of ['EST-1', 'EST-2']) {
    await expect(tid(page, `item-price-${id}`)).toHaveText(money(item(id).price));
  }
  await tid(page, 'item-link-EST-1').click();
  await expect(tid(page, 'item-name')).toHaveText('Angelfish');
  await expect(tid(page, 'item-attribute')).toHaveText('Large');
  await expect(tid(page, 'item-price')).toHaveText('$16.50');
  await expect(tid(page, 'item-stock')).toHaveText('In stock');
});

test('low and zero availability', async ({ page }) => {
  await page.goto('/item/EST-14'); // stock 3
  await expect(tid(page, 'item-stock')).toHaveText('Only 3 left');
  await page.goto('/item/EST-19'); // stock 1
  await expect(tid(page, 'item-stock')).toHaveText('Only 1 left');
  await page.goto('/item/EST-24'); // stock 0
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');
  await expect(tid(page, 'add-to-cart')).toBeDisabled();
  await page.goto('/item/EST-21');
  await expect(tid(page, 'item-price')).toHaveText('$1,250.00');
});
