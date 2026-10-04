-- Stripe Checkout integration.
--
-- The browser never writes orders or prices. A short-lived attempt reserves
-- stock in the private JSON state, and the signed Stripe webhook converts that
-- reservation into one paid order. Replayed events are harmless.

create extension if not exists pgcrypto;

alter table public.storefront_orders
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_livemode boolean not null default false;

alter table public.storefront_orders drop constraint if exists storefront_orders_payment_status_check;
alter table public.storefront_orders add constraint storefront_orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'failed', 'refunded', 'expired', 'review'));
create unique index if not exists storefront_orders_stripe_session_idx
  on public.storefront_orders (stripe_session_id) where stripe_session_id is not null;
create index if not exists storefront_orders_payment_status_idx
  on public.storefront_orders (payment_status, created_at desc);

create table if not exists public.stripe_checkout_attempts (
  id uuid primary key,
  order_id uuid not null,
  fingerprint text not null,
  rate_key text not null,
  mode text not null check (mode in ('test', 'live')),
  email text not null,
  customer_name text not null,
  phone text not null default '',
  shipping_address text not null,
  city text not null,
  postcode text not null,
  delivery_method text not null check (delivery_method in ('standard', 'express')),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  subtotal integer not null check (subtotal >= 0),
  shipping integer not null check (shipping >= 0),
  total integer not null check (total = subtotal + shipping),
  currency text not null default 'gbp' check (currency = 'gbp'),
  status text not null default 'reserved' check (status in ('reserved', 'paid', 'failed', 'expired', 'released', 'review')),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists stripe_checkout_attempts_rate_idx
  on public.stripe_checkout_attempts (rate_key, created_at desc);
create index if not exists stripe_checkout_attempts_expiry_idx
  on public.stripe_checkout_attempts (status, expires_at);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  status text not null,
  attempt_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz not null default timezone('utc', now()),
  detail text
);
create index if not exists stripe_webhook_events_created_idx
  on public.stripe_webhook_events (created_at desc);

alter table public.stripe_checkout_attempts enable row level security;
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_checkout_attempts from public, anon, authenticated;
revoke all on public.stripe_webhook_events from public, anon, authenticated;

create or replace function public.storefront_payment_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'provider', 'stripe',
    'enabled', coalesce((state.payload->'settings'->'payment'->>'enabled')::boolean, false),
    'mode', case when state.payload->'settings'->'payment'->>'mode' = 'live' then 'live' else 'test' end,
    'methods', case when state.payload->'settings'->'payment'->>'methods' = 'card' then 'card' else 'automatic' end
  )
  from public.store_state as state
  where state.id = 'default';
$$;

revoke all on function public.storefront_payment_v1() from public, anon, authenticated;
grant execute on function public.storefront_payment_v1() to anon, authenticated;

create or replace function public.stripe_checkout_reserve_v1(
  p_request_id uuid,
  p_fingerprint text,
  p_rate_key text,
  p_customer jsonb,
  p_lines jsonb,
  p_delivery_method text,
  p_mode text
)
returns public.stripe_checkout_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.stripe_checkout_attempts%rowtype;
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
  v_products jsonb;
  v_product jsonb;
  v_line jsonb;
  v_order_lines jsonb := '[]'::jsonb;
  v_quantities jsonb := '{}'::jsonb;
  v_variant_quantities jsonb := '{}'::jsonb;
  v_checked_lines jsonb := '[]'::jsonb;
  v_product_id text;
  v_variant_id text;
  v_size text;
  v_category text;
  v_quantity integer;
  v_previous_quantity integer;
  v_product_previous_quantity integer;
  v_stock integer;
  v_price integer;
  v_variant jsonb;
  v_variant_key text;
  v_variant_title text;
  v_subtotal integer := 0;
  v_shipping integer;
  v_total integer;
  v_order_id uuid := gen_random_uuid();
  v_now timestamptz := timezone('utc', now());
  v_key text;
  v_amount integer;
  v_new_products jsonb;
  v_candidate jsonb;
  v_variant_item jsonb;
  v_new_variants jsonb;
  v_customer_name text := nullif(trim(p_customer->>'name'), '');
  v_email text := nullif(trim(p_customer->>'email'), '');
  v_phone text := trim(coalesce(p_customer->>'phone', ''));
  v_address text := nullif(trim(p_customer->>'address'), '');
  v_city text := nullif(trim(p_customer->>'city'), '');
  v_postcode text := upper(nullif(trim(p_customer->>'postcode'), ''));
