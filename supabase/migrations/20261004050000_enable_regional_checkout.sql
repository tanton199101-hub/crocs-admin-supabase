-- Make regional pricing authoritative at checkout.
-- The browser may request a configured region, but it can never submit a price.
-- Both demo orders and Stripe reservations resolve the price from store_state.

alter table public.storefront_orders
  add column if not exists region_id text not null default 'gb',
  add column if not exists currency text not null default 'gbp';

alter table public.stripe_checkout_attempts
  add column if not exists region_id text not null default 'gb',
  add column if not exists language text not null default 'en';

alter table public.stripe_checkout_attempts
  drop constraint if exists stripe_checkout_attempts_currency_check;
alter table public.stripe_checkout_attempts
  add constraint stripe_checkout_attempts_currency_check
  check (currency in ('gbp', 'usd', 'eur', 'vnd', 'jpy', 'aud', 'cad', 'sgd'));

-- Stripe's existing webhook function inserts the order row using the attempt
-- values. This trigger keeps orders created by that function tagged with the
-- same regional currency without weakening the signed webhook flow.
create or replace function public.apply_checkout_region_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_region_id text;
  v_currency text;
begin
  select attempt.region_id, attempt.currency into v_region_id, v_currency
  from public.stripe_checkout_attempts as attempt
  where attempt.order_id = new.id
  order by attempt.created_at desc
  limit 1;
  if found then
    new.region_id := v_region_id;
    new.currency := v_currency;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_checkout_region_v1() from public, anon, authenticated;

drop trigger if exists storefront_orders_apply_checkout_region on public.storefront_orders;
create trigger storefront_orders_apply_checkout_region
before insert on public.storefront_orders
for each row execute function public.apply_checkout_region_v1();

-- Keep the mirrored Admin Studio order summary in the same currency as the
-- private order row created by demo checkout or the signed Stripe webhook.
create or replace function public.sync_storefront_order_region_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_currency text;
  v_region_id text;
begin
  if jsonb_typeof(new.payload->'orders') = 'array' then
    for v_item in select value from jsonb_array_elements(new.payload->'orders') as item(value) loop
      select order_row.currency, order_row.region_id into v_currency, v_region_id
      from public.storefront_orders as order_row
      where order_row.id::text = v_item->>'id'
      limit 1;
      if found then v_item := v_item || jsonb_build_object('currency', v_currency, 'regionId', v_region_id); end if;
      v_orders := v_orders || jsonb_build_array(v_item);
    end loop;
    new.payload := jsonb_set(new.payload, '{orders}', v_orders, true);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_storefront_order_region_v1() from public, anon, authenticated;
drop trigger if exists store_state_sync_order_region on public.store_state;
create trigger store_state_sync_order_region
before update on public.store_state
for each row execute function public.sync_storefront_order_region_v1();

