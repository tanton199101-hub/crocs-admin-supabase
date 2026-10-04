-- Expose the public, non-sensitive regional pricing configuration to the storefront.
-- Prices themselves remain in the private JSON state; the browser only receives
-- the region rules required to format a quote consistently with the admin setup.
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
    'localization', jsonb_build_object(
      'currency', coalesce(state.payload->'settings'->>'currency', 'GBP'),
      'defaultRegion', coalesce(state.payload->'settings'->>'defaultRegion', 'gb'),
      'defaultLanguage', coalesce(state.payload->'settings'->>'defaultLanguage', 'en'),
      'locale', coalesce(state.payload->'settings'->>'locale', 'en-GB'),
      'autoDetectRegion', coalesce((state.payload->'settings'->>'autoDetectRegion')::boolean, true),
      'regions', coalesce(state.payload->'settings'->'regions', '[]'::jsonb),
      'languages', coalesce(state.payload->'settings'->'languages', '{}'::jsonb)
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product->>'id', 'title', product->>'title', 'sku', product->>'sku',
        'price', coalesce((product->>'price')::integer, 0),
        'stock', greatest(coalesce((product->>'stock')::integer, 0), 0),
        'status', 'Active', 'image', product->>'image', 'imageAlt', product->>'imageAlt',
        'brand', product->>'brand', 'slug', product->>'slug', 'category', product->>'category',
        'description', product->>'description', 'seo', coalesce(product->'seo', '{}'::jsonb),
        'options', coalesce(product->'options', '[]'::jsonb), 'variants', coalesce(product->'variants', '[]'::jsonb),
        'colour', product->>'colour', 'sizes', product->'sizes'
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

revoke all on function public.storefront_catalog_v1() from public, anon, authenticated;
grant execute on function public.storefront_catalog_v1() to anon, authenticated;