begin
  if p_request_id is null or p_fingerprint is null or length(p_fingerprint) <> 64 or p_rate_key is null or length(p_rate_key) <> 64 then
    raise exception using errcode = '22023', message = 'A checkout session is invalid.';
  end if;
  select * into v_attempt from public.stripe_checkout_attempts where id = p_request_id for update;
  if found then
    if v_attempt.fingerprint <> p_fingerprint then
      raise exception using errcode = '22023', message = 'This checkout session cannot be reused.';
    end if;
    return v_attempt;
  end if;
  if p_mode not in ('test', 'live') then raise exception using errcode = '22023', message = 'Payment mode is invalid.'; end if;
  if v_email is null or length(v_email) > 320 or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception using errcode = '22023', message = 'Enter a valid email address.'; end if;
  if v_customer_name is null or length(v_customer_name) not between 2 and 120 then raise exception using errcode = '22023', message = 'Enter your full name.'; end if;
  if length(v_phone) > 40 then raise exception using errcode = '22023', message = 'The phone number is too long.'; end if;
  if v_address is null or length(v_address) not between 3 and 240 then raise exception using errcode = '22023', message = 'Enter a delivery address.'; end if;
  if v_city is null or length(v_city) not between 2 and 80 then raise exception using errcode = '22023', message = 'Enter a town or city.'; end if;
  if v_postcode is null or length(v_postcode) not between 2 and 16 then raise exception using errcode = '22023', message = 'Enter a valid postcode.'; end if;
  if p_delivery_method not in ('standard', 'express') then raise exception using errcode = '22023', message = 'Choose a delivery option.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then raise exception using errcode = '22023', message = 'Add a product to your bag first.'; end if;
  if (select count(*) from public.stripe_checkout_attempts where rate_key = p_rate_key and created_at > v_now - interval '10 minutes') >= 12 then
    raise exception using errcode = 'P0001', message = 'Too many checkout attempts.';
  end if;

  select * into v_state_row from public.store_state where id = 'default' for update;
  if not found then raise exception using errcode = '55000', message = 'The store catalogue is not ready.'; end if;
  v_payload := v_state_row.payload;
  v_products := coalesce(v_payload->'products', '[]'::jsonb);

  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object' then raise exception using errcode = '22023', message = 'A bag item is invalid.'; end if;
    v_product_id := nullif(trim(v_line->>'productId'), '');
    v_variant_id := nullif(trim(v_line->>'variantId'), '');
    v_size := nullif(trim(v_line->>'size'), '');
    if v_product_id is null or v_size is null or length(v_size) > 120 or v_line->>'quantity' is null or v_line->>'quantity' !~ '^[0-9]+$' then raise exception using errcode = '22023', message = 'A bag item is invalid.'; end if;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 10 then raise exception using errcode = '22023', message = 'Choose a quantity from 1 to 10.'; end if;
    if exists (select 1 from jsonb_array_elements(v_checked_lines) as checked(line) where checked.line->>'productId' = v_product_id and coalesce(checked.line->>'variantId', checked.line->>'size') = coalesce(v_variant_id, v_size)) then raise exception using errcode = '22023', message = 'A bag item is duplicated.'; end if;
    select item.product into v_product from jsonb_array_elements(v_products) as item(product) where item.product->>'id' = v_product_id and item.product->>'status' = 'Active' limit 1;
    if v_product is null then raise exception using errcode = '22023', message = 'A product is no longer available.'; end if;
    v_product_previous_quantity := coalesce((v_quantities->>v_product_id)::integer, 0);
    v_variant := null;
    if jsonb_typeof(v_product->'variants') = 'array' and jsonb_array_length(v_product->'variants') > 0 then
      if v_variant_id is null then raise exception using errcode = '22023', message = 'Choose a product option.'; end if;
      select value into v_variant from jsonb_array_elements(v_product->'variants') as item(value) where value->>'id' = v_variant_id and coalesce((value->>'enabled')::boolean, true) limit 1;
      if v_variant is null then raise exception using errcode = '22023', message = 'This product option is no longer available.'; end if;
      v_stock := greatest(coalesce((v_variant->>'stock')::integer, 0), 0);
      v_price := greatest(coalesce((v_variant->>'price')::integer, 0), 0);
      v_variant_key := v_product_id || ':' || v_variant_id;
      v_previous_quantity := coalesce((v_variant_quantities->>v_variant_key)::integer, 0);
      select string_agg(value, ' / ' order by key) into v_variant_title from jsonb_each_text(v_variant->'values');
    else
      v_category := coalesce(v_product->>'category', 'Clogs');
      if jsonb_typeof(v_product->'sizes') = 'array' then
        if not exists (select 1 from jsonb_array_elements_text(v_product->'sizes') as size(value) where size.value = v_size) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      elsif (v_category = 'Accessories' and v_size <> 'One size') or (v_category = 'Kids' and v_size not in ('1','2','3','4','5','6')) or (v_category not in ('Accessories','Kids') and v_size not in ('3','4','5','6','7','8','9','10','11','12')) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      v_stock := greatest(coalesce((v_product->>'stock')::integer, 0), 0);
      v_price := greatest(coalesce((v_product->>'price')::integer, 0), 0);
      v_previous_quantity := v_product_previous_quantity;
      v_variant_title := v_size;
    end if;
    if v_previous_quantity + v_quantity > v_stock then raise exception using errcode = '22023', message = 'There is not enough stock for this product.'; end if;
    v_quantities := jsonb_set(v_quantities, array[v_product_id], to_jsonb(v_product_previous_quantity + v_quantity), true);
    if v_variant is not null then v_variant_quantities := jsonb_set(v_variant_quantities, array[v_variant_key], to_jsonb(v_previous_quantity + v_quantity), true); end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    v_order_lines := v_order_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'title', v_product->>'title', 'image', v_product->>'image', 'price', v_price, 'quantity', v_quantity, 'size', v_size, 'variantId', v_variant_id, 'variantTitle', coalesce(v_variant_title, v_size)));
    v_checked_lines := v_checked_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'size', v_size, 'variantId', v_variant_id));
  end loop;
  if v_subtotal < 30 or (select coalesce(sum((value->>'quantity')::integer), 0) from jsonb_array_elements(v_order_lines) as item(value)) > 20 then raise exception using errcode = '22023', message = 'The checkout total is invalid.'; end if;
  v_shipping := case when p_delivery_method = 'express' then 599 when v_subtotal >= 5000 then 0 else 399 end;
  v_total := v_subtotal + v_shipping;

  -- Reserve each product/variant while the customer is on Stripe Checkout.
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = v_key then v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{stock}', to_jsonb(greatest((v_candidate->>'stock')::integer - v_amount, 0)), true)); else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop;
    v_products := v_new_products;
  end loop;
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_variant_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = split_part(v_key, ':', 1) then
        v_new_variants := '[]'::jsonb;
        for v_variant_item in select value from jsonb_array_elements(coalesce(v_candidate->'variants', '[]'::jsonb)) as item(value) loop
          if v_variant_item->>'id' = split_part(v_key, ':', 2) then v_new_variants := v_new_variants || jsonb_build_array(jsonb_set(v_variant_item, '{stock}', to_jsonb(greatest(coalesce((v_variant_item->>'stock')::integer, 0) - v_amount, 0)), true)); else v_new_variants := v_new_variants || jsonb_build_array(v_variant_item); end if;
        end loop;
        v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{variants}', v_new_variants, true));
      else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop;
    v_products := v_new_products;
  end loop;
  v_payload := jsonb_set(v_payload, '{products}', v_products, true);
  update public.store_state set payload = v_payload, version = version + 1, updated_by = 'stripe-checkout-reserve' where id = 'default';
  insert into public.store_events (state_id, event_type, detail) values ('default', 'stripe.checkout.reserve', left('Checkout reservation ' || p_request_id::text, 240));

  insert into public.stripe_checkout_attempts (id, order_id, fingerprint, rate_key, mode, email, customer_name, phone, shipping_address, city, postcode, delivery_method, lines, subtotal, shipping, total, status, expires_at)
  values (p_request_id, v_order_id, p_fingerprint, p_rate_key, p_mode, v_email, v_customer_name, v_phone, v_address, v_city, v_postcode, p_delivery_method, v_order_lines, v_subtotal, v_shipping, v_total, 'reserved', v_now + interval '30 minutes')
  returning * into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.stripe_checkout_bind_v1(p_attempt_id uuid, p_session_id text)
