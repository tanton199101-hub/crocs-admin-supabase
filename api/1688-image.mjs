const ALLOWED_HOSTS = new Set(['cbu01.alicdn.com', 'gw.alicdn.com', 'img.alicdn.com', 'itemcdn.tmall.com', 'img01.1688.com', 'img02.1688.com']);
const ALICDN_HOST_RE = /(?:^|\.)alicdn\.com$/i;
const MAX_BYTES = 8 * 1024 * 1024;

function allowedUrl(raw) {
  if (!raw) return null;
  try {
    const url = raw instanceof URL ? raw : new URL(String(raw));
    if (url.protocol !== 'https:' || !(ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || ALICDN_HOST_RE.test(url.hostname))) return null;
    // The proxy is intentionally limited to image/detail-CDN paths. This
    // prevents it from becoming an open SSRF or arbitrary URL relay.
    if (!/^\/(?:img|imgextra|cms|tfs|i\d*)\//i.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function requestedUrl(req) {
  const raw = req?.query?.url || new URL(req?.url || '/', 'https://store.invalid').searchParams.get('url');
  return allowedUrl(raw);
}

export default async function handler(req, res) {
  if (req?.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const target = requestedUrl(req);
  if (!target) return res.status(400).json({ error: 'Invalid 1688 image URL' });
  try {
    let upstream;
    let current = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      upstream = await fetch(current, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        redirect: 'manual',
        headers: { accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8' },
        signal: AbortSignal.timeout(15000),
      });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      const location = upstream.headers.get('location');
      const redirected = location ? allowedUrl(new URL(location, current)) : null;
      if (!redirected) return res.status(502).json({ error: 'Upstream redirect is not allowed' });
      current = redirected;
      if (attempt === 3) return res.status(502).json({ error: 'Too many upstream redirects' });
    }
    if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Upstream image unavailable' });
    const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!/^image\/(?:avif|webp|jpeg|png|gif|svg\+xml)$/.test(contentType)) return res.status(502).json({ error: 'Upstream response is not an image' });
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return res.status(413).json({ error: 'Image is too large' });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.status(200).end();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'Image is too large' });
    return res.status(200).send(buffer);
  } catch {
    return res.status(504).json({ error: 'Image fetch timed out' });
  }
}
