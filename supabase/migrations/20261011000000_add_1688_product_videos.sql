-- Keep verified 1688 product videos available in the same public detail
-- projection as gallery and detail images. URLs are allowlisted by the
-- /api/1688-video proxy before they are persisted.

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
    'videos', coalesce(product->'videos', '[]'::jsonb),
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

