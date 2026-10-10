-- Expose the verified 1688 enrichment fields to the storefront.
--
-- Large 1688 SKU matrices are stored by supabase-sync.js in the compact
-- crocs-1688-v3 representation (variantEncoding/variantRegions/
-- variantsPacked).  The browser admin expands that representation after an
-- authenticated read, but the public SQL projection used to return an empty
-- variants array.  Expand it inside the definer-owned projection instead so
-- the storefront receives the same verified options, prices and stock.

create or replace function public.expand_product_variants_v1(p_product jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_options jsonb := coalesce(p_product->'options', '[]'::jsonb);
  v_regions jsonb := coalesce(p_product->'variantRegions', '[]'::jsonb);
  v_variants jsonb := '[]'::jsonb;
  v_row jsonb;
  v_option jsonb;
  v_values jsonb;
  v_regional_prices jsonb;
  v_variant jsonb;
  v_sku text;
  v_option_position integer;
  v_option_value_index integer;
  v_value text;
  v_region_position integer;
  v_region text;
  v_option_count integer;
  v_price_index integer;
  v_stock_index integer;
  v_region_index integer;
  v_flag_index integer;
  v_price integer;
  v_stock integer;
  v_enabled boolean;
begin
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    return coalesce(p_product, '{}'::jsonb);
  end if;
  if p_product->>'variantEncoding' <> 'crocs-1688-v3'
     or jsonb_typeof(p_product->'variantsPacked') <> 'array' then
    return p_product;
  end if;

  v_option_count := jsonb_array_length(v_options);
  -- Each packed row is [sku, option indexes..., price, stock,
  -- regional prices..., enabled flag].
  v_price_index := 1 + v_option_count;
  v_stock_index := v_price_index + 1;
  v_region_index := v_stock_index + 1;
  v_flag_index := v_region_index + jsonb_array_length(v_regions);

  for v_row in
    select value from jsonb_array_elements(p_product->'variantsPacked') as item(value)
  loop
    if jsonb_typeof(v_row) <> 'array' or jsonb_typeof(v_row->0) <> 'string' then
      continue;
    end if;
    v_sku := v_row->>0;
    v_values := '{}'::jsonb;

    for v_option, v_option_position in
      select value, ordinality::integer
      from jsonb_array_elements(v_options) with ordinality as item(value, ordinality)
    loop
      v_option_value_index := null;
      if coalesce(v_row->>v_option_position, '') ~ '^[0-9]+$' then
        v_option_value_index := (v_row->>v_option_position)::integer;
      end if;
      if v_option_value_index is not null
         and jsonb_typeof(v_option->'values') = 'array'
         and v_option_value_index >= 0
         and v_option_value_index < jsonb_array_length(v_option->'values') then
        v_value := v_option->'values'->>v_option_value_index;
        if v_value is not null then
          v_values := jsonb_set(
            v_values,
            array[coalesce(nullif(v_option->>'id', ''), 'option-' || v_option_position::text)],
            to_jsonb(v_value),
            true
          );
        end if;
      end if;
    end loop;

    v_price := case when coalesce(v_row->>v_price_index, '') ~ '^-?[0-9]+$'
      then (v_row->>v_price_index)::integer else 0 end;
    v_stock := case when coalesce(v_row->>v_stock_index, '') ~ '^-?[0-9]+$'
      then greatest((v_row->>v_stock_index)::integer, 0) else 0 end;
    v_enabled := coalesce(v_row->>v_flag_index, '1') <> '0';
    v_variant := jsonb_build_object(
      'id', v_sku,
      'values', v_values,
      'sku', v_sku,
      'price', greatest(v_price, 0),
      'compareAt', null,
      'cost', null,
      'stock', v_stock,
      'enabled', v_enabled,
      'barcode', ''
    );

    v_regional_prices := '{}'::jsonb;
    for v_region_position in 0..(jsonb_array_length(v_regions) - 1) loop
      v_region := v_regions->>v_region_position;
      if v_region is not null and v_row->(v_region_index + v_region_position) is not null
         and jsonb_typeof(v_row->(v_region_index + v_region_position)) <> 'null' then
        v_regional_prices := jsonb_set(
          v_regional_prices,
          array[v_region],
          v_row->(v_region_index + v_region_position),
          true
        );
      end if;
    end loop;
    if exists (select 1 from jsonb_object_keys(v_regional_prices) as keys(key)) then
      v_variant := v_variant || jsonb_build_object('regionalPrices', v_regional_prices);
    end if;
    v_variants := v_variants || jsonb_build_array(v_variant);
  end loop;

  return (p_product - 'variantEncoding' - 'variantRegions' - 'variantsPacked')
    || jsonb_build_object('variants', v_variants);
end;
$$;

-- Keep the helper private. It is called by SECURITY DEFINER projections below.
revoke all on function public.expand_product_variants_v1(jsonb) from public, anon, authenticated;

create or replace function public.storefront_product_projection_v1(p_product jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  product jsonb := public.expand_product_variants_v1(p_product);
begin
  return jsonb_build_object(
    'id', product->>'id',
    'title', product->>'title',
    'sku', product->>'sku',
    'price', coalesce((product->>'price')::integer, 0),
    'stock', greatest(coalesce((product->>'stock')::integer, 0), 0),
    'status', 'Active',
    'image', product->>'image',
    'gallery', coalesce(product->'gallery', '[]'::jsonb),
    'detailImages', coalesce(product->'detailImages', '[]'::jsonb),
    'imageAlt', product->>'imageAlt',
    'brand', product->>'brand',
    'slug', product->>'slug',
    'category', product->>'category',
    'description', product->>'description',
    'descriptionHtml', coalesce(product->'descriptionHtml', 'null'::jsonb),
    'attributes', coalesce(product->'attributes', '[]'::jsonb),
    'regionalPrices', coalesce(product->'regionalPrices', '{}'::jsonb),
    'priceByRegion', coalesce(product->'priceByRegion', '{}'::jsonb),
    'pricesByRegion', coalesce(product->'pricesByRegion', '{}'::jsonb),
    'seo', coalesce(product->'seo', '{}'::jsonb),
    'options', coalesce(product->'options', '[]'::jsonb),
    'variants', coalesce(product->'variants', '[]'::jsonb),
    'colour', product->>'colour',
    'sizes', product->'sizes'
  );
end;
$$;

revoke all on function public.storefront_product_projection_v1(jsonb) from public, anon, authenticated;

-- The home/catalog response intentionally stays lightweight. Returning all
-- 100k+ verified SKU rows in one JSON response would make the public page
-- unusable, so a product detail RPC below expands one product at a time.
create or replace function public.storefront_product_summary_v1(p_product jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_product->>'id',
    'title', p_product->>'title',
    'sku', p_product->>'sku',
    'price', coalesce((p_product->>'price')::integer, 0),
    'stock', greatest(coalesce((p_product->>'stock')::integer, 0), 0),
    'status', 'Active',
    'image', p_product->>'image',
    'imageAlt', p_product->>'imageAlt',
    'brand', p_product->>'brand',
    'slug', p_product->>'slug',
    'category', p_product->>'category',
    'hasVariants', (
      case when jsonb_typeof(p_product->'variants') = 'array' then jsonb_array_length(p_product->'variants') > 0 else false end
      or case when jsonb_typeof(p_product->'variantsPacked') = 'array' then jsonb_array_length(p_product->'variantsPacked') > 0 else false end
    ),
    'regionalPrices', coalesce(p_product->'regionalPrices', '{}'::jsonb),
    'priceByRegion', coalesce(p_product->'priceByRegion', '{}'::jsonb),
    'pricesByRegion', coalesce(p_product->'pricesByRegion', '{}'::jsonb),
    'seo', coalesce(p_product->'seo', '{}'::jsonb)
  );
$$;

revoke all on function public.storefront_product_summary_v1(jsonb) from public, anon, authenticated;

create or replace function public.storefront_public_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', coalesce(state.payload->'settings'->>'name', 'Crocs UK'),
      'currency', coalesce(state.payload->'settings'->>'currency', 'USD')
    ),
    'localization', jsonb_build_object(
      'currency', coalesce(state.payload->'settings'->>'currency', 'USD'),
      'defaultRegion', coalesce(state.payload->'settings'->>'defaultRegion', 'us'),
      'defaultLanguage', coalesce(state.payload->'settings'->>'defaultLanguage', 'en'),
      'locale', coalesce(state.payload->'settings'->>'locale', 'en-US'),
      'autoDetectRegion', coalesce((state.payload->'settings'->>'autoDetectRegion')::boolean, true),
      'regions', coalesce(state.payload->'settings'->'regions', '[]'::jsonb),
      'languages', coalesce(state.payload->'settings'->'languages', '{}'::jsonb)
    ),
    'products', coalesce((
      select jsonb_agg(public.storefront_product_summary_v1(product) order by product->>'title')
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

create or replace function public.storefront_catalog_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.storefront_public_v1();
$$;

create or replace function public.storefront_product_v1(p_product_id text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.storefront_product_projection_v1(product)
  from public.store_state as state
  cross join lateral jsonb_array_elements(coalesce(state.payload->'products', '[]'::jsonb)) as item(product)
  where state.id = 'default'
    and product->>'status' = 'Active'
    and product->>'id' = p_product_id
  limit 1;
$$;

revoke all on function public.storefront_public_v1() from public, anon, authenticated;
grant execute on function public.storefront_public_v1() to anon, authenticated;
revoke all on function public.storefront_catalog_v1() from public, anon, authenticated;
grant execute on function public.storefront_catalog_v1() to anon, authenticated;
revoke all on function public.storefront_product_v1(text) from public, anon, authenticated;
grant execute on function public.storefront_product_v1(text) to anon, authenticated;
