import { test, expect } from '@playwright/test';
import { catalog, reset, tid } from '../helpers';

test.beforeEach(async ({ request }) => reset(request));

test('search from the header returns exactly the matching products', async ({ page }) => {
  const term = 'fish';
  const expected = catalog.products
    .filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(term))
    .map((p) => p.id)
    .sort();
  expect(expected.length).toBeGreaterThan(1);

  await page.goto('/');
  await tid(page, 'search-input').fill(term);
  await tid(page, 'search-submit').click();
  await expect(page).toHaveURL(/\/search\?q=fish/);

  for (const id of expected) {
    await expect(tid(page, `search-result-${id}`)).toBeVisible();
  }
  const shown = await page.locator('[data-testid^="search-result-"]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-testid')!.replace('search-result-', '')).sort(),
  );
  expect(shown).toEqual(expected);
});
