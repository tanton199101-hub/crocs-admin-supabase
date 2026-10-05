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
