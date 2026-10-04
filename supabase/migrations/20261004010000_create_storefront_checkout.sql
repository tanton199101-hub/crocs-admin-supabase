-- Public storefront catalogue and a server-validated demo checkout.
-- The browser only receives the active catalogue and calls the order RPC;
-- storefront_orders itself is intentionally not exposed through PostgREST.

create extension if not exists pgcrypto;

create sequence if not exists public.storefront_order_number_seq
  as bigint
  minvalue 1000
  start with 1100;

create table if not exists public.storefront_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.storefront_order_number_seq'),
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
  status text not null default 'received' check (status in ('received', 'cancelled', 'fulfilled')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists storefront_orders_created_at_idx
  on public.storefront_orders (created_at desc);

alter table public.storefront_orders enable row level security;
revoke all on public.storefront_orders from anon, authenticated;

create or replace function public.storefront_catalog_v1()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', coalesce(state.payload->'settings'->>'name', 'Crocs UK'),
      'currency', coalesce(state.payload->'settings'->>'currency', 'GBP')
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product->>'id',
        'title', product->>'title',
        'sku', product->>'sku',
        'price', coalesce((product->>'price')::integer, 0),
        'stock', greatest(coalesce((product->>'stock')::integer, 0), 0),
        'status', 'Active',
        'image', product->>'image',
        'imageAlt', product->>'imageAlt',
        'brand', product->>'brand',
        'slug', product->>'slug',
        'category', product->>'category',
        'description', product->>'description',
        'seo', coalesce(product->'seo', '{}'::jsonb),
        'options', coalesce(product->'options', '[]'::jsonb),
        'variants', coalesce(product->'variants', '[]'::jsonb),
        'colour', product->>'colour',
        'sizes', product->'sizes'
      ) order by product->>'title')
      from jsonb_array_elements(coalesce(state.payload->'products', '[]'::jsonb)) as item(product)
      where product->>'status' = 'Active'
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(collection order by collection->>'title')
      from jsonb_array_elements(coalesce(state.payload->'collections', '[]'::jsonb)) as item(collection)
      where collection->>'status' = 'Active'
    ), '[]'::jsonb),
    'theme', coalesce(state.payload->'theme'->'published', '{}'::jsonb),
    'menus', coalesce(state.payload->'menus', '[]'::jsonb)
  )
  from public.store_state as state
  where state.id = 'default';
$$;

