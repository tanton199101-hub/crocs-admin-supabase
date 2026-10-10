# Crocs UK inspired storefront

Static, responsive storefront and Shopify-inspired admin workspace built with HTML, CSS and vanilla JavaScript.

## Run

Open `index.html` directly, or serve the directory with any static server.

Open `admin.html` to use the Crocs UK admin studio prototype.

For the theme preview and browser storage to work consistently between the admin and storefront, serve the folder over localhost (for example `npx serve .`) and open `/admin.html`. The deployed build reads and writes the single `public.store_state` row in Supabase and falls back to localStorage if the network is unavailable.

## Supabase backend

1. Run `supabase/migrations/20261004000000_create_crocs_backend.sql` in the Supabase SQL Editor.
2. Keep the publishable key in `supabase-config.js` (never use the secret/service-role key in browser code).
3. `store_state` stores the validated Crocs Studio v1 JSON document; `store_events` records sync events. The hardening migration adds `store_members`, Auth-gated admin RPCs, optimistic version checks and a public catalogue projection that never includes customers, orders or draft admin data.
4. Run `supabase/migrations/20261004010000_create_storefront_checkout.sql` to publish the active catalogue and enable the server-validated demo checkout. The RPC creates a `storefront_orders` row, decrements stock and mirrors a safe order summary into the admin state. It does not accept card data.
5. For real Stripe Checkout, first apply `supabase/migrations/20261004030000_create_stripe_checkout.sql`. It adds private, short-lived checkout reservations, idempotent webhook events and Stripe payment/order fields. The migration deliberately grants the reservation/webhook RPCs only to `service_role`.
6. If the storefront RPC was already deployed, also apply `supabase/migrations/20261004040000_add_regional_catalog_config.sql` so public pages receive the saved region rules. Vercel’s `/api/geo` function reads `x-vercel-ip-country` (with browser-locale fallback locally) and never exposes the visitor IP itself.
7. Apply `supabase/migrations/20261004050000_enable_regional_checkout.sql` after the regional catalog and Stripe migrations. It adds server-authoritative regional demo orders and Stripe reservations; the browser never submits a trusted price.

The original migration is intentionally permissive for the early demo. Before using real data, run `supabase/migrations/20261004020000_harden_public_and_admin.sql`. The first authenticated user claims the default store as owner; later users must be added to `store_members`. Anonymous callers can use only the public catalogue and checkout RPCs. Admin writes use a version-checked RPC, so two tabs cannot silently overwrite one another.

## GitHub and Vercel

Run `npm install`, `npm test` and `npm run build` locally. Vercel uses the same build and deploys `dist/`; set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the Vercel project if you want the build to generate a config file from environment variables. The checked-in config already contains the project's publishable key, which is safe for browser use. Never add a secret/service-role key.

The repository is `https://github.com/tanton199101-hub/crocs-admin-supabase` and the production deployment is `https://crocs-admin-supabase.vercel.app`.

## Stripe Checkout setup

The admin Settings → Thanh toán screen stores only the provider, Test/Live mode and payment-method preference in the private store state. It never accepts or displays secret values. Add the following server-side environment variables in Vercel, using Test mode first:

```text
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STOREFRONT_URL=https://crocs-admin-supabase.vercel.app
STRIPE_ALLOW_LIVE=false
```

Create a Stripe webhook for `https://crocs-admin-supabase.vercel.app/api/stripe/webhook` and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. The endpoint verifies the raw Stripe signature and uses the webhook—not the return URL—as the source of truth for payment and order creation. Use Stripe’s `4242 4242 4242 4242` test card while `sk_test_...` is configured. Do not commit any secret or paste one into chat.

## Amazon Custom channel

Amazon Custom is exposed as Admin → Amazon Custom. The Supabase store document remains the source of truth for product content, Amazon price-by-marketplace and customization profiles; Amazon Seller Central remains the authority for product-type approval and the final customization template. The channel always uses merchant-fulfilled inventory.

Before opening the channel in production:

1. Apply `supabase/migrations/20261005000000_add_amazon_channel.sql` after the admin hardening migration. It creates private listing/profile/job tables with RLS; only authenticated members can read them and only the server service role can write sync results.
2. Add the server-only Amazon variables from `.env.example` to Vercel. Use an Amazon SP-API application with LWA refresh-token access and an IAM user/role permitted to call `execute-api`. Never put an LWA secret, refresh token or AWS key in `store_state`, browser storage or `dist/`.
3. In Admin → Amazon Custom, add only marketplaces that are enabled in the seller account. Enter a separate minor-unit price for every marketplace—GBP must not be relabelled as USD—and choose the product type returned by Amazon’s Product Type Definitions API.
4. Select a product, define up to five surfaces, fifteen customizations per surface and one hundred options in total, then save the profile. `Validate` is dry-run and blocks missing prices, invalid profiles and unconfirmed Seller Central templates. `Fetch definition` reads the selected product type from SP-API. `Publish ready` submits at most twenty listings per request through `/api/amazon/sync`.
5. Keep `syncMode=manual` until a listing has been tested in Seller Central, a personalization order has been received, artwork/proof handling has been verified and merchant-fulfilled delivery has been reconciled. Automatic inventory/order workers are deliberately a later rollout step.

