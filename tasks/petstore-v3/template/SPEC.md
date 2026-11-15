# Pet Store v3: functional spec

Build an online pet store. Customers browse a catalog, search, keep a cart, stack coupons, register, sign in and place orders with tax, shipping, gift cards and a card. Stock is held in warehouses and reserved when an order is placed; reservations are released if the order is denied, cancelled or expires. Orders are processed asynchronously. An admin approves large orders, edits prices and issues refunds.

This spec is the contract. The acceptance tests in `acceptance/` check it through the browser. Element ids (`data-testid`), routes, status strings, money formats and arithmetic rules below are exact.

## 1. Stack (required)

- Frontend: React + TypeScript, built with Vite.
- Backend: Node.js + TypeScript (Fastify or Express).
- Database: SQLite.
- One command starts everything: `npm install && npm start` from the repo root. `npm start` must build if needed, serve the frontend and the API on **http://localhost:3000**, and start the order worker (section 10) as a **separate OS process**.
- The catalog is loaded from `seed/catalog.json`, warehouses and their stock from `seed/warehouses.json`, coupons from `seed/coupons.json` and gift cards from `seed/giftcards.json`. Do not hardcode any of them. Do not edit `seed/` or `acceptance/`.
- **Seed variants.** Variant 1 uses those four files directly in `seed/`. Variants 2 and 3 use `seed/variants/v2/` and `seed/variants/v3/`, each containing the same four file names with the same category, product, item, coupon code, gift card code and warehouse id. Prices, stock, coupon values, gift card balances and warehouse splits differ. The judge supplies those variant directories for holdout runs, so their contents are not visible while you work. Load the selected variant's files at reset; do not hardcode their values.

## 2. Test support API and the business clock

- `GET /api/health` returns HTTP 200 only when the web server and the worker are both ready.
- `POST /api/test/reset` synchronously deletes all users, carts, orders, reservations, refunds, payments, coupon usage and queued messages, restores the catalog, warehouse stock, coupons and gift card balances from the seed files, and recreates the admin account. It returns 200 when done.
  - It accepts an optional JSON body `{"reservationTtlSeconds": <integer>, "now": <ISO-8601 instant>, "variant": <positive integer>}`. `reservationTtlSeconds` sets the reservation lifetime (section 8) until the next reset; without it the lifetime is 900 seconds. `variant` selects the seed set (section 1); without it the variant is 1. An unknown variant returns 400. The visible suite uses variant 1.
  - `now` sets the **business clock**: the server clock plus a stored offset, such that the business clock reads `now` at that moment. The business clock continues to advance with real time. Without `now` the offset is zero.
- `POST /api/test/advance-time` accepts `{"seconds": <non-negative number>}`. It adds that many seconds to the business clock offset and returns 200. It must not block waiting for the worker. The worker must apply work that becomes due (reservation expiry, queued approvals) within 3 seconds of real time after the advance.
- Every business timestamp uses the business clock: coupon validity, order `placed_at` and `expires_at`, reservation expiry, the worker's 1-second delay, and event times. Worker health and the `/api/health` heartbeat use real time.

## 3. Money

- Store and compute money in integer cents. Never use floating-point arithmetic for money that is stored or shown.
- **Round half up** means: round to the nearest cent, and exact halves go up (2.5 cents becomes 3 cents). All amounts here are non-negative.
- Money renders in US format with a dollar sign, thousands separator and two decimals: `$16.50`, `$1,250.00`, `$0.00`.

## 4. Statuses