returns public.stripe_checkout_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempt public.stripe_checkout_attempts%rowtype;
begin
  if p_session_id is null or p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9_]+' then raise exception using errcode = '22023', message = 'Stripe session is invalid.'; end if;
  update public.stripe_checkout_attempts set stripe_session_id = p_session_id, updated_at = timezone('utc', now()) where id = p_attempt_id and status = 'reserved' returning * into v_attempt;
  if v_attempt.id is null then raise exception using errcode = '40001', message = 'Checkout reservation has changed. Start again.'; end if;
  return v_attempt;
end;
$$;

create or replace function public.stripe_checkout_release_v1(p_attempt_id uuid)
returns public.stripe_checkout_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.stripe_checkout_attempts%rowtype;
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
  v_products jsonb;
  v_candidate jsonb;
  v_new_products jsonb;
  v_variant_item jsonb;
  v_new_variants jsonb;
  v_line jsonb;
  v_product_id text;
  v_variant_id text;
  v_key text;
  v_amount integer;
  v_product_quantities jsonb := '{}'::jsonb;
  v_variant_quantities jsonb := '{}'::jsonb;
begin
  select * into v_attempt from public.stripe_checkout_attempts where id = p_attempt_id for update;
  if not found then raise exception using errcode = '22023', message = 'Checkout reservation was not found.'; end if;
  if v_attempt.status <> 'reserved' then return v_attempt; end if;
  for v_line in select value from jsonb_array_elements(v_attempt.lines) as item(value) loop
    v_product_id := v_line->>'productId'; v_variant_id := nullif(v_line->>'variantId', ''); v_amount := (v_line->>'quantity')::integer;
    v_product_quantities := jsonb_set(v_product_quantities, array[v_product_id], to_jsonb(coalesce((v_product_quantities->>v_product_id)::integer, 0) + v_amount), true);
    if v_variant_id is not null then v_variant_quantities := jsonb_set(v_variant_quantities, array[v_product_id || ':' || v_variant_id], to_jsonb(coalesce((v_variant_quantities->>(v_product_id || ':' || v_variant_id))::integer, 0) + v_amount), true); end if;
  end loop;
  select * into v_state_row from public.store_state where id = 'default' for update;
  if not found then raise exception using errcode = '55000', message = 'The store catalogue is not ready.'; end if;
  v_payload := v_state_row.payload; v_products := coalesce(v_payload->'products', '[]'::jsonb);
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_product_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = v_key then v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{stock}', to_jsonb(greatest(coalesce((v_candidate->>'stock')::integer, 0) + v_amount, 0)), true)); else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop;
    v_products := v_new_products;
  end loop;
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_variant_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = split_part(v_key, ':', 1) then
        v_new_variants := '[]'::jsonb;
        for v_variant_item in select value from jsonb_array_elements(coalesce(v_candidate->'variants', '[]'::jsonb)) as item(value) loop
          if v_variant_item->>'id' = split_part(v_key, ':', 2) then v_new_variants := v_new_variants || jsonb_build_array(jsonb_set(v_variant_item, '{stock}', to_jsonb(greatest(coalesce((v_variant_item->>'stock')::integer, 0) + v_amount, 0)), true)); else v_new_variants := v_new_variants || jsonb_build_array(v_variant_item); end if;
        end loop;
        v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{variants}', v_new_variants, true));
      else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop;
    v_products := v_new_products;
  end loop;
  v_payload := jsonb_set(v_payload, '{products}', v_products, true);
  update public.store_state set payload = v_payload, version = version + 1, updated_by = 'stripe-checkout-release' where id = 'default';
  insert into public.store_events (state_id, event_type, detail) values ('default', 'stripe.checkout.release', left('Checkout reservation released ' || p_attempt_id::text, 240));
  update public.stripe_checkout_attempts set status = 'released', updated_at = timezone('utc', now()) where id = p_attempt_id returning * into v_attempt;
  return v_attempt;