create or replace function public.create_storefront_order(
  p_email text,
  p_customer_name text,
  p_phone text,
  p_shipping_address text,
  p_city text,
  p_postcode text,
  p_delivery_method text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state_row public.store_state%rowtype;
  v_payload jsonb;
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
  v_variant jsonb;
  v_variant_key text;
  v_subtotal integer := 0;
  v_shipping integer;
  v_total integer;
  v_order_id uuid;
  v_order_number bigint;
  v_now timestamptz := timezone('utc', now());
  v_key text;
  v_amount integer;
  v_new_products jsonb;
  v_candidate jsonb;
  v_variant_item jsonb;
  v_new_variants jsonb;
begin
  if p_email is null or length(trim(p_email)) > 320 or trim(p_email) !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Enter your full name.';
  end if;
  if coalesce(length(trim(p_phone)), 0) > 40 then
    raise exception using errcode = '22023', message = 'The phone number is too long.';
  end if;
  if p_shipping_address is null or length(trim(p_shipping_address)) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'Enter a delivery address.';
  end if;
  if p_city is null or length(trim(p_city)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'Enter a town or city.';
  end if;
  if p_postcode is null or length(trim(p_postcode)) not between 2 and 16 then
    raise exception using errcode = '22023', message = 'Enter a valid postcode.';
  end if;
  if p_delivery_method not in ('standard', 'express') then
    raise exception using errcode = '22023', message = 'Choose a delivery option.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Add a product to your bag first.';
  end if;
  if jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 20 then
    raise exception using errcode = '22023', message = 'Add a product to your bag first.';
  end if;

  -- Lock the JSON state for the complete validation, stock decrement and order append.
  select * into v_state_row
  from public.store_state
  where id = 'default'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'The store catalogue is not ready.';
  end if;

  v_payload := v_state_row.payload;
  v_products := coalesce(v_payload->'products', '[]'::jsonb);

  for v_line in select value from jsonb_array_elements(p_lines) as item(value) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception using errcode = '22023', message = 'A bag item is invalid.';
    end if;
    v_product_id := nullif(trim(v_line->>'productId'), '');
    v_variant_id := nullif(trim(v_line->>'variantId'), '');
    v_size := nullif(trim(v_line->>'size'), '');
    if v_product_id is null or v_size is null or length(v_size) > 120 or v_line->>'quantity' is null or (v_line->>'quantity') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'A bag item is invalid.';
    end if;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 10 then
      raise exception using errcode = '22023', message = 'Choose a quantity from 1 to 10.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_checked_lines) as checked(line)
      where checked.line->>'productId' = v_product_id
        and coalesce(checked.line->>'variantId', checked.line->>'size') = coalesce(v_variant_id, v_size)
    ) then
      raise exception using errcode = '22023', message = 'A bag item is duplicated.';
    end if;

    select item.product into v_product
    from jsonb_array_elements(v_products) as item(product)
    where item.product->>'id' = v_product_id
      and item.product->>'status' = 'Active'
    limit 1;
    if v_product is null then
      raise exception using errcode = '22023', message = 'A product is no longer available.';
    end if;
    v_product_previous_quantity := coalesce((v_quantities->>v_product_id)::integer, 0);
    v_variant := null;
    if jsonb_typeof(v_product->'variants') = 'array' and jsonb_array_length(v_product->'variants') > 0 then
      if v_variant_id is null then
        raise exception using errcode = '22023', message = 'Choose a product option.';
      end if;
      select value into v_variant
      from jsonb_array_elements(v_product->'variants') as item(value)
      where value->>'id' = v_variant_id and coalesce((value->>'enabled')::boolean, true)
      limit 1;
      if v_variant is null then
        raise exception using errcode = '22023', message = 'This product option is no longer available.';
      end if;
      v_stock := greatest(coalesce((v_variant->>'stock')::integer, 0), 0);
      v_price := greatest(coalesce((v_variant->>'price')::integer, 0), 0);
      v_variant_key := v_product_id || ':' || v_variant_id;
      v_previous_quantity := coalesce((v_variant_quantities->>v_variant_key)::integer, 0);
    else
      v_category := coalesce(v_product->>'category', 'Clogs');
      if jsonb_typeof(v_product->'sizes') = 'array' then
        if not exists (select 1 from jsonb_array_elements_text(v_product->'sizes') as size(value) where size.value = v_size) then
          raise exception using errcode = '22023', message = 'Choose a valid size.';
        end if;
      elsif (v_category = 'Accessories' and v_size <> 'One size')
         or (v_category = 'Kids' and v_size not in ('1','2','3','4','5','6'))
         or (v_category not in ('Accessories','Kids') and v_size not in ('3','4','5','6','7','8','9','10','11','12')) then
        raise exception using errcode = '22023', message = 'Choose a valid size.';
      end if;
      v_stock := greatest(coalesce((v_product->>'stock')::integer, 0), 0);
      v_price := greatest(coalesce((v_product->>'price')::integer, 0), 0);
      v_previous_quantity := v_product_previous_quantity;
    end if;
    if v_previous_quantity + v_quantity > v_stock then
      raise exception using errcode = '22023', message = 'There is not enough stock for this product.';
    end if;
    v_quantities := jsonb_set(v_quantities, array[v_product_id], to_jsonb(v_product_previous_quantity + v_quantity), true);
    if v_variant is not null then
      v_variant_quantities := jsonb_set(v_variant_quantities, array[v_variant_key], to_jsonb(v_previous_quantity + v_quantity), true);
    end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    v_order_lines := v_order_lines || jsonb_build_array(jsonb_build_object(
      'productId', v_product_id,
      'title', v_product->>'title',
      'image', v_product->>'image',
      'price', v_price,
      'quantity', v_quantity,
      'size', v_size,
      'variantId', v_variant_id,
      'variantTitle', case when v_variant is null then v_size else coalesce((select string_agg(value, ' / ' order by key) from jsonb_each_text(v_variant->'values')), v_variant_id) end
    ));
    v_checked_lines := v_checked_lines || jsonb_build_array(jsonb_build_object('productId', v_product_id, 'size', v_size, 'variantId', v_variant_id));
  end loop;

  if v_subtotal < 0 or (select coalesce(sum((value->>'quantity')::integer), 0) from jsonb_array_elements(v_order_lines) as item(value)) > 20 then
    raise exception using errcode = '22023', message = 'The demo bag is limited to 20 items.';
  end if;
  v_shipping := case when p_delivery_method = 'express' then 599 when v_subtotal >= 5000 then 0 else 399 end;
  v_total := v_subtotal + v_shipping;
  v_order_id := gen_random_uuid();
  v_order_number := nextval('public.storefront_order_number_seq');

  insert into public.storefront_orders (
    id, order_number, email, customer_name, phone, shipping_address, city, postcode,
    delivery_method, lines, subtotal, shipping, total, status, created_at
  ) values (
    v_order_id, v_order_number, trim(p_email), trim(p_customer_name), trim(coalesce(p_phone, '')),
    trim(p_shipping_address), trim(p_city), upper(trim(p_postcode)), p_delivery_method,
    v_order_lines, v_subtotal, v_shipping, v_total, 'received', v_now
  );

  -- Decrement each product once, after every line has passed validation.
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = v_key then
        v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{stock}', to_jsonb(greatest((v_candidate->>'stock')::integer - v_amount, 0)), true));
      else
        v_new_products := v_new_products || jsonb_build_array(v_candidate);
      end if;
    end loop;
    v_products := v_new_products;
  end loop;
  -- Variant stock is decremented independently; the product stock above is
  -- still updated as the aggregate available quantity for admin reporting.
  for v_key, v_amount in select key, value::text::integer from jsonb_each(v_variant_quantities) loop
    v_new_products := '[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(v_products) as item(value) loop
      if v_candidate->>'id' = split_part(v_key, ':', 1) then
        v_new_variants := '[]'::jsonb;
        for v_variant_item in select value from jsonb_array_elements(coalesce(v_candidate->'variants', '[]'::jsonb)) as item(value) loop
          if v_variant_item->>'id' = split_part(v_key, ':', 2) then
            v_new_variants := v_new_variants || jsonb_build_array(jsonb_set(v_variant_item, '{stock}', to_jsonb(greatest(coalesce((v_variant_item->>'stock')::integer, 0) - v_amount, 0)), true));
          else
            v_new_variants := v_new_variants || jsonb_build_array(v_variant_item);
          end if;
        end loop;
        v_new_products := v_new_products || jsonb_build_array(jsonb_set(v_candidate, '{variants}', v_new_variants, true));
      else
        v_new_products := v_new_products || jsonb_build_array(v_candidate);
      end if;
    end loop;
    v_products := v_new_products;
  end loop;
  v_payload := jsonb_set(v_payload, '{products}', v_products, true);

  select coalesce(jsonb_agg(item.value - 'size' order by item.value->>'productId'), '[]'::jsonb)
  into v_admin_items
  from jsonb_array_elements(v_order_lines) as item(value);
  v_admin_order := jsonb_build_object(
    'id', v_order_id::text,
    'number', v_order_number,
    'customerId', 'storefront:' || v_order_id::text,
    'customerName', trim(p_customer_name),
    'customerEmail', trim(p_email),
    'createdAt', v_now,
    'payment', 'pending',
    'fulfillment', 'unfulfilled',
    'items', v_admin_items,
    'shipping', v_shipping,
    'note', 'Demo storefront order. No card payment was taken.',
    'stockReserved', true,
    'channel', 'Online store'
  );
  v_payload := jsonb_set(v_payload, '{orders}', jsonb_build_array(v_admin_order) || coalesce(v_payload->'orders', '[]'::jsonb), true);
  update public.store_state
  set payload = v_payload, updated_by = 'storefront-checkout'
  where id = 'default';
  insert into public.store_events (state_id, event_type, detail)
  values ('default', 'storefront.order', left('Order #' || v_order_number::text, 240));

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'total', v_total,
    'status', 'received'
  );
end;
$$;

revoke all on function public.storefront_catalog_v1() from public, anon, authenticated;
grant execute on function public.storefront_catalog_v1() to anon, authenticated;
revoke all on function public.create_storefront_order(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_storefront_order(text, text, text, text, text, text, text, jsonb) to anon, authenticated;
