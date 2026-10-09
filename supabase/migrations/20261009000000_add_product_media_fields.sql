-- Product media enrichment keeps supplier gallery/detail images in the
-- validated JSON store and exposes them to the public product page.

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
      select jsonb_agg(jsonb_build_object(
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
        'attributes', coalesce(product->'attributes', '[]'::jsonb),
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

revoke all on function public.storefront_public_v1() from public, anon, authenticated;
grant execute on function public.storefront_public_v1() to anon, authenticated;