end;
$$;

create or replace function public.stripe_checkout_event_v1(
  p_event_id text,
  p_attempt_id uuid,
  p_order_id uuid,
  p_session_id text,
  p_status text,
  p_amount_total integer,
  p_currency text,
  p_livemode boolean,
  p_payment_intent_id text
)
returns table (status text, order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.stripe_checkout_attempts%rowtype;
  v_order public.storefront_orders%rowtype;
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
  v_orders jsonb;
  v_admin_order jsonb;
  v_order_lines jsonb;
  v_event_inserted integer;
  v_existing_order_id uuid;
  v_existing_order_number bigint;
  v_existing_payment_status text;
begin
  if p_event_id is null or length(p_event_id) > 255 or p_status not in ('paid', 'failed', 'expired') then raise exception using errcode = '22023', message = 'Payment event is invalid.'; end if;
  insert into public.stripe_webhook_events (id, type, status, attempt_id) values (p_event_id, 'checkout.session', p_status, p_attempt_id) on conflict (id) do nothing;
  get diagnostics v_event_inserted = row_count;
  if v_event_inserted = 0 then
    select o.id, o.order_number, o.payment_status into v_existing_order_id, v_existing_order_number, v_existing_payment_status from public.storefront_orders as o where o.stripe_session_id = p_session_id limit 1;
    return query select coalesce(v_existing_payment_status, 'received'), v_existing_order_id, v_existing_order_number; return;
  end if;
  select * into v_attempt from public.stripe_checkout_attempts where id = p_attempt_id for update;
  if not found or v_attempt.order_id <> p_order_id or coalesce(v_attempt.stripe_session_id, p_session_id) <> p_session_id then raise exception using errcode = '22023', message = 'Payment reference does not match the checkout.'; end if;
  if v_attempt.stripe_session_id is null then
    update public.stripe_checkout_attempts set stripe_session_id = p_session_id, updated_at = timezone('utc', now()) where id = p_attempt_id;
    v_attempt.stripe_session_id := p_session_id;
  end if;
  if p_amount_total is null or p_amount_total <> v_attempt.total or lower(coalesce(p_currency, '')) <> v_attempt.currency or p_livemode <> (v_attempt.mode = 'live') then
    update public.stripe_checkout_attempts set status = 'review', updated_at = timezone('utc', now()) where id = p_attempt_id;
    update public.stripe_webhook_events set status = 'review', detail = 'Amount, currency or mode mismatch.' where id = p_event_id;
    return query select 'review'::text, null::uuid, null::bigint; return;
  end if;
  if p_status = 'paid' then
    if v_attempt.status = 'paid' then
      select id, order_number into v_existing_order_id, v_existing_order_number from public.storefront_orders where stripe_session_id = p_session_id limit 1;
      return query select 'paid'::text, v_existing_order_id, v_existing_order_number; return;
    end if;
    if v_attempt.status <> 'reserved' then update public.stripe_webhook_events set status = 'review', detail = 'Late paid event after reservation release.' where id = p_event_id; return query select 'review'::text, null::uuid, null::bigint; return; end if;
    v_order_lines := v_attempt.lines;
    insert into public.storefront_orders (id, email, customer_name, phone, shipping_address, city, postcode, delivery_method, lines, subtotal, shipping, total, status, payment_status, stripe_session_id, stripe_payment_intent_id, stripe_livemode, created_at)
    values (v_attempt.order_id, v_attempt.email, v_attempt.customer_name, v_attempt.phone, v_attempt.shipping_address, v_attempt.city, v_attempt.postcode, v_attempt.delivery_method, v_order_lines, v_attempt.subtotal, v_attempt.shipping, v_attempt.total, 'received', 'paid', p_session_id, p_payment_intent_id, p_livemode, timezone('utc', now()))
    returning * into v_order;
    v_admin_order := jsonb_build_object('id', v_order.id::text, 'number', v_order.order_number, 'customerId', 'storefront:' || v_order.id::text, 'customerName', v_order.customer_name, 'customerEmail', v_order.email, 'createdAt', v_order.created_at, 'payment', 'paid', 'fulfillment', 'unfulfilled', 'items', (select coalesce(jsonb_agg(item.value - 'size' order by item.value->>'productId'), '[]'::jsonb) from jsonb_array_elements(v_order_lines) as item(value)), 'shipping', v_order.shipping, 'note', 'Stripe payment confirmed by webhook.', 'stockReserved', true, 'channel', 'Online store', 'stripeSessionId', p_session_id);
    select * into v_state_row from public.store_state where id = 'default' for update;
    v_payload := v_state_row.payload;
    v_payload := jsonb_set(v_payload, '{orders}', jsonb_build_array(v_admin_order) || coalesce(v_payload->'orders', '[]'::jsonb), true);
    update public.store_state set payload = v_payload, version = version + 1, updated_by = 'stripe-webhook' where id = 'default';
    insert into public.store_events (state_id, event_type, detail) values ('default', 'stripe.payment.paid', left('Stripe payment for order #' || v_order.order_number::text, 240));
    update public.stripe_checkout_attempts set status = 'paid', stripe_payment_intent_id = p_payment_intent_id, updated_at = timezone('utc', now()) where id = p_attempt_id;
    update public.stripe_webhook_events set status = 'paid', processed_at = timezone('utc', now()) where id = p_event_id;
    return query select 'paid'::text, v_order.id, v_order.order_number; return;
  end if;
  if v_attempt.status = 'paid' then
    select id, order_number into v_existing_order_id, v_existing_order_number from public.storefront_orders where stripe_session_id = p_session_id limit 1;
    return query select 'paid'::text, v_existing_order_id, v_existing_order_number; return;
  end if;
  if v_attempt.status = 'reserved' then perform public.stripe_checkout_release_v1(p_attempt_id); end if;
  update public.stripe_checkout_attempts set status = p_status, updated_at = timezone('utc', now()) where id = p_attempt_id;
  update public.stripe_webhook_events set status = p_status, processed_at = timezone('utc', now()) where id = p_event_id;
  return query select p_status, v_attempt.order_id, null::bigint;
end;
$$;

revoke all on function public.stripe_checkout_reserve_v1(uuid, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.stripe_checkout_bind_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.stripe_checkout_release_v1(uuid) from public, anon, authenticated;
revoke all on function public.stripe_checkout_event_v1(text, uuid, uuid, text, text, integer, text, boolean, text) from public, anon, authenticated;
grant execute on function public.stripe_checkout_reserve_v1(uuid, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.stripe_checkout_bind_v1(uuid, text) to service_role;
grant execute on function public.stripe_checkout_release_v1(uuid) to service_role;
grant execute on function public.stripe_checkout_event_v1(text, uuid, uuid, text, text, integer, text, boolean, text) to service_role;
