import { publicDb, authToken, requireAmazonMember, readAdminState, parseSyncRequest, getProductTypeDefinition, putListing, upsertAmazonListing, publicEnvironment, send, failure } from '../../server/amazon-runtime.mjs';
import Amazon from '../../amazon-channel.js';

function mappedMarketplace(settings, id) {
  const channel = Amazon.defaultSettings(settings?.amazon || settings);
  const targets = Amazon.marketplaceSettings(channel);
  return targets.find(item => item.marketplaceId === id) || targets[0] || null;
}

function issuesFor(item, plan) {
  const issues = [];
  if (!item.marketplaceId) issues.push('Chưa chọn marketplace.');
  if (!item.sku) issues.push('Chưa tạo được Seller SKU.');
  if (!item.productType) issues.push('Chưa có Amazon product type.');
  if (!Number.isSafeInteger(item.price) || item.price <= 0) issues.push('Chưa nhập giá Amazon theo đúng marketplace.');
  if (item.customState === 'attention') issues.push(...plan.profileCheck.errors);
  if (item.customState === 'manual') issues.push('Cần xác nhận customization trong Seller Central trước khi publish.');
  return issues;
}

function listingAttributes(product, item) {
  return {
    item_name: [{ value: product.title, marketplace_id: item.marketplaceId }],
    brand: [{ value: product.brand || 'Crocs', marketplace_id: item.marketplaceId }],
    product_description: [{ value: product.description || product.title, marketplace_id: item.marketplaceId }],
    condition_type: [{ value: 'new_new', marketplace_id: item.marketplaceId }],
    externally_assigned_product_identifier: product.barcode ? [{ value: product.barcode, marketplace_id: item.marketplaceId }] : undefined,
  };
}

async function mirrorListing(entry, issues, status) {
  if (!Number.isSafeInteger(entry.item.price) || entry.item.price <= 0) return null;
  try { return await upsertAmazonListing({ product: entry.product, item: entry.item, issues, status, attributes: listingAttributes(entry.product, entry.item) }); }
  catch (error) {
    if (['amazon_storage_not_configured', 'amazon_storage_unavailable'].includes(error.code)) return null;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed.' }); }
  try {
    await requireAmazonMember(req);
    const request = parseSyncRequest(req);
    const state = await readAdminState(req);
    const settings = state.payload?.settings || {};
    const channel = Amazon.defaultSettings(settings.amazon || settings);
    const products = Array.isArray(state.payload?.products) ? state.payload.products : [];
    const selected = request.productId ? products.filter(product => product.id === request.productId) : products.filter(product => product.status === 'Active');
    if (request.productId && !selected.length) return send(res, 404, { error: 'Product not found.', code: 'product_not_found' });
    const marketplace = mappedMarketplace(channel, request.marketplaceId);
    if (!marketplace) return send(res, 409, { error: 'Add an enabled Amazon marketplace in Admin first.', code: 'amazon_marketplace_missing' });
    const plans = selected.flatMap(product => {
      const plan = Amazon.listingPlan(product, channel, marketplace);
      return plan.items.map(item => ({ product, item, plan }));
    });
    const report = plans.map(({ product, item, plan }) => ({ productId: product.id, variantId: item.variantId, sku: item.sku, marketplaceId: item.marketplaceId, productType: item.productType, price: item.price, quantity: item.quantity, customState: item.customState, issues: issuesFor(item, plan), status: issuesFor(item, plan).length ? (item.customState === 'manual' ? 'manual' : 'attention') : 'ready' }));
    const summary = Amazon.summary(report.map(item => ({ customState: item.status === 'manual' ? 'manual' : item.status === 'attention' ? 'attention' : 'ready' })));
    const mirrored = [];
    for (let index = 0; index < plans.length; index += 1) mirrored.push(await mirrorListing(plans[index], report[index].issues, report[index].issues.length ? (report[index].status === 'manual' ? 'manual' : 'attention') : 'validated'));
    if (request.operation === 'validate') return send(res, 200, { operation: request.operation, dryRun: true, report, summary, mirrored: mirrored.filter(Boolean).length, environment: publicEnvironment() });
    if (request.operation === 'definition') {
      if (!publicEnvironment().ready) return send(res, 503, { error: 'Configure Amazon server credentials before fetching a product type definition.', code: 'amazon_not_configured' });
      const productType = report[0]?.productType || marketplace.defaultProductType;
      const definition = await getProductTypeDefinition(productType, marketplace.marketplaceId, String(marketplace.locale || 'en-US').replace('-', '_'));
      return send(res, 200, { operation: request.operation, productType, marketplaceId: marketplace.marketplaceId, definition: definition.body });
    }
    const blocked = report.filter(item => item.issues.length);
    if (blocked.length) return send(res, 409, { error: 'Fix the validation issues before publishing to Amazon.', code: 'amazon_validation_failed', report, summary: { blocked: blocked.length, total: report.length } });
    if (report.length > 20) return send(res, 413, { error: 'Publish at most 20 listings per request.', code: 'amazon_batch_too_large' });
    const responses = [];
    for (const entry of plans) {
      const attributes = listingAttributes(entry.product, entry.item);
      const result = await putListing({ sku: entry.item.sku, marketplaceId: entry.item.marketplaceId, productType: entry.item.productType, attributes });
      await mirrorListing(entry, [], 'submitted');
      responses.push({ sku: entry.item.sku, status: result.status, body: result.body });
    }
    return send(res, 200, { operation: request.operation, report, responses, message: 'Listings submitted. Amazon may still return asynchronous listing issues.' });
  } catch (error) { return failure(res, error); }
}
