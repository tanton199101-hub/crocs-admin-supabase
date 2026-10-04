# Crocs UK inspired storefront

Static, responsive storefront and Shopify-inspired admin workspace built with HTML, CSS and vanilla JavaScript.

## Run

Open `index.html` directly, or serve the directory with any static server.

Open `admin.html` to use the Crocs UK admin studio prototype.

For the theme preview and browser storage to work consistently between the admin and storefront, serve the folder over localhost (for example `npx serve .`) and open `/admin.html`. The deployed build reads and writes the single `public.store_state` row in Supabase and falls back to localStorage if the network is unavailable.

## Supabase backend

1. Run `supabase/migrations/20261004000000_create_crocs_backend.sql` in the Supabase SQL Editor.
2. Keep the publishable key in `supabase-config.js` (never use the secret/service-role key in browser code).
3. `store_state` stores the validated Crocs Studio v1 JSON document; `store_events` records sync events.
4. Run `supabase/migrations/20261004010000_create_storefront_checkout.sql` to publish the active catalogue and enable the server-validated demo checkout. The RPC creates a `storefront_orders` row, decrements stock and mirrors a safe order summary into the admin state. It does not accept card data.

The migration intentionally allows anonymous reads and writes so this static demo can work without a login. Before storing real customer or order data, add Supabase Auth and replace the demo RLS policies with authenticated/team policies.

## GitHub and Vercel

Run `npm install`, `npm test` and `npm run build` locally. Vercel uses the same build and deploys `dist/`; set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the Vercel project if you want the build to generate a config file from environment variables. The checked-in config already contains the project's publishable key, which is safe for browser use. Never add a secret/service-role key.

The repository is `https://github.com/tanton199101-hub/crocs-admin-supabase` and the production deployment is `https://crocs-admin-supabase.vercel.app`.

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
- Supabase REST sync with local fallback and an audit event table

### Product editor workflow

From Admin → Products → Add product, write the customer-facing content first, then add options such as `Colour`, `UK size` or `Material`. “Create / update combinations” preserves existing rows and only creates the new combinations. Select rows in the variant grid to set prices, apply percentage/delta adjustments, set inventory or toggle selling in one action. The SEO panel is an editorial checklist rather than a ranking score; fields are published to the storefront catalogue and structured data when the product is active.

## Scope

This is a front-end prototype based on the public Crocs UK homepage as reviewed on 3 October 2026. It does not connect to Crocs accounts, payment gateways, fulfilment or email systems. Copy, pricing and availability are sample presentation data.

Official site used as visual reference: https://www.crocs.co.uk/

Images and brand marks remain the property of their respective owners. Replace or license brand assets before commercial deployment.
