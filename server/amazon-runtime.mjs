import { createHash, createHmac, randomUUID } from 'node:crypto';
import { HttpError } from './stripe-core.mjs';
import { send, failure, publicDb, privateDb, requireMember, requestBody } from './stripe-runtime.mjs';
import Amazon from '../amazon-channel.js';

const tokenCache = new Map();
const USER_AGENT = 'CrocsStudio/1.0 (Language=JavaScript; Platform=Vercel)';
const ENDPOINTS = {
  na: 'sellingpartnerapi-na.amazon.com',
  eu: 'sellingpartnerapi-eu.amazon.com',
  fe: 'sellingpartnerapi-fe.amazon.com',
};

function envValue(name, fallback = '') { return String(process.env[name] || fallback).trim(); }

export function amazonEnvironment(env = process.env) {
  const marketplaceId = env.AMAZON_MARKETPLACE_ID || '';
  const definition = Amazon.MARKETPLACES[marketplaceId] || {};
  const endpoint = env.AMAZON_SP_API_ENDPOINT || definition.endpoint || ENDPOINTS[env.AMAZON_SP_API_REGION || 'na'] || ENDPOINTS.na;
  const config = {
    clientId: env.AMAZON_LWA_CLIENT_ID || '',
    clientSecret: env.AMAZON_LWA_CLIENT_SECRET || '',
    refreshToken: env.AMAZON_LWA_REFRESH_TOKEN || '',
    sellerId: env.AMAZON_SELLER_ID || '',
    marketplaceId,
    endpoint,
    awsRegion: env.AMAZON_AWS_REGION || 'us-east-1',
    accessKeyId: env.AMAZON_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AMAZON_AWS_SECRET_ACCESS_KEY || '',
    sessionToken: env.AMAZON_AWS_SESSION_TOKEN || '',
    appName: env.AMAZON_APP_NAME || 'Crocs Studio',
    appVersion: env.AMAZON_APP_VERSION || '1.0.0',
  };
  const ready = Boolean(config.clientId && config.clientSecret && config.refreshToken && config.sellerId && config.marketplaceId && config.accessKeyId && config.secretAccessKey);
  return { ...config, ready, configured: Boolean(config.clientId || config.refreshToken || config.sellerId || config.marketplaceId), hasAws: Boolean(config.accessKeyId && config.secretAccessKey), hasLwa: Boolean(config.clientId && config.clientSecret && config.refreshToken) };
}

function hmac(key, value, encoding) { return createHmac('sha256', key).update(value, 'utf8').digest(encoding); }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function awsUri(path) { return path.split('/').map((part, index) => index === 0 ? '' : encodeURIComponent(part)).join('/'); }
function canonicalQuery(query = {}) {
  return Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value.join(',') : value)}`).join('&');
}
function awsSigningKey(secret, date, region, service) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

async function lwaToken(config) {
  const key = `${config.clientId}:${config.refreshToken}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.value;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refreshToken, client_id: config.clientId, client_secret: config.clientSecret });
  const response = await fetch('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': USER_AGENT }, body, signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new HttpError(502, 'Amazon authorization failed. Check the LWA refresh token.', 'amazon_auth_failed');
  tokenCache.set(key, { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 });
  return payload.access_token;
}

