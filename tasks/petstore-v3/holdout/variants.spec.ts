import { test, expect } from '@playwright/test';
import {
  addToCart, applyCoupon, applyGiftcard, expectStatus, hiddenSeed, newUser, openCheckout, placeOrder, registerOk,
  reset, setQty, signIn, signOut, tid, usd,
} from '../helpers';

type VariantCatalog = { items: { id: string; price: number; stock: number }[] };
type VariantCoupons = { coupons: { code: string; percent: number }[] };
type VariantGifts = { giftcards: { code: string; balance: number }[] };
type VariantWarehouses = { warehouses: { id: string; stock: Record<string, number> }[] };

test.beforeEach(async ({ request }) => reset(request));

test('variant prices and coupon values are used', async ({ page, request }) => {
  for (const variant of [2, 3]) {
    await reset(request, { variant });
    const catalog = hiddenSeed<VariantCatalog>(variant, 'catalog.json');
    const coupons = hiddenSeed<VariantCoupons>(variant, 'coupons.json');
    const item = catalog.items.find((i) => i.id === 'EST-1')!;
    const coupon = coupons.coupons.find((c) => c.code === 'PET10')!;
    const unit = Math.round(item.price * 100);

    await addToCart(page, 'EST-1');
    await page.goto('/cart');
    await setQty(page, 'EST-1', 2);
    await expect(tid(page, 'cart-line-total-EST-1')).toHaveText(usd(unit * 2));
    await expect(tid(page, 'cart-subtotal')).toHaveText(usd(unit * 2));

    await applyCoupon(page, 'PET10');
    const discount = Math.floor((unit * 2 * coupon.percent + 50) / 100);
    await expect(tid(page, 'coupon-selected-PET10')).toBeVisible();
    await expect(tid(page, 'cart-discount')).toHaveText(usd(discount));
  }
});

test('a variant gift card balance is used for the split', async ({ page, request }) => {
  await reset(request, { variant: 2 });
  const catalog = hiddenSeed<VariantCatalog>(2, 'catalog.json');
  const gifts = hiddenSeed<VariantGifts>(2, 'giftcards.json');
  const item = catalog.items.find((i) => i.id === 'EST-1')!;
  const gift = gifts.giftcards.find((g) => g.code === 'GIFT5')!;
  const unit = Math.round(item.price * 100);
  const subtotal = unit * 3;
  const shipping = subtotal >= 10000 ? 0 : 999;
  const tax = Math.floor((subtotal * 625 + 5000) / 10000);
  const total = subtotal + shipping + tax;
  const giftAmount = Math.min(Math.round(gift.balance * 100), total);
  const cardAmount = total - giftAmount;

  await registerOk(page, newUser());
  await addToCart(page, 'EST-1');
  await page.goto('/cart');
  await setQty(page, 'EST-1', 3);
  await expect(tid(page, 'cart-subtotal')).toHaveText(usd(subtotal));

  await openCheckout(page);
  await expect(tid(page, 'checkout-total')).toHaveText(usd(total));
  await applyGiftcard(page, 'GIFT5');
  await expect(tid(page, 'checkout-giftcard')).toHaveText(usd(giftAmount));
  await expect(tid(page, 'checkout-card')).toHaveText(usd(cardAmount));

  await placeOrder(page);
  await expect(tid(page, 'order-total')).toHaveText(usd(total));
  await expect(tid(page, 'order-giftcard')).toHaveText(usd(giftAmount));
  await expect(tid(page, 'order-card')).toHaveText(usd(cardAmount));
});

test('variant warehouse splits drive allocation', async ({ page, request }) => {
  await reset(request, { variant: 2 });
  const catalog = hiddenSeed<VariantCatalog>(2, 'catalog.json');
  const warehouses = hiddenSeed<VariantWarehouses>(2, 'warehouses.json');
  const item = catalog.items.find((i) => i.id === 'EST-8')!;
  const unit = Math.round(item.price * 100);
  const bos = warehouses.warehouses.find((w) => w.id === 'BOS')!.stock['EST-8'];
  const nj = warehouses.warehouses.find((w) => w.id === 'NJ')!.stock['EST-8'];
  const qty = Math.min(item.stock, bos + 2);
  const bosTake = Math.min(qty, bos);
  const njTake = qty - bosTake;

  await registerOk(page, newUser());
  await addToCart(page, 'EST-8');
  await page.goto('/cart');
  await setQty(page, 'EST-8', qty);
  await expect(tid(page, 'cart-subtotal')).toHaveText(usd(unit * qty));
  await openCheckout(page);
  const id = await placeOrder(page);
  await expect(tid(page, 'order-status')).toHaveText('PENDING');

  await signOut(page);
  await signIn(page, 'admin', 'admin123');
  await page.goto('/admin');
  await tid(page, `admin-approve-${id}`).click();
  await expectStatus(page, id, 'APPROVED');

  await page.goto('/admin/warehouses');
  await expect(tid(page, 'warehouse-stock-BOS-EST-8')).toHaveText(String(bos - bosTake));
  await expect(tid(page, 'warehouse-stock-NJ-EST-8')).toHaveText(String(nj - njTake));
});
