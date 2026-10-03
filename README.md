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

The migration intentionally allows anonymous reads and writes so this static demo can work without a login. Before storing real customer or order data, add Supabase Auth and replace the demo RLS policies with authenticated/team policies.

## GitHub and Vercel

Run `npm install`, `npm test` and `npm run build` locally. Vercel uses the same build and deploys `dist/`; set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the Vercel project if you want the build to generate a config file from environment variables. The checked-in config already contains the project's publishable key, which is safe for browser use. Never add a secret/service-role key.

The repository is `https://github.com/tanton199101-hub/crocs-admin-supabase` and the production deployment is `https://crocs-admin-supabase.vercel.app`.

## Included

- Responsive header, navigation drawer, search and account UI
- Campaign banners and horizontally scrollable product rails
- Shopping bag, favourites and accessory tabs
- Newsletter form feedback and keyboard Escape handling
- Local campaign/product image assets for reliable rendering
- Local TT Crocs and Karl ST font files for offline visual fidelity
- Shopify-inspired admin workspace with dashboard, orders, product catalog, customers, theme, navigation, analytics, marketing and settings
- Supabase REST sync with local fallback and an audit event table

## Scope

This is a front-end prototype based on the public Crocs UK homepage as reviewed on 3 October 2026. It does not connect to Crocs accounts, payment gateways, fulfilment or email systems. Copy, pricing and availability are sample presentation data.

Official site used as visual reference: https://www.crocs.co.uk/

Images and brand marks remain the property of their respective owners. Replace or license brand assets before commercial deployment.
