# Pet Store v2: functional spec

Build an online pet store. Customers browse a catalog, search, keep a cart, apply coupons, register, sign in and place orders with tax and shipping. Stock is reserved when an order is placed and released if the order is denied, cancelled or expires. Orders are processed asynchronously. An admin approves large orders and issues refunds.

This spec is the contract. The acceptance tests in `acceptance/` check it through the browser. Element ids (`data-testid`), routes, status strings, money formats and arithmetic rules below are exact.

## 1. Stack (required)

- Frontend: React + TypeScript, built with Vite.
- Backend: Node.js + TypeScript (Fastify or Express).
- Database: SQLite.
- One command starts everything: `npm install && npm start` from the repo root. `npm start` must build if needed, serve the frontend and the API on **http://localhost:3000**, and start the order worker (section 11) as a **separate OS process**.
- The catalog is loaded from `seed/catalog.json` and coupons from `seed/coupons.json`. Do not hardcode either. Do not edit `seed/` or `acceptance/`.

## 2. Test support API

- `GET /api/health` returns HTTP 200 only when the web server and the worker are both ready.
- `POST /api/test/reset` synchronously deletes all users, carts, orders, reservations, refunds, coupon usage and queued messages, restores the catalog and stock from `seed/catalog.json`, and recreates the admin account. It accepts an optional JSON body `{"reservationTtlSeconds": <integer>}` that sets the reservation lifetime (section 9) until the next reset. Without it, the lifetime is 900 seconds. Returns 200 when done.

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

## 6. Catalog and availability

- **Available** stock for an item = stock − units reserved by `PENDING` orders.
- `/` lists every category: `category-link-{CATEGORY_ID}` links to `/category/{CATEGORY_ID}` and shows the category name.
- `/category/:id` lists exactly the products in that category: `product-link-{PRODUCT_ID}` links to `/product/{PRODUCT_ID}` and shows the product name.
- `/product/:id` lists every item of that product: `item-row-{ITEM_ID}` contains `item-link-{ITEM_ID}` (link to `/item/{ITEM_ID}`, shows the item attribute) and `item-price-{ITEM_ID}`.
- `/item/:id` shows `item-name` (product name), `item-attribute`, `item-price`, `item-stock` and an `add-to-cart` button.
  - `item-stock` reads exactly `Out of stock` when available is 0, `Only N left` when available is 1, 2 or 3 (for example `Only 2 left`), and `In stock` otherwise.
  - `add-to-cart` is disabled when available is 0. Clicking it adds one unit of that item to the cart.
- Availability shown always reflects current reservations and sales. A page load must show the current value.

## 7. Search

- `/search?q=term` lists every product whose name or description contains the term, case-insensitive: `search-result-{PRODUCT_ID}`, linking to the product page. No other products.
- When nothing matches, show `search-empty`.

## 8. Cart, coupons, shipping

### Cart

- Works for anonymous and signed-in users. Survives a page reload. An anonymous cart is kept when the user signs in or registers.
- `/cart` shows one line per item: `cart-line-{ITEM_ID}` containing `cart-qty-{ITEM_ID}` (number input), `cart-line-total-{ITEM_ID}` and `cart-remove-{ITEM_ID}`.
- Changing `cart-qty-{ITEM_ID}` (fill + blur or Enter) updates everything on the page and `cart-count`. Quantity 0 removes the line.
- A quantity above the item's current available stock is reduced to the available stock, and `cart-line-warning-{ITEM_ID}` is shown on that line. Adding to cart never exceeds available stock either.
- `cart-subtotal` = sum of line totals. Line total = unit price × quantity.
- `cart-discount` = the coupon discount (section 8, Coupons), `$0.00` with no coupon.
- `cart-shipping` = shipping (section 8, Shipping).
- `checkout-button` goes to `/checkout`. When the cart is empty, show `cart-empty` and no `checkout-button`.

### Coupons

Coupons are defined in `seed/coupons.json`. One coupon per cart.

- `/cart` has `coupon-input` and `coupon-apply`. A valid code shows `coupon-applied` containing the code, and `coupon-remove`. An invalid code shows `coupon-error` and applies nothing.
- A code is invalid when: it does not exist (codes are case-insensitive), its `validUntil` date has passed, the cart subtotal is below `minSubtotal`, it would give a discount of $0.00, or it is `oncePerUser` and the signed-in user already has an order with that coupon whose status is `PENDING`, `APPROVED`, `PARTIALLY_REFUNDED` or `REFUNDED`. `oncePerUser` coupons require sign-in; applying one while signed out is invalid.
- Discount rules:
  - `percent`: for each **eligible line**, line discount = round half up(line total × percent / 100). The discount is the sum of line discounts. Eligible lines are all lines, or only lines whose product is in `categoryId` when it is set.
  - `fixed`: the discount is `amount`, applied to all lines.
- Whenever the cart changes, the coupon is checked again. If it is no longer valid, it is removed automatically and `coupon-error` is shown.

### Shipping

- Net = subtotal − discount.
- Shipping is $9.99, or $0.00 when net is $100.00 or more.

## 9. Checkout, tax and reservations

