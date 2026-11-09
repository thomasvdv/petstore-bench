import { test, expect } from '@playwright/test';
import { catalog, reset, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('each category page lists exactly its products', async ({ page }) => {
  for (const c of catalog.categories) {
    await page.goto(`/category/${c.id}`);
    const expected = catalog.products.filter((p) => p.categoryId === c.id).map((p) => p.id).sort();
    for (const id of expected) await expect(tid(page, `product-link-${id}`)).toBeVisible();
    const shown = await page.locator('[data-testid^="product-link-"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')!.replace('product-link-', '')).sort(),
    );
    expect(shown, c.id).toEqual(expected);
  }
});

test('out-of-stock item cannot be added', async ({ page }) => {
  await page.goto('/item/EST-24');
  await expect(tid(page, 'item-stock')).toHaveText('Out of stock');
  await expect(tid(page, 'add-to-cart')).toBeDisabled();
});

test('search is case-insensitive and matches descriptions', async ({ page }) => {
  await page.goto('/search?q=KOI');
  await expect(tid(page, 'search-result-FI-FW-01')).toBeVisible();

  await page.goto('/search?q=australia');
  await expect(tid(page, 'search-result-FI-SW-01')).toBeVisible();
  await expect(tid(page, 'search-result-FI-SW-02')).toBeVisible();
  await expect(page.locator('[data-testid^="search-result-"]')).toHaveCount(2);
});

test('search with no matches says so', async ({ page }) => {
  await page.goto('/search?q=zebra');
  await expect(tid(page, 'search-empty')).toBeVisible();
  await expect(page.locator('[data-testid^="search-result-"]')).toHaveCount(0);
});

test('search result links to the product page', async ({ page }) => {
  await page.goto('/search?q=poodle');
  await tid(page, 'search-result-K9-PO-02').locator('xpath=descendant-or-self::a').first().click();
  await expect(page).toHaveURL(/\/product\/K9-PO-02$/);
  await expect(tid(page, 'item-row-EST-10')).toBeVisible();
});
