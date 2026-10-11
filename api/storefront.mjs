import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogPage, publicCollections, escapeHtml as esc, safeJson } from '../server/catalog-core.mjs';
import { catalogData, productData } from '../server/catalog-runtime.mjs';

const origin = process.env.PUBLIC_SITE_URL || 'https://crocs-admin-supabase.vercel.app';
let template;
const functionRoot = dirname(fileURLToPath(import.meta.url));
async function productTemplate() {
  if (template) return template;
  const candidates = [
    join(functionRoot, '..', 'product.html'),
    join(process.cwd(), 'product.html'),
    join(process.cwd(), 'dist', 'product.html'),
  ];
  let lastError;
  for (const filename of [...new Set(candidates)]) {
    try { template = await readFile(filename, 'utf8'); return template; } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Product template unavailable.');
}
export default async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).json({ error: 'Method not allowed' }); }
  const params = new URL(req.url, origin).searchParams;
  const view = params.get('view') || 'list';
  try {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    if (view === 'meta') {
      const catalog = await catalogData();
      return res.json({ store: catalog.store, localization: catalog.localization, activeTotal: catalog.products.length, collections: publicCollections(catalog.collections, catalog.products), menus: catalog.menus, theme: catalog.theme });
    }
    if (view === 'list') return res.json(catalogPage(await catalogData(), params));
    if (view === 'product' || view === 'page') {
      const product = await productData(params.get('id'));
      if (view === 'product') return res.json(product);
      template = await productTemplate();
      const url = `${origin}/product?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`;
      const title = product.seo?.title || `${product.title} | Sally Kids`;
      const description = String(product.seo?.description || product.description || `${product.title}. Xem hình ảnh, chọn màu và kích thước phù hợp cho bé.`).slice(0, 320);
      const image = new URL(product.image || '/assets/sally-kids-hero.png', origin).href;
      const schema = { '@context': 'https://schema.org', '@type': 'Product', name: product.title, description, image, sku: product.sku, brand: { '@type': 'Brand', name: product.brand || 'Sally Kids' }, url };
      const metadata = `<link rel="canonical" href="${esc(url)}"><meta name="robots" content="${product.seo?.noindex || params.has('preview') ? 'noindex,follow' : 'index,follow'}"><meta property="og:type" content="product"><meta property="og:site_name" content="Sally Kids"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><script id="productStructuredData" type="application/ld+json">${safeJson(schema)}</script><script id="productBootstrap" type="application/json">${safeJson(product)}</script>`;
      const imageUrl = image.startsWith(origin + '/api/1688-image?') ? `${image}&w=960&format=webp` : image;
      let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`).replace('</head>', `${metadata}</head>`);
      html = html.replace(/<main id="productMain"[\s\S]*?<\/main>/, `<main id="productMain" class="product-page" aria-busy="true"><section class="product-detail product-prerender"><div class="product-hero-image"><img src="${esc(imageUrl)}" alt="${esc(product.imageAlt || product.title)}" width="900" height="1200" fetchpriority="high"></div><div class="product-copy"><p class="product-kicker">Sally Kids</p><h1>${esc(product.title)}</h1><p>${esc(description)}</p><p role="status">Đang cập nhật giá và lựa chọn…</p></div></section></main>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(req.method === 'HEAD' ? '' : html);
    }
    return res.status(400).json({ error: 'Unknown view' });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    const status = error.status || 503;
    if (view === 'page') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(status).send(`<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Sản phẩm chưa sẵn sàng | Sally Kids</title><link rel="stylesheet" href="/styles.css"><main class="section"><h1>${status === 404 ? 'Không tìm thấy sản phẩm' : 'Sản phẩm chưa sẵn sàng'}</h1><p>${esc(error.message)}</p><a href="/shop">Về Shop Sally Kids</a></main></html>`);
    }
    return res.status(status).json({ error: error.message || 'Cửa hàng tạm thời chưa sẵn sàng.' });
  }
}