create or replace function public.storefront_regional_quote_v1(
  p_settings jsonb,
  p_region_id text,
  p_product jsonb,
  p_variant jsonb,
  p_base_price integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb := coalesce(p_settings, '{}'::jsonb);
  v_regions jsonb := coalesce(v_settings->'regions', '[]'::jsonb);
  v_region jsonb;
  v_region_id text;
  v_currency text;
  v_locale text;
  v_language text;
  v_base_decimals integer := 2;
  v_rate numeric := 1;
  v_multiplier numeric := 1;
  v_decimals integer := 2;
  v_override jsonb;
  v_override_text text;
  v_price numeric;
begin
  if jsonb_typeof(v_regions) = 'array' then
    select item.value into v_region
    from jsonb_array_elements(v_regions) as item(value)
    where lower(item.value->>'id') = lower(nullif(trim(coalesce(p_region_id, '')), ''))
    limit 1;
    if v_region is null then
      select item.value into v_region
      from jsonb_array_elements(v_regions) as item(value)
      where lower(item.value->>'id') = lower(coalesce(v_settings->>'defaultRegion', ''))
      limit 1;
    end if;
    if v_region is null then
      select item.value into v_region from jsonb_array_elements(v_regions) as item(value) limit 1;
    end if;
  end if;
  v_region := coalesce(v_region, jsonb_build_object('id', 'gb', 'currency', 'GBP', 'locale', 'en-GB', 'language', 'en', 'exchangeRate', 1, 'priceMultiplier', 1, 'priceOverrides', '{}'::jsonb));
  v_region_id := lower(coalesce(nullif(v_region->>'id', ''), 'gb'));
  v_currency := upper(coalesce(nullif(v_region->>'currency', ''), nullif(v_settings->>'currency', ''), 'GBP'));
  if v_currency not in ('GBP', 'USD', 'EUR', 'VND', 'JPY', 'AUD', 'CAD', 'SGD') then v_currency := 'GBP'; end if;
  v_locale := coalesce(nullif(v_region->>'locale', ''), nullif(v_settings->>'locale', ''), 'en-GB');
  v_language := lower(coalesce(nullif(v_region->>'language', ''), nullif(v_settings->>'defaultLanguage', ''), 'en'));
  if upper(coalesce(v_settings->>'currency', 'GBP')) in ('VND', 'JPY') then v_base_decimals := 0; end if;
  if coalesce(v_region->>'exchangeRate', '') ~ '^[0-9]+(\.[0-9]+)?$' then v_rate := greatest((v_region->>'exchangeRate')::numeric, 0.000001); end if;
  if coalesce(v_region->>'priceMultiplier', '') ~ '^[0-9]+(\.[0-9]+)?$' then v_multiplier := greatest((v_region->>'priceMultiplier')::numeric, 0.000001); end if;
  if v_currency in ('VND', 'JPY') then v_decimals := 0; end if;

  -- Admin overrides are stored in the smallest unit of the regional currency.
  if p_variant is not null then
    v_override := p_variant->'regionalPrices'->v_region_id;
    if v_override is null then v_override := p_variant->'priceByRegion'->v_region_id; end if;
    if v_override is null then v_override := p_variant->'pricesByRegion'->v_region_id; end if;
  end if;
  if v_override is null and p_product is not null then
    v_override := p_product->'regionalPrices'->v_region_id;
    if v_override is null then v_override := p_product->'priceByRegion'->v_region_id; end if;
    if v_override is null then v_override := p_product->'pricesByRegion'->v_region_id; end if;
  end if;
  if v_override is null and p_product is not null then v_override := v_region->'priceOverrides'->(p_product->>'id'); end if;
  if v_override is not null then
    if jsonb_typeof(v_override) = 'object' then
      v_override_text := coalesce(v_override->>coalesce(p_variant->>'id', ''), v_override->>coalesce(p_product->>'id', ''), v_override->>'amount', v_override->>'price');
    else
      v_override_text := trim(both '"' from v_override::text);
    end if;
  end if;
  if coalesce(v_override_text, '') ~ '^[0-9]+$' then
    v_price := v_override_text::numeric;
  else
    v_price := round((greatest(coalesce(p_base_price, 0), 0)::numeric / power(10::numeric, v_base_decimals)) * v_rate * v_multiplier * power(10::numeric, v_decimals));
  end if;
  v_price := greatest(0, least(2147483647, v_price));
  return jsonb_build_object('regionId', v_region_id, 'currency', v_currency, 'locale', v_locale, 'language', v_language, 'price', v_price::integer);
end;
$$;

revoke all on function public.storefront_regional_quote_v1(jsonb, text, jsonb, jsonb, integer) from public, anon, authenticated;

create or replace function public.create_storefront_order_regional_v1(
  p_email text,
  p_customer_name text,
  p_phone text,
  p_shipping_address text,
  p_city text,
  p_postcode text,
  p_delivery_method text,
  p_lines jsonb,
  p_region_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
  v_settings jsonb;
  v_products jsonb;
  v_product jsonb;
  v_line jsonb;
  v_order_lines jsonb := '[]'::jsonb;
  v_quantities jsonb := '{}'::jsonb;
  v_variant_quantities jsonb := '{}'::jsonb;
  v_checked_lines jsonb := '[]'::jsonb;
  v_admin_items jsonb := '[]'::jsonb;
  v_admin_order jsonb;
  v_product_id text;
  v_variant_id text;
  v_size text;
  v_category text;
  v_quantity integer;
  v_previous_quantity integer;
  v_product_previous_quantity integer;
  v_stock integer;
  v_price integer;
  v_base_price integer;
  v_variant jsonb;
  v_variant_key text;
  v_subtotal integer := 0;
  v_shipping integer;
  v_total integer;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_now timestamptz := timezone('utc', now());
  v_key text;
  v_amount integer;
  v_new_products jsonb;
  v_candidate jsonb;
  v_variant_item jsonb;
  v_new_variants jsonb;
  v_region_quote jsonb;
  v_region_id text;
  v_currency text;
begin
  if p_region_id is not null and p_region_id <> '' and p_region_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,31}$' then raise exception using errcode = '22023', message = 'Shopping region is invalid.'; end if;
  if p_email is null or length(trim(p_email)) > 320 or trim(p_email) !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception using errcode = '22023', message = 'Enter a valid email address.'; end if;
  if p_customer_name is null or length(trim(p_customer_name)) not between 2 and 120 then raise exception using errcode = '22023', message = 'Enter your full name.'; end if;
  if coalesce(length(trim(p_phone)), 0) > 40 then raise exception using errcode = '22023', message = 'The phone number is too long.'; end if;
  if p_shipping_address is null or length(trim(p_shipping_address)) not between 3 and 240 then raise exception using errcode = '22023', message = 'Enter a delivery address.'; end if;
  if p_city is null or length(trim(p_city)) not between 2 and 80 then raise exception using errcode = '22023', message = 'Enter a town or city.'; end if;
  if p_postcode is null or length(trim(p_postcode)) not between 2 and 16 then raise exception using errcode = '22023', message = 'Enter a valid postcode.'; end if;
  if p_delivery_method not in ('standard', 'express') then raise exception using errcode = '22023', message = 'Choose a delivery option.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then raise exception using errcode = '22023', message = 'Add a product to your bag first.'; end if;

  select * into v_state_row from public.store_state where id = 'default' for update;
  if not found then raise exception using errcode = '55000', message = 'The store catalogue is not ready.'; end if;
  v_payload := v_state_row.payload;
  v_settings := coalesce(v_payload->'settings', '{}'::jsonb);
  v_products := coalesce(v_payload->'products', '[]'::jsonb);
  v_region_quote := public.storefront_regional_quote_v1(v_settings, p_region_id, null, null, 0);
  v_region_id := v_region_quote->>'regionId';
  v_currency := lower(v_region_quote->>'currency');

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
      v_base_price := greatest(coalesce((v_variant->>'basePrice')::integer, (v_variant->>'price')::integer, (v_product->>'basePrice')::integer, (v_product->>'price')::integer, 0), 0);
      v_price := (public.storefront_regional_quote_v1(v_settings, v_region_id, v_product, v_variant, v_base_price)->>'price')::integer;
      v_variant_key := v_product_id || ':' || v_variant_id;
      v_previous_quantity := coalesce((v_variant_quantities->>v_variant_key)::integer, 0);
    else
      v_category := coalesce(v_product->>'category', 'Clogs');
      if jsonb_typeof(v_product->'sizes') = 'array' then
        if not exists (select 1 from jsonb_array_elements_text(v_product->'sizes') as size(value) where size.value = v_size) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      elsif (v_category = 'Accessories' and v_size <> 'One size') or (v_category = 'Kids' and v_size not in ('1','2','3','4','5','6')) or (v_category not in ('Accessories','Kids') and v_size not in ('3','4','5','6','7','8','9','10','11','12')) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      v_stock := greatest(coalesce((v_product->>'stock')::integer, 0), 0);
      v_base_price := greatest(coalesce((v_product->>'basePrice')::integer, (v_product->>'price')::integer, 0), 0);
      v_price := (public.storefront_regional_quote_v1(v_settings, v_region_id, v_product, null, v_base_price)->>'price')::integer;
      v_previous_quantity := v_product_previous_quantity;
    end if;
    if v_previous_quantity + v_quantity > v_stock then raise exception using errcode = '22023', message = 'There is not enough stock for this product.'; end if;
    v_quantities := jsonb_set(v_quantities, array[v_product_id], to_jsonb(v_product_previous_quantity + v_quantity), true);
    if v_variant is not null then v_variant_quantities := jsonb_set(v_variant_quantities, array[v_variant_key], to_jsonb(v_previous_quantity + v_quantity), true); end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    v_order_lines := v_order_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'title', v_product->>'title', 'image', v_product->>'image', 'price', v_price, 'quantity', v_quantity, 'size', v_size, 'variantId', v_variant_id, 'variantTitle', case when v_variant is null then v_size else coalesce((select string_agg(value, ' / ' order by key) from jsonb_each_text(v_variant->'values')), v_variant_id) end));
    v_checked_lines := v_checked_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'size', v_size, 'variantId', v_variant_id));
  end loop;
  if v_subtotal < 0 or (select coalesce(sum((value->>'quantity')::integer), 0) from jsonb_array_elements(v_order_lines) as item(value)) > 20 then raise exception using errcode = '22023', message = 'The demo bag is limited to 20 items.'; end if;
  v_shipping := case when p_delivery_method = 'express' then (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 599)->>'price')::integer when v_subtotal >= (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 5000)->>'price')::integer then 0 else (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 399)->>'price')::integer end;
  v_total := v_subtotal + v_shipping;
  v_order_number := nextval('public.storefront_order_number_seq');
  insert into public.storefront_orders (id, order_number, email, customer_name, phone, shipping_address, city, postcode, delivery_method, lines, subtotal, shipping, total, status, region_id, currency, created_at)
  values (v_order_id, v_order_number, trim(p_email), trim(p_customer_name), trim(coalesce(p_phone, '')), trim(p_shipping_address), trim(p_city), upper(trim(p_postcode)), p_delivery_method, v_order_lines, v_subtotal, v_shipping, v_total, 'received', v_region_id, v_currency, v_now);

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
  select coalesce(jsonb_agg(item.value - 'size' order by item.value->>'productId'), '[]'::jsonb) into v_admin_items from jsonb_array_elements(v_order_lines) as item(value);
  v_admin_order := jsonb_build_object('id', v_order_id::text, 'number', v_order_number, 'customerId', 'storefront:' || v_order_id::text, 'customerName', trim(p_customer_name), 'customerEmail', trim(p_email), 'createdAt', v_now, 'payment', 'pending', 'fulfillment', 'unfulfilled', 'items', v_admin_items, 'shipping', v_shipping, 'currency', v_currency, 'regionId', v_region_id, 'note', 'Demo storefront order. No card payment was taken. Regional price was validated on the server.', 'stockReserved', true, 'channel', 'Online store');
  v_payload := jsonb_set(v_payload, '{orders}', jsonb_build_array(v_admin_order) || coalesce(v_payload->'orders', '[]'::jsonb), true);
  update public.store_state set payload = v_payload, version = version + 1, updated_by = 'storefront-checkout-regional' where id = 'default';
  insert into public.store_events (state_id, event_type, detail) values ('default', 'storefront.order', left('Regional order #' || v_order_number::text, 240));
  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal, 'shipping', v_shipping, 'total', v_total, 'currency', v_currency, 'region_id', v_region_id, 'status', 'received');