- `/checkout` requires sign-in. It shows `ship-address`, `ship-city`, `ship-state`, `ship-zip` prefilled from the account, `card-number`, `card-expiry` (`MM/YY`), `place-order`, and a live summary: `checkout-subtotal`, `checkout-discount`, `checkout-shipping`, `checkout-tax`, `checkout-total`. The summary updates when `ship-state` changes.
- Tax = round half up(net × rate). The rate depends on the shipping state: `MA` 6.25%, `NH` 0%, any other state 5%.
- Order total = net + shipping + tax.
- Card validation: card number must be exactly 16 digits (spaces ignored); expiry must be a valid month not in the past. On failure show `checkout-error`, create no order, reserve nothing and keep the cart.
- On placing an order, in **one atomic step**: check every line against available stock, check the coupon is still valid, create the order with status `PENDING`, and reserve its units. If any check fails, show `checkout-error`, create no order and reserve nothing. Two customers can never both reserve the last unit.
- Placing an order is idempotent: clicking `place-order` twice quickly creates exactly one order.
- On success: enqueue the order for the worker, empty the cart, and go to `/orders/{ORDER_ID}`.
- A `PENDING` order's reservation lives for the reservation lifetime (section 2). When it ends and the order is still `PENDING`, the order becomes `EXPIRED` and its reservation is released, within 10 seconds of the deadline.

## 10. Accounts and order pages

- `/register`: `register-username`, `register-password`, `register-email`, `register-first-name`, `register-last-name`, `register-address`, `register-city`, `register-state`, `register-zip`, `register-submit`. On success the user is signed in and sent to `/`. A taken username shows `register-error` and creates nothing.
- `/signin`: `signin-username`, `signin-password`, `signin-submit`, and `register-link`. Bad credentials show `signin-error`. On success, go to the page that redirected here, otherwise `/`.
- The admin account is username `admin`, password `admin123`.
- `/checkout` and `/orders` require sign-in; a signed-out visitor is redirected to `/signin` and returned afterwards. `/admin` and `/admin/orders/:id` show `forbidden` to a signed-in non-admin and redirect a signed-out visitor to `/signin`.
- `/orders/:id` (owner or admin only; others see no order details) shows `order-id`, `order-status`, `order-total`, `order-refunded` (total refunded so far, `$0.00` if none) and `order-events`: a list of `order-event` elements, oldest first, each containing exactly one of `PLACED`, `APPROVED`, `DENIED`, `CANCELLED`, `EXPIRED`, `REFUNDED` (one `REFUNDED` event per refund). The page updates without a manual reload within 3 seconds of a change.
- A `PENDING` order's page shows `cancel-order` to its owner. It sets `CANCELLED` and releases the reservation. Other statuses show no `cancel-order`.
- `/orders` lists the signed-in user's orders: `order-row-{ORDER_ID}` containing `order-row-status-{ORDER_ID}` and a link to the order page.

## 11. Order processing (asynchronous)

Automatic decisions are made only by a separate worker process that consumes a durable queue (for example a table in the SQLite database). Admin decisions may be applied by either process, but every change to stock and reservations must run in one serialized transaction.

- The worker must not decide an order sooner than 1 second after it was placed. The confirmation page always shows `PENDING` first.
- Order total under $500.00: the worker approves it within 10 seconds of placement.
- Order total $500.00 or more: stays `PENDING` until the admin approves or denies it, the customer cancels it, or it expires.
- Approval turns the order's reservation into a sale: stock goes down by the reserved units and the reservation is released. Deny, cancel and expiry release the reservation without changing stock.
- `/admin` lists pending orders of $500.00 or more: `admin-order-{ORDER_ID}` containing `admin-approve-{ORDER_ID}` and `admin-deny-{ORDER_ID}`. Decided orders leave the list.

## 12. Refunds (admin)

- `/admin/orders/:id` shows the order to the admin. For an `APPROVED` or `PARTIALLY_REFUNDED` order it shows, per line, `refund-line-{ITEM_ID}` containing `refund-remaining-{ITEM_ID}` (units not yet refunded) and `refund-qty-{ITEM_ID}` (number input, default 0), plus `refund-submit`.
- A refund covers chosen units across one or more lines. Submitting it:
  - rejects the whole refund with `refund-error` if any line's quantity exceeds its remaining units, or if all quantities are 0;
  - otherwise returns the units to stock, records the refund, adds a `REFUNDED` event, and sets the status to `REFUNDED` when no units remain, else `PARTIALLY_REFUNDED`.
- Refund amount. First allocate the order's discount to lines:
  - `percent` coupons: each line's discount is its line discount from section 8.
  - `fixed` coupons: split the amount across all lines in proportion to line totals. Every line except the one with the largest line total gets round half up(amount × line total / subtotal). The largest line gets the rest, so the parts add up exactly. If two lines tie for largest, the one with the smaller item id (string order) gets the rest.
  - Line net = line total − line discount.
- For each line in a refund, where k is the units refunded now and q is the quantity originally ordered on that line: net refund = round half up(line net × k / q); tax refund = round half up(net refund × the order's tax rate). Shipping is never refunded.
- The refund amount is the sum over its lines of net refund + tax refund. `order-refunded` shows the sum of all refunds on the order.

## 13. Done

You are done when the acceptance suite passes:

```
cd acceptance && npm install && npx playwright install chromium && npx playwright test
```

Stop there: no extra tests or features.