The API signs SP-API requests server-side, caches LWA access tokens briefly, records listing revisions/issues in `amazon_listings` when the service-role key is available, and never logs credentials or customer customization content. Customer-entered text and artwork should be stored with the order (and, for artwork, in a private Supabase Storage bucket) rather than generating a new SKU for every order.

## 1688 shop catalog import

`scripts/import-1688-shop.mjs` imports a complete 1688 shop catalog through the public MTop offer-list API. It paginates until the server-reported total, retries transient/token failures, translates Chinese titles to Vietnamese, and writes an idempotent JSON file for Admin → Products → Nhập JSON. The importer keeps every item in `Draft`, uses `1688-{offerId}` as the stable SKU, and stores the source offer/image URL in `source` for later licensing and image hosting review.

For a CNY shop where the Vietnam selling price is twice the converted source price:

```text
node scripts/import-1688-shop.mjs --shop-url "https://shop1481820794169.1688.com/" --member-id "b2b-305059698170e97" --multiplier 2 --output "1688-shop-import.json"
```

The generated products keep a base-currency amount in `price` and the exact Vietnamese selling amount in `regionalPrices.vn` (`CNY × exchangeRateCnyVnd × multiplier`, rounded to whole VND). The exchange-rate snapshot and import metadata are written beside the JSON file. Do not publish the drafts until stock, variants, image rights and supplier terms have been checked.

Every 1688 import/enrichment pass uses the same presentation normalizer: Vietnamese titles are capped at 56 characters by default, option names/values are translated through the shared cache at `assets/catalog-1688/variation-translations.vi.json`, and verified description HTML images are rewritten to the allowlisted `/api/1688-image` proxy. To re-run the normalizer after a static catalog refresh:

```text
node scripts/localize-1688-catalog.mjs --catalog assets/catalog-1688 --max-title-length 56
```

`scripts/enrich-1688-products.mjs` accepts the same `--max-title-length` and translation-cache options. Detail images are shown only when 1688 returns them (or a verified detail manifest supplies them); CAPTCHA/empty responses are recorded as blocked and never replaced with invented media.

## Included

- Responsive header, navigation drawer, search and account UI
- Campaign banners and horizontally scrollable product rails
- Shopping bag, favourites and accessory tabs
- Product detail pages with size/quantity selection and a mobile-first demo checkout
- Full-page product workspace with up to three option axes and 100 generated variants per product
- Variant-level SKU, sale/compare-at/cost price, barcode, stock and publish switches, plus bulk price/stock edits with undo
- Product SEO fields, Google-style preview, content checklist, canonical/robots meta and ProductGroup JSON-LD on the storefront
- Newsletter form feedback and keyboard Escape handling
- Local campaign/product image assets for reliable rendering
- Local TT Crocs and Karl ST font files for offline visual fidelity
- Shopify-inspired admin workspace with dashboard, orders, product catalog, customers, theme, navigation, analytics, marketing and settings
- Supabase REST sync with local fallback, retry/backoff after outages and an audit event table
- IP-based regional storefronts with language/currency pickers, region-specific exchange rates, price multipliers and per-product price overrides configured in Admin → Settings → Khu vực & ngôn ngữ
- Auth-gated admin with owner/member roles, conflict recovery and a private admin state RPC
- Public storefront projection, short-lived catalogue cache, immutable asset caching and hero-image preloading

### Product editor workflow

From Admin → Products → Add product, write the customer-facing content first, then add options such as `Colour`, `UK size` or `Material`. “Create / update combinations” preserves existing rows and only creates the new combinations. Select rows in the variant grid to set prices, apply percentage/delta adjustments, set inventory or toggle selling in one action. The SEO panel is an editorial checklist rather than a ranking score; fields are published to the storefront catalogue and structured data when the product is active.

## Scope

This is a front-end prototype based on the public Crocs UK homepage as reviewed on 3 October 2026. It does not connect to Crocs accounts, payment gateways, fulfilment or email systems. Copy, pricing and availability are sample presentation data.

Official site used as visual reference: https://www.crocs.co.uk/

Images and brand marks remain the property of their respective owners. Replace or license brand assets before commercial deployment.