Order statuses render exactly as: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`, `EXPIRED`, `PARTIALLY_REFUNDED`, `REFUNDED`.

## 5. Header (every page)

| testid | element |
|---|---|
| `search-input` | text input |
| `search-submit` | button; navigates to `/search?q=<term>` |
| `cart-link` | link to `/cart` |
| `cart-count` | total quantity of all cart lines, `0` when empty |
| `signin-link` | link to `/signin`; shown only when signed out |
| `account-name` | the signed-in user's username; shown only when signed in |
| `orders-link` | link to `/orders`; shown only when signed in |
| `admin-link` | link to `/admin`; shown only to the admin |
| `signout-button` | signs out; shown only when signed in |

## 6. Catalog, search and prices

- **Available** stock for an item = the sum of its stock across all warehouses − units reserved by `PENDING` orders.
- `/` lists every category: `category-link-{CATEGORY_ID}` links to `/category/{CATEGORY_ID}` and shows the category name.
- `/category/:id` lists exactly the products in that category: `product-link-{PRODUCT_ID}` links to `/product/{PRODUCT_ID}` and shows the product name.
- `/product/:id` lists every item of that product: `item-row-{ITEM_ID}` contains `item-link-{ITEM_ID}` (link to `/item/{ITEM_ID}`, shows the item attribute) and `item-price-{ITEM_ID}`.
- `/item/:id` shows `item-name` (product name), `item-attribute`, `item-price`, `item-stock` and an `add-to-cart` button.
  - `item-stock` reads exactly `Out of stock` when available is 0, `Only N left` when available is 1, 2 or 3 (for example `Only 2 left`), and `In stock` otherwise.
  - `add-to-cart` is disabled when available is 0. Clicking it adds one unit of that item to the cart.
  - `item-price` and `item-stock` always reflect the current catalog and reservations; a page load must show the current values.
- `/search?q=term` lists every product whose name or description contains the term, case-insensitive: `search-result-{PRODUCT_ID}`, linking to the product page. No other products.
- When nothing matches, show `search-empty`.

## 7. Cart, stacked coupons and shipping

### Cart

- Works for anonymous and signed-in users. Survives a page reload. An anonymous cart is kept when the user signs in or registers.
- `/cart` shows one line per item: `cart-line-{ITEM_ID}` containing `cart-qty-{ITEM_ID}` (number input), `cart-line-total-{ITEM_ID}` and `cart-remove-{ITEM_ID}`.
- Changing `cart-qty-{ITEM_ID}` (fill + blur or Enter) updates everything on the page and `cart-count`. Quantity 0 removes the line.
- A quantity above the item's current available stock is reduced to the available stock, and `cart-line-warning-{ITEM_ID}` is shown on that line. Adding to cart never exceeds available stock either.
- `cart-subtotal` = sum of line totals at current item prices. Line total = unit price × quantity.
- `cart-discount` = the total discount from the selected coupons (section 7, Coupons), `$0.00` with no selected coupons.
- `cart-shipping` = shipping (section 7, Shipping).
- `checkout-button` goes to `/checkout`. When the cart is empty, show `cart-empty` and no `checkout-button`.

### Coupons

Coupons are defined in `seed/coupons.json`. The cart holds an ordered list of entered coupon codes. One coupon from each `groupId` may be selected; coupons from different groups stack.

- `/cart` has `coupon-input` and `coupon-apply`.
- Applying a code:
  - Codes are case-insensitive and stored/displayed uppercase.
  - A code is invalid when: it does not exist; its `validUntil` date has passed; the cart subtotal is below `minSubtotal`; it would give a discount of $0.00; or it is `oncePerUser` and the signed-in user already has an order with that coupon whose status is `PENDING`, `APPROVED`, `PARTIALLY_REFUNDED` or `REFUNDED`. `oncePerUser` coupons require sign-in; applying one while signed out is invalid.
  - A coupon is valid while the business clock's UTC date is on or before `validUntil` (`YYYY-MM-DD`).
  - An invalid code shows `coupon-error` and is not added.
  - A valid code is added to the entered list. The same code cannot be entered twice.
  - Up to five codes may be entered; a sixth shows `coupon-error`.
- Each entered code shows `coupon-chip-{CODE}` and `coupon-remove-{CODE}`. `coupon-remove-{CODE}` removes that code.
- The app selects the **best valid subset** of the entered codes: at most one coupon per `groupId`, maximizing `cart-discount`. If two subsets tie on discount, prefer the one with fewer coupons; if still tied, prefer the subset whose uppercase codes, sorted ascending and joined with commas, form the lexicographically smallest string.
- Each selected coupon shows `coupon-selected-{CODE}`. `coupon-applied` is visible when at least one coupon is selected and contains the selected codes joined by `, ` in ascending code order.
- Whenever the cart changes, every entered coupon is checked again. Invalid coupons are removed from the entered list and `coupon-error` is shown. The best subset is recomputed.
- Discount rules for one selected coupon:
  - `percent`: for each **eligible line**, line discount = round half up(line total × percent / 100). The discount is the sum of line discounts. Eligible lines are all lines, or only lines whose product is in `categoryId` when it is set.
  - `fixed`: the amount is applied to all lines. Every line except the one with the largest line total gets round half up(amount × line total / subtotal); the largest line gets the rest, so the parts add up exactly. If two lines tie for largest, the one with the smaller item id (string order) gets the rest. The amount is capped at the subtotal.
- When several coupons are selected, each line's discount is the sum of the selected coupons' line discounts, capped at that line's total. `cart-discount` is the sum of those capped line discounts. The best subset is chosen using this final capped total, not the sum of each coupon's standalone discount.
- The order stores the selected coupon codes and the final per-line discounts.

### Shipping

- Net = subtotal − discount.
- Shipping is $9.99, or $0.00 when net is $100.00 or more.

## 8. Checkout, tax and reservations

- `/checkout` requires sign-in. It shows `ship-address`, `ship-city`, `ship-state`, `ship-zip` prefilled from the account, `card-number`, `card-expiry` (`MM/YY`), `place-order`, and a live summary: `checkout-subtotal`, `checkout-discount`, `checkout-shipping`, `checkout-tax`, `checkout-total`, `checkout-giftcard`, `checkout-card`. The summary updates when `ship-state` changes or a gift card is applied or removed.
- Tax = round half up(net × rate). The rate depends on the shipping state: `MA` 6.25%, `NH` 0%, any other state 5%.
- Order total = net + shipping + tax.
- Gift cards:
  - `/checkout` has `giftcard-input`, `giftcard-apply`, `giftcard-error`, `giftcard-applied` and `giftcard-remove`.
  - One gift card may be applied per order. Codes are case-insensitive.
  - Applying a code with a positive balance replaces the current gift card and shows `giftcard-applied` containing the code. An unknown or zero-balance code shows `giftcard-error` and keeps the current gift card.
  - `giftcard-remove` clears the applied gift card.
  - The gift card amount = min(gift card balance, order total). `checkout-giftcard` shows that amount; `checkout-card` shows order total − gift card amount. With no gift card, `checkout-giftcard` is `$0.00` and `checkout-card` equals the total.
  - The gift card balance is not deducted until the order is placed.
- Card validation: card number must be exactly 16 digits (spaces ignored); expiry must be a valid month not in the past. On failure show `checkout-error`, create no order, reserve nothing, deduct nothing and keep the cart.
- On placing an order, in **one atomic step**: check every line against available stock; check the selected coupon subset is still valid; check the applied gift card still has at least the gift card amount shown at checkout; create the order with status `PENDING`; reserve its units; deduct the gift card amount; record the card amount; empty the cart. If any check fails, show `checkout-error`, create no order, reserve nothing, deduct nothing and keep the cart.
- Two customers can never both reserve the last unit, and a gift card can never be spent twice.
- Placing an order is idempotent: clicking `place-order` twice quickly creates exactly one order and one set of payments.
- On success: enqueue the order for the worker, empty the cart, and go to `/orders/{ORDER_ID}`.
- A `PENDING` order's reservation lives for the reservation lifetime (section 2). When it ends and the order is still `PENDING`, the order becomes `EXPIRED` and its reservation is released, within 10 seconds of the deadline on the business clock.
- The worker must not decide an order sooner than 1 second of business time after it was placed. The confirmation page always shows `PENDING` first.

## 9. Accounts and order pages

- `/register`: `register-username`, `register-password`, `register-email`, `register-first-name`, `register-last-name`, `register-address`, `register-city`, `register-state`, `register-zip`, `register-submit`. On success the user is signed in and sent to `/`. A taken username shows `register-error` and creates nothing.
- `/signin`: `signin-username`, `signin-password`, `signin-submit`, and `register-link`. Bad credentials show `signin-error`. On success, go to the page that redirected here, otherwise `/`.
- The admin account is username `admin`, password `admin123`.
- `/checkout` and `/orders` require sign-in; a signed-out visitor is redirected to `/signin` and returned afterwards. `/admin`, `/admin/orders/:id` and `/admin/items` show `forbidden` to a signed-in non-admin and redirect a signed-out visitor to `/signin`.
- `/orders/:id` (owner or admin only; others see no order details) shows:
  - `order-id`, `order-status`, `order-total`, `order-refunded` (total refunded so far, `$0.00` if none), `order-giftcard` (gift card amount paid, `$0.00` if none), `order-card` (card amount paid), `order-refunded-giftcard` (gift card refunded so far), `order-refunded-card` (card refunded so far).
  - `order-events`: a list of `order-event` elements, oldest first, each containing exactly one of `PLACED`, `APPROVED`, `DENIED`, `CANCELLED`, `EXPIRED`, `REFUNDED` (one `REFUNDED` event per refund).
  - One `order-line-{ITEM_ID}` per ordered line, containing `order-line-price-{ITEM_ID}` (the unit price at order time) and `order-line-qty-{ITEM_ID}`.
  - The page updates without a manual reload within 3 seconds of a change.
- A `PENDING` order's page shows `cancel-order` to its owner. It sets `CANCELLED` and releases the reservation. Other statuses show no `cancel-order`.
- `/orders` lists the signed-in user's orders: `order-row-{ORDER_ID}` containing `order-row-status-{ORDER_ID}` and a link to the order page.

## 10. Order processing (asynchronous)

Automatic decisions are made only by a separate worker process that consumes a durable queue (for example a table in the SQLite database). Admin decisions may be applied by either process, but every change to stock and reservations must run in one serialized transaction.

- The worker must not decide an order sooner than 1 second of business time after it was placed.
- Order total under $500.00: the worker approves it within 10 seconds of business time after placement.
- Order total $500.00 or more: stays `PENDING` until the admin approves or denies it, the customer cancels it, or it expires.
- On placement, each line is allocated across warehouses in **ascending warehouse id order**: take `min(remaining units, that warehouse's stock − its units reserved by PENDING orders)` from each until the line is covered. If any line cannot be fully covered, the whole order fails atomically. The allocation is stored with the order.
- Approval turns the order's reservation into a sale: the allocated stock goes down in each warehouse and the reservation is released. Deny, cancel and expiry release the reservation without changing stock.
- `/admin` lists pending orders of $500.00 or more: `admin-order-{ORDER_ID}` containing `admin-approve-{ORDER_ID}` and `admin-deny-{ORDER_ID}`. Decided orders leave the list. `/admin` also has `admin-items-link` to `/admin/items` and `admin-warehouses-link` to `/admin/warehouses`.

## 11. Refunds (admin)

- `/admin/orders/:id` shows the order to the admin. For an `APPROVED` or `PARTIALLY_REFUNDED` order it shows, per line, `refund-line-{ITEM_ID}` containing `refund-remaining-{ITEM_ID}` (units not yet refunded) and `refund-qty-{ITEM_ID}` (number input, default 0), plus `refund-submit`.
- A refund covers chosen units across one or more lines. Submitting it:
  - rejects the whole refund with `refund-error` if any line's quantity exceeds its remaining units, or if all quantities are 0;
  - otherwise returns the units to stock, records the refund, adds a `REFUNDED` event, and sets the status to `REFUNDED` when no units remain, else `PARTIALLY_REFUNDED`.
- Refund amount. First allocate the order's discount to lines:
  - `percent` coupons: each line's discount is its line discount from section 7.
  - `fixed` coupons: split the amount across all lines in proportion to line totals. Every line except the one with the largest line total gets round half up(amount × line total / subtotal). The largest line gets the rest, so the parts add up exactly. If two lines tie for largest, the one with the smaller item id (string order) gets the rest.
  - For stacked coupons, use the order's stored final per-line discount (section 7), which is already the combined, capped allocation.
  - Line net = line total − line discount.
- For each line in a refund, where k is the units refunded now and q is the quantity originally ordered on that line: net refund = round half up(line net × k / q); tax refund = round half up(net refund × the order's tax rate). Shipping is never refunded.
- The refund amount is the sum over its lines of net refund + tax refund. `order-refunded` shows the sum of all refunds on the order.
- Refunded units return to the warehouses recorded for the order line, in ascending warehouse id order, up to the units originally allocated there.
- Refund tender allocation: the refund amount goes first to the gift card used on the order, up to the gift card amount paid and not yet refunded; the remainder goes to the card. If no gift card was used, the whole refund goes to the card. The gift card balance increases by the gift card part. `order-refunded-giftcard` and `order-refunded-card` show the cumulative amounts.
- Refunds use the order's stored unit prices, quantities and discounts, not current catalog prices or current coupon definitions.

## 12. Admin item prices and warehouses

- `/admin/items` is admin only. It lists every item as `admin-item-{ITEM_ID}` containing `admin-item-price-{ITEM_ID}` (text input, dollars, for example `16.50`) and `admin-item-save-{ITEM_ID}`.
- Saving a valid price updates that item's current price and shows `admin-item-saved-{ITEM_ID}`. A valid price is a non-negative dollar amount with at most two decimal places. An invalid price shows `admin-item-error` and changes nothing.
- The item page, category page, product page and cart use the current price immediately. A placed order keeps the unit price, line total, discount and net it had at placement; refunds use those stored values.
- A placed order's `/orders/:id` page shows its stored unit prices in `order-line-price-{ITEM_ID}`.
- `/admin/warehouses` is admin only. It lists every item's per-warehouse stock as `warehouse-stock-{WAREHOUSE_ID}-{ITEM_ID}` containing the number of units. Signed-out visitors are redirected to `/signin`; a signed-in non-admin sees `forbidden`.

## 13. Done

You are done when the acceptance suite passes:

```
cd acceptance && npm install && npx playwright install chromium && npx playwright test
```

Stop there: no extra tests or features.