export async function amazonRequest(path, { method = 'GET', query = {}, body = null, headers = {} } = {}) {
  const config = amazonEnvironment();
  if (!config.ready) throw new HttpError(503, 'Amazon SP-API is not configured on the server.', 'amazon_not_configured');
  const accessToken = await lwaToken(config);
  const host = config.endpoint;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').replace('Z', 'Z');
  const shortDate = amzDate.slice(0, 8);
  const service = 'execute-api';
  const region = config.awsRegion;
  const payload = body == null ? '' : JSON.stringify(body);
  const payloadHash = sha256(payload);
  const uri = awsUri(path);
  const queryString = canonicalQuery(query);
  const canonicalHeadersObject = {
    host,
    'user-agent': USER_AGENT,
    'x-amz-access-token': accessToken,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (config.sessionToken) canonicalHeadersObject['x-amz-security-token'] = config.sessionToken;
  for (const [key, value] of Object.entries(headers)) canonicalHeadersObject[key.toLowerCase()] = String(value).trim();
  const signedHeaders = Object.keys(canonicalHeadersObject).sort();
  const canonicalHeaders = signedHeaders.map(key => `${key}:${canonicalHeadersObject[key]}\n`).join('');
  const canonicalRequest = [method.toUpperCase(), uri, queryString, canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n');
  const scope = `${shortDate}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(awsSigningKey(config.secretAccessKey, shortDate, region, service), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`;
  const response = await fetch(`https://${host}${path}${queryString ? `?${queryString}` : ''}`, {
    method,
    headers: { ...canonicalHeadersObject, authorization, ...(payload ? { 'content-type': 'application/json; charset=utf-8' } : {}) },
    body: payload || undefined,
    signal: AbortSignal.timeout(20000),
  });
  const responseText = await response.text();
  let responseBody = null;
  try { responseBody = responseText ? JSON.parse(responseText) : null; } catch { responseBody = { raw: responseText.slice(0, 2000) }; }
  if (!response.ok) {
    const code = response.status === 429 ? 'amazon_rate_limited' : response.status === 403 ? 'amazon_forbidden' : 'amazon_api_error';
    throw new HttpError(response.status === 429 ? 429 : 502, responseBody?.errors?.[0]?.message || responseBody?.message || `Amazon API returned ${response.status}.`, code);
  }
  return { status: response.status, headers: response.headers, body: responseBody };
}

export async function getProductTypeDefinition(productType, marketplaceId, locale = 'en_US') {
  return amazonRequest(`/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}`, { query: { marketplaceIds: marketplaceId, locale } });
}

export async function putListing({ sellerId, sku, marketplaceId, productType, attributes, mode = '' }) {
  const config = amazonEnvironment();
  const seller = sellerId || config.sellerId;
  if (!seller || !sku || !marketplaceId || !productType) throw new HttpError(400, 'Amazon listing mapping is incomplete.', 'amazon_mapping_invalid');
  return amazonRequest(`/listings/2021-08-01/items/${encodeURIComponent(seller)}/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    query: { marketplaceIds: marketplaceId, includedData: 'issues', ...(mode ? { mode } : {}) },
    body: { productType, requirements: 'LISTING', attributes },
  });
}

export async function upsertAmazonListing({ product, item, issues = [], status = 'validated', attributes = {}, submissionId = null }) {
  if (!product?.id || !item?.marketplaceId || !item?.sku || !Number.isSafeInteger(item.price) || item.price <= 0) throw new HttpError(400, 'Amazon listing mapping is incomplete.', 'amazon_mapping_invalid');
  let db;
  try { db = privateDb(); } catch (error) { throw new HttpError(503, 'Amazon audit storage is not configured.', 'amazon_storage_not_configured'); }
  const key = { product_id: String(product.id), variant_id: String(item.variantId || ''), marketplace_id: String(item.marketplaceId) };
  const existing = await db.from('amazon_listings').select('id,revision').match(key).maybeSingle();
  if (existing.error) throw new HttpError(503, 'Amazon listing storage is unavailable.', 'amazon_storage_unavailable');
  const row = {
    ...key,
    seller_sku: String(item.sku).slice(0, 80),
    asin: String(item.asin || '').slice(0, 20),
    product_type: String(item.productType || 'SHOES').slice(0, 80),
    price_minor: item.price,
    currency: String(item.currency || 'USD').toUpperCase(),
    handling_days: Math.max(1, Math.min(30, Number(item.handlingDays || 3))),
    image_url: String(product.image || '').slice(0, 2000),
    attributes: attributes && typeof attributes === 'object' ? attributes : {},
    revision: Number(existing.data?.revision || 0) + 1,
    status,
    issues: Array.isArray(issues) ? issues.slice(0, 50).map(issue => String(issue).slice(0, 500)) : [],
    submission_id: submissionId ? String(submissionId).slice(0, 200) : null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const result = await db.from('amazon_listings').upsert(row, { onConflict: 'product_id,variant_id,marketplace_id' }).select('id,product_id,variant_id,marketplace_id,seller_sku,status,revision,last_synced_at').maybeSingle();
  if (result.error) throw new HttpError(503, 'Amazon listing storage is unavailable.', 'amazon_storage_unavailable');
  return result.data;
}

export function publicEnvironment() {
  const config = amazonEnvironment();
  return { configured: config.configured, ready: config.ready, hasLwa: config.hasLwa, hasAws: config.hasAws, sellerId: Boolean(config.sellerId), marketplaceId: config.marketplaceId || '', endpoint: config.endpoint };
}

export async function requireAmazonMember(req) { return requireMember(req); }

export function authToken(req) { return (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1] || ''; }

export async function readAdminState(req) {
  const token = authToken(req);
  const client = publicDb(token);
  const { data, error } = await client.rpc('admin_state_v1', { p_state_id: 'default' });
  if (error || !data?.[0]?.payload) throw new HttpError(503, 'Store data is not available.', 'store_state_unavailable');
  return data[0];
}

export function parseSyncRequest(req) {
  const body = requestBody(req);
  const operation = String(body.operation || 'validate');
  if (!['validate', 'publish', 'definition'].includes(operation)) throw new HttpError(400, 'Unknown Amazon sync operation.', 'amazon_operation_invalid');
  const marketplaceId = String(body.marketplaceId || '').trim();
  const productId = body.productId == null ? '' : String(body.productId).trim();
  if (productId.length > 120) throw new HttpError(400, 'Product mapping is invalid.', 'amazon_mapping_invalid');
  return { operation, marketplaceId, productId, dryRun: body.dryRun !== false };
}

export { Amazon, HttpError, send, failure, publicDb, privateDb };
