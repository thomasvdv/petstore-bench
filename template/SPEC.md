# Pet Store: functional spec

Build an online pet store. Customers browse a catalog, search, keep a cart, register, sign in and place orders. Orders are processed asynchronously. An admin approves or denies large orders.

This spec is the contract. The acceptance tests in `acceptance/` check it through the browser. Element ids (`data-testid`), routes, status strings and money formats below are exact.

## 1. Stack (required)

- Frontend: React + TypeScript, built with Vite.
- Backend: Node.js + TypeScript (Fastify or Express).
- Database: SQLite.
- One command starts everything: `npm install && npm start` from the repo root. `npm start` must build if needed and serve the frontend and the API on **http://localhost:3000**, and also start the order worker (section 8) as a **separate OS process**.
- The catalog is loaded from `seed/catalog.json`. Do not hardcode catalog data. Do not edit `seed/` or `acceptance/`.

## 2. Test support API

- `GET /api/health` returns HTTP 200 only when the web server and the worker are both ready.
- `POST /api/test/reset` synchronously deletes all users, carts, orders and queued messages, restores the catalog and stock levels from `seed/catalog.json`, and recreates the admin account. Returns 200 when done.

## 3. Money and statuses

- Money renders in US format with a dollar sign, thousands separator and two decimals: `$16.50`, `$1,250.00`.
- Order statuses render exactly as `PENDING`, `APPROVED` or `DENIED`.

## 4. Header (every page)

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

## 5. Catalog

- `/` lists every category: `category-link-{CATEGORY_ID}` links to `/category/{CATEGORY_ID}` and shows the category name.
- `/category/:id` lists exactly the products in that category: `product-link-{PRODUCT_ID}` links to `/product/{PRODUCT_ID}` and shows the product name.
- `/product/:id` lists every item of that product: `item-row-{ITEM_ID}` contains `item-link-{ITEM_ID}` (link to `/item/{ITEM_ID}`, shows the item attribute) and `item-price-{ITEM_ID}`.
- `/item/:id` shows `item-name` (product name), `item-attribute`, `item-price`, `item-stock` and an `add-to-cart` button.
  - `item-stock` reads exactly `In stock` when stock > 0 and `Out of stock` when stock is 0.
  - `add-to-cart` is disabled when stock is 0. Clicking it adds one unit of that item to the cart.
- Stock shown is the current stock after approved orders (section 8).

## 6. Search

- `/search?q=term` lists every product whose name or description contains the term, case-insensitive: `search-result-{PRODUCT_ID}`, linking to the product page.
- No other products are listed.
- When nothing matches, show `search-empty`.

## 7. Cart

- Works for anonymous and signed-in users. Survives a page reload. An anonymous cart is kept when the user signs in or registers.
- `/cart` shows one line per item: `cart-line-{ITEM_ID}` containing `cart-qty-{ITEM_ID}` (number input), `cart-line-total-{ITEM_ID}` and `cart-remove-{ITEM_ID}`.
- Changing `cart-qty-{ITEM_ID}` (fill + blur or Enter) updates the line total, subtotal and `cart-count`. Quantity 0 removes the line.
- `cart-subtotal` shows the sum of line totals.
- `checkout-button` goes to `/checkout`.
- When the cart is empty, show `cart-empty` and no `checkout-button`.

## 8. Accounts

- `/register`: `register-username`, `register-password`, `register-email`, `register-first-name`, `register-last-name`, `register-address`, `register-city`, `register-state`, `register-zip`, `register-submit`. On success the user is signed in and sent to `/`. A taken username shows `register-error` and creates nothing.
- `/signin`: `signin-username`, `signin-password`, `signin-submit`, and `register-link` to `/register`. Bad credentials show `signin-error`. On success, go to the page that redirected here, otherwise `/`.
- The admin account is username `admin`, password `admin123`.
- `/checkout` and `/orders` require sign-in. A signed-out visitor is redirected to `/signin` and returned afterwards.
- `/admin` for a signed-in non-admin shows `forbidden` and no admin controls. A signed-out visitor is redirected to `/signin`.

## 9. Checkout and orders

- `/checkout` shows `ship-address`, `ship-city`, `ship-state`, `ship-zip` prefilled from the account, plus `card-number`, `card-expiry` (`MM/YY`) and `place-order`.
- Card validation: card number must be exactly 16 digits (spaces ignored); expiry must be a valid month not in the past. On failure show `checkout-error`, create no order and keep the cart.
- On success: create the order with status `PENDING`, enqueue it for the worker, empty the cart and go to `/orders/{ORDER_ID}`.
- `/orders/:id` (owner or admin only) shows `order-id`, `order-status` and `order-total`. The status updates without a manual reload within 3 seconds of a change.
- `/orders` lists the signed-in user's orders: `order-row-{ORDER_ID}` containing `order-row-status-{ORDER_ID}` and a link to the order page.

## 10. Order processing (asynchronous)

Automatic decisions are made only by a separate worker process that consumes a durable queue (for example a table in the SQLite database). The web server never auto-approves. Admin decisions may be applied by either process, but every stock check and decrement must run in one serialized transaction.

- The worker must not process an order sooner than 1 second after it was placed. The confirmation page therefore always shows `PENDING` first.
- Order total under $500.00: the worker approves it automatically within 10 seconds of placement.
- Order total $500.00 or more: stays `PENDING` and appears on `/admin` until the admin acts.
- Approval, automatic or by the admin, checks stock for every line at that moment. If every line has enough stock, decrement stock and set `APPROVED`. Otherwise set `DENIED` and change no stock. Approvals are processed one at a time, so two orders can never both take the last unit.
- `/admin` lists pending orders of $500.00 or more: `admin-order-{ORDER_ID}` containing `admin-approve-{ORDER_ID}` and `admin-deny-{ORDER_ID}`. Deny sets `DENIED` with no stock change. Decided orders leave the list.

## 11. Done

You are done when the acceptance suite passes:

```
cd acceptance && npm install && npx playwright install chromium && npx playwright test
```
