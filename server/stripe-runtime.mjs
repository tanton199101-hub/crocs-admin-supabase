import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { HttpError, environmentStatus, assertOrigin } from './stripe-core.mjs';

const SUPABASE_URL = 'https://uvtgzcuifbiufwcrylxx.supabase.co';
const PUBLIC_KEY = 'sb_publishable_z8ozM2OM1MV3fo0nJDksxA_bBi97bIP';
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(12000) }) } };
export const environment = () => environmentStatus();
export const publicDb = token => createClient(process.env.SUPABASE_URL || SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || PUBLIC_KEY, token ? { ...clientOptions, global: { ...clientOptions.global, headers: { Authorization: `Bearer ${token}` } } } : clientOptions);
export function privateDb() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new HttpError(503, 'The secure payment backend is not configured.', 'backend_not_configured');
  return createClient(process.env.SUPABASE_URL || SUPABASE_URL, key, clientOptions);
}
export function stripeClient() {
  if (!environment().secretKey) throw new HttpError(503, 'Stripe is not configured.', 'stripe_not_configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 12000, maxNetworkRetries: 1 });
}

export async function dbRpc(client, name, values = {}) {
  const { data, error } = await client.rpc(name, values);
  if (error) {
    const status = error.code === 'P0001' && /too many/i.test(error.message) ? 429 : ['22023', '23505'].includes(error.code) ? 409 : error.code === '42501' ? 403 : 503;
    const message = status === 429 ? 'Too many checkout attempts. Please wait before trying again.' : status === 409 ? error.message : 'The payment database could not complete this request. Please try again.';
    throw new HttpError(status, message, error.code || 'database_unavailable');
  }
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

export async function paymentConfig() {
  const { data, error } = await publicDb().rpc('storefront_payment_v1');
  if (error?.code === 'PGRST202') return { migration: false, payment: { provider: 'stripe', enabled: false, mode: 'test', methods: 'automatic' } };
  if (error || !data) throw new HttpError(503, 'Checkout is temporarily unavailable. Please try again later.');
  return { migration: true, payment: data };
}

export async function requireMember(req) {
  const token = (req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Đăng nhập admin để kiểm tra kết nối.');
  const client = publicDb(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  const { data: member, error: memberError } = await client.rpc('is_store_member', { p_store_id: 'default' });
  if (memberError || member !== true) throw new HttpError(403, 'Tài khoản chưa có quyền quản trị cửa hàng.');
  return data.user;
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}
export function failure(res, error) {
  // Do not log customer data, Stripe response objects, keys or signatures.
  console.error('[payment]', error.code || error.type || error.name || 'unknown');
  return send(res, error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.message : 'Payment could not be processed. Please try again.', code: error instanceof HttpError ? error.code : 'payment_unavailable' });
}
export function method(req, res, allowed) {
  if (req.method === allowed) return true;
  res.setHeader('Allow', allowed); send(res, 405, { error: 'Method not allowed.' }); return false;
}
export function originGuard(req) { assertOrigin(req.headers.origin, environment().origin); }
export function requestBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Send a JSON checkout request.');
  if (Number(req.headers['content-length'] || 0) > 16000) throw new HttpError(413, 'The checkout request is too large.');
  let body = req.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (Buffer.byteLength(body) > 16000) throw new HttpError(413, 'The checkout request is too large.');
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Invalid JSON request.'); }
  }
  if (Buffer.byteLength(JSON.stringify(body || {})) > 16000) throw new HttpError(413, 'The checkout request is too large.');
  return body;
}
export function rateKey(req) {
  // Only the hosting platform's trusted address is used; never store raw IPs.
  const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  return createHmac('sha256', process.env.CHECKOUT_RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY).update(String(ip)).digest('hex');
}
export async function attemptBySession(sessionId) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]{12,255}$/.test(sessionId || '')) throw new HttpError(400, 'Invalid checkout session.');
  const { data, error } = await privateDb().from('stripe_checkout_attempts').select('id,order_id,status,stripe_session_id,mode,currency,region_id').eq('stripe_session_id', sessionId).maybeSingle();
  if (error) throw new HttpError(503, 'Payment confirmation is not available yet.');
  if (!data) throw new HttpError(404, 'The checkout session was not found.');
  return data;
}