end;
$$;

revoke all on function public.create_storefront_order_regional_v1(text, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_storefront_order_regional_v1(text, text, text, text, text, text, text, jsonb, text) to anon, authenticated;

-- A regional overload keeps existing server integrations working while the
-- storefront uses the explicit region-aware signature below.
create or replace function public.stripe_checkout_reserve_v1(
  p_request_id uuid,
  p_fingerprint text,
  p_rate_key text,
  p_customer jsonb,
  p_lines jsonb,
  p_delivery_method text,
  p_mode text,
  p_region_id text
)
returns public.stripe_checkout_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.stripe_checkout_attempts%rowtype;
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
  v_settings jsonb;
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
  v_base_price integer;
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
  v_region_quote jsonb;
  v_region_id text;
  v_currency text;
  v_language text;
begin
  if p_request_id is null or p_fingerprint is null or length(p_fingerprint) <> 64 or p_rate_key is null or length(p_rate_key) <> 64 then raise exception using errcode = '22023', message = 'A checkout session is invalid.'; end if;
  select * into v_attempt from public.stripe_checkout_attempts where id = p_request_id for update;
  if found then
    if v_attempt.fingerprint <> p_fingerprint then raise exception using errcode = '22023', message = 'This checkout session cannot be reused.'; end if;
    return v_attempt;
  end if;
  if p_mode not in ('test', 'live') then raise exception using errcode = '22023', message = 'Payment mode is invalid.'; end if;
  if p_region_id is not null and p_region_id <> '' and p_region_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{1,31}$' then raise exception using errcode = '22023', message = 'Shopping region is invalid.'; end if;
  if v_email is null or length(v_email) > 320 or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception using errcode = '22023', message = 'Enter a valid email address.'; end if;
  if v_customer_name is null or length(v_customer_name) not between 2 and 120 then raise exception using errcode = '22023', message = 'Enter your full name.'; end if;
  if length(v_phone) > 40 then raise exception using errcode = '22023', message = 'The phone number is too long.'; end if;
  if v_address is null or length(v_address) not between 3 and 240 then raise exception using errcode = '22023', message = 'Enter a delivery address.'; end if;
  if v_city is null or length(v_city) not between 2 and 80 then raise exception using errcode = '22023', message = 'Enter a town or city.'; end if;
  if v_postcode is null or length(v_postcode) not between 2 and 16 then raise exception using errcode = '22023', message = 'Enter a valid postcode.'; end if;
  if p_delivery_method not in ('standard', 'express') then raise exception using errcode = '22023', message = 'Choose a delivery option.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then raise exception using errcode = '22023', message = 'Add a product to your bag first.'; end if;
  if (select count(*) from public.stripe_checkout_attempts where rate_key = p_rate_key and created_at > v_now - interval '10 minutes') >= 12 then raise exception using errcode = 'P0001', message = 'Too many checkout attempts.'; end if;
  select * into v_state_row from public.store_state where id = 'default' for update;
  if not found then raise exception using errcode = '55000', message = 'The store catalogue is not ready.'; end if;
  v_payload := v_state_row.payload;
  v_settings := coalesce(v_payload->'settings', '{}'::jsonb);
  v_products := coalesce(v_payload->'products', '[]'::jsonb);
  v_region_quote := public.storefront_regional_quote_v1(v_settings, p_region_id, null, null, 0);
  v_region_id := v_region_quote->>'regionId';
  v_currency := lower(v_region_quote->>'currency');
  v_language := lower(coalesce(v_region_quote->>'language', 'en'));

  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object' then raise exception using errcode = '22023', message = 'A bag item is invalid.'; end if;
    v_product_id := nullif(trim(v_line->>'productId'), ''); v_variant_id := nullif(trim(v_line->>'variantId'), ''); v_size := nullif(trim(v_line->>'size'), '');
    if v_product_id is null or v_size is null or length(v_size) > 120 or v_line->>'quantity' is null or v_line->>'quantity' !~ '^[0-9]+$' then raise exception using errcode = '22023', message = 'A bag item is invalid.'; end if;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 10 then raise exception using errcode = '22023', message = 'Choose a quantity from 1 to 10.'; end if;
    if exists (select 1 from jsonb_array_elements(v_checked_lines) as checked(line) where checked.line->>'productId' = v_product_id and coalesce(checked.line->>'variantId', checked.line->>'size') = coalesce(v_variant_id, v_size)) then raise exception using errcode = '22023', message = 'A bag item is duplicated.'; end if;
    select item.product into v_product from jsonb_array_elements(v_products) as item(product) where item.product->>'id' = v_product_id and item.product->>'status' = 'Active' limit 1;
    if v_product is null then raise exception using errcode = '22023', message = 'A product is no longer available.'; end if;
    v_product_previous_quantity := coalesce((v_quantities->>v_product_id)::integer, 0); v_variant := null;
    if jsonb_typeof(v_product->'variants') = 'array' and jsonb_array_length(v_product->'variants') > 0 then
      if v_variant_id is null then raise exception using errcode = '22023', message = 'Choose a product option.'; end if;
      select value into v_variant from jsonb_array_elements(v_product->'variants') as item(value) where value->>'id' = v_variant_id and coalesce((value->>'enabled')::boolean, true) limit 1;
      if v_variant is null then raise exception using errcode = '22023', message = 'This product option is no longer available.'; end if;
      v_stock := greatest(coalesce((v_variant->>'stock')::integer, 0), 0);
      v_base_price := greatest(coalesce((v_variant->>'basePrice')::integer, (v_variant->>'price')::integer, (v_product->>'basePrice')::integer, (v_product->>'price')::integer, 0), 0);
      v_price := (public.storefront_regional_quote_v1(v_settings, v_region_id, v_product, v_variant, v_base_price)->>'price')::integer;
      v_variant_key := v_product_id || ':' || v_variant_id; v_previous_quantity := coalesce((v_variant_quantities->>v_variant_key)::integer, 0); v_variant_title := null;
      select string_agg(value, ' / ' order by key) into v_variant_title from jsonb_each_text(v_variant->'values');
    else
      v_category := coalesce(v_product->>'category', 'Clogs');
      if jsonb_typeof(v_product->'sizes') = 'array' then
        if not exists (select 1 from jsonb_array_elements_text(v_product->'sizes') as size(value) where size.value = v_size) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      elsif (v_category = 'Accessories' and v_size <> 'One size') or (v_category = 'Kids' and v_size not in ('1','2','3','4','5','6')) or (v_category not in ('Accessories','Kids') and v_size not in ('3','4','5','6','7','8','9','10','11','12')) then raise exception using errcode = '22023', message = 'Choose a valid size.'; end if;
      v_stock := greatest(coalesce((v_product->>'stock')::integer, 0), 0); v_base_price := greatest(coalesce((v_product->>'basePrice')::integer, (v_product->>'price')::integer, 0), 0); v_price := (public.storefront_regional_quote_v1(v_settings, v_region_id, v_product, null, v_base_price)->>'price')::integer; v_previous_quantity := v_product_previous_quantity; v_variant_title := v_size;
    end if;
    if v_previous_quantity + v_quantity > v_stock then raise exception using errcode = '22023', message = 'There is not enough stock for this product.'; end if;
    v_quantities := jsonb_set(v_quantities, array[v_product_id], to_jsonb(v_product_previous_quantity + v_quantity), true); if v_variant is not null then v_variant_quantities := jsonb_set(v_variant_quantities, array[v_variant_key], to_jsonb(v_previous_quantity + v_quantity), true); end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    v_order_lines := v_order_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'title', v_product->>'title', 'image', v_product->>'image', 'price', v_price, 'quantity', v_quantity, 'size', v_size, 'variantId', v_variant_id, 'variantTitle', v_variant_title));
    v_checked_lines := v_checked_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'size', v_size, 'variantId', v_variant_id));
  end loop;
  if v_subtotal < 1 or (select coalesce(sum((value->>'quantity')::integer), 0) from jsonb_array_elements(v_order_lines) as item(value)) > 20 then raise exception using errcode = '22023', message = 'The checkout total is invalid.'; end if;
  v_shipping := case when p_delivery_method = 'express' then (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 599)->>'price')::integer when v_subtotal >= (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 5000)->>'price')::integer then 0 else (public.storefront_regional_quote_v1(v_settings, v_region_id, null, null, 399)->>'price')::integer end;
  v_total := v_subtotal + v_shipping;
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = v_key then v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{stock}', to_jsonb(greatest((v_candidate->>'stock')::integer - v_amount, 0)), true)); else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop; v_products := v_new_products;
  end loop;
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_variant_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = split_part(v_key, ':', 1) then
        v_new_variants := '[]'::jsonb;
        for v_variant_item in select value from jsonb_array_elements(coalesce(v_candidate->'variants', '[]'::jsonb)) as item(value) loop
          if v_variant_item->>'id' = split_part(v_key, ':', 2) then v_new_variants := v_new_variants || jsonb_build_array(jsonb_set(v_variant_item, '{stock}', to_jsonb(greatest(coalesce((v_variant_item->>'stock')::integer, 0) - v_amount, 0)), true)); else v_new_variants := v_new_variants || jsonb_build_array(v_variant_item); end if;
        end loop; v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{variants}', v_new_variants, true));
      else v_new_products := v_new_products || jsonb_build_array(v_candidate); end if;
    end loop; v_products := v_new_products;
  end loop;
  v_payload := jsonb_set(v_payload, '{products}', v_products, true);
  update public.store_state set payload = v_payload, version = version + 1, updated_by = 'stripe-checkout-reserve-regional' where id = 'default';
  insert into public.store_events (state_id, event_type, detail) values ('default', 'stripe.checkout.reserve', left('Regional checkout reservation ' || p_request_id::text, 240));
  insert into public.stripe_checkout_attempts (id, order_id, fingerprint, rate_key, mode, email, customer_name, phone, shipping_address, city, postcode, delivery_method, lines, subtotal, shipping, total, currency, region_id, language, status, expires_at)
  values (p_request_id, v_order_id, p_fingerprint, p_rate_key, p_mode, v_email, v_customer_name, v_phone, v_address, v_city, v_postcode, p_delivery_method, v_order_lines, v_subtotal, v_shipping, v_total, v_currency, v_region_id, v_language, 'reserved', v_now + interval '30 minutes')
  returning * into v_attempt;
  return v_attempt;
end;
$$;

revoke all on function public.stripe_checkout_reserve_v1(uuid, text, text, jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_checkout_reserve_v1(uuid, text, text, jsonb, jsonb, text, text, text) to service_role;
