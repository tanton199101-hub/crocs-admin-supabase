import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presentation } from './catalog-core.mjs';

const base = process.env.SUPABASE_URL || 'https://uvtgzcuifbiufwcrylxx.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z8ozM2OM1MV3fo0nJDksxA_bBi97bIP';
let catalogCache, catalogFlight, mirrorCache, fallbackMirrorCache;
const details = new Map();
const moduleRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleRoot, '..');

async function readProjectFile(relativePath) {
  const candidates = [join(projectRoot, relativePath), join(process.cwd(), relativePath)];
  let lastError;
  for (const filename of [...new Set(candidates)]) {
    try { return await readFile(filename, 'utf8'); } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Project asset unavailable.');
}
export async function publicRpc(name, payload = {}) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Object.assign(new Error('Không tải được dữ liệu cửa hàng. Vui lòng thử lại.'), { status: 503 });
  const value = await response.json();
  return Array.isArray(value) ? value[0] : value;
}
async function mirror() {
  if (!mirrorCache) mirrorCache = JSON.parse(await readProjectFile('assets/catalog-1688/summary.json'));
  return mirrorCache;
}

export async function catalogWithMirrorOptions(catalog, readChunk = async chunk => JSON.parse(await readProjectFile(`assets/catalog-1688/details-${chunk}.json`))) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const metadata = new Map();
  const chunks = [...new Set(products.map(product => product.detailChunk).filter(chunk => Number.isInteger(chunk) && chunk >= 0))];
  // Keep the summary's price/stock/status authoritative. Only retain option
  // metadata, not every SKU/media row, after reading each detail chunk.
  for (const chunk of chunks) {
    try {
      const rows = await readChunk(chunk);
      for (const product of products.filter(item => item.detailChunk === chunk)) {
        const detail = rows?.[product.id];
        if (!detail || (detail.id && detail.id !== product.id)) continue;
        metadata.set(product.id, Object.fromEntries(['options', 'sizes', 'colour', 'colors']
          .filter(key => detail[key] != null).map(key => [key, detail[key]])));
      }
    } catch { /* One unavailable chunk must not discard the remaining catalogue. */ }
  }
  return { ...catalog, products: products.map(product => ({ ...metadata.get(product.id), ...product })) };
}

export async function catalogData() {
  if (catalogCache && Date.now() - catalogCache.time < 30000) return catalogCache.value;
  if (catalogFlight) return catalogFlight;
  catalogFlight = (async () => {
    const staticData = await mirror().catch(() => null);
    let live;
    try { live = await publicRpc('storefront_catalog_v1'); }
    catch {
      // summary.json intentionally omits options. Without this enrichment,
      // a transient RPC failure makes every classification filter return 0.
      if (staticData && !fallbackMirrorCache) fallbackMirrorCache = await catalogWithMirrorOptions(staticData);
      live = fallbackMirrorCache || staticData;
    }
    if (!Array.isArray(live?.products)) throw Object.assign(Error('Catalog chưa sẵn sàng.'), { status: 503 });
    const translations = new Map((staticData?.products || []).map(p => [p.id, p]));
    const value = {
      ...live,
      store: { ...(live.store || {}), name: 'Sally Kids' },
      products: live.products.filter(p => p.status === 'Active').map(p => presentation(p, translations.get(p.id))),
    };
    catalogCache = { value, time: Date.now() };
    return value;
  })().finally(() => { catalogFlight = null; });
  return catalogFlight;
}
export async function productData(id) {
  if (!/^[\w-]{1,120}$/.test(id || '')) throw Object.assign(Error('Sản phẩm không hợp lệ.'), { status: 400 });
  let local;
  try {
    const row = (await mirror()).products.find(p => p.id === id);
    if (row && Number.isInteger(row.detailChunk)) {
      if (!details.has(row.detailChunk)) details.set(row.detailChunk, JSON.parse(await readProjectFile(`assets/catalog-1688/details-${row.detailChunk}.json`)));
      local = details.get(row.detailChunk)[id];
    }
  } catch { /* Presentation enrichment is optional. Never revive a missing live product. */ }
  let live;
  try { live = await publicRpc('storefront_product_v1', { p_product_id: id }); }
  catch {
    if (local?.status === 'Active') return presentation(local, null);
    throw Object.assign(Error('Sản phẩm chưa sẵn sàng.'), { status: 503 });
  }
  if (!live?.id || live.status !== 'Active') throw Object.assign(Error('Sản phẩm không còn được bán.'), { status: 404 });
  return presentation(live, local);
}
