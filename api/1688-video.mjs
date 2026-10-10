const ALLOWED_HOSTS = new Set(['cloud.video.taobao.com', 'video01.1688.com', 'video.1688.com', 'caiyuanbao.alicdn.com']);
const VIDEO_HOST_RE = /(?:^|\.)video\.(?:taobao|1688|alibaba)\.com$/i;

function allowedUrl(raw) {
  if (!raw) return null;
  try {
    const url = raw instanceof URL ? raw : new URL(String(raw));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(ALLOWED_HOSTS.has(host) || VIDEO_HOST_RE.test(host))) return null;
    if ((!/^\/(?:play|video|download)\//i.test(url.pathname) && host !== 'caiyuanbao.alicdn.com') || !/\.mp4(?:$|[?#])/i.test(url.pathname + url.search)) return null;
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
  if (req?.method && !['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const target = requestedUrl(req);
  if (!target) return res.status(400).json({ error: 'Invalid 1688 video URL' });
  // 1688 returns a short-lived CDN redirect. Resolve that redirect server-side
  // (without downloading the MP4), then let the browser negotiate byte ranges
  // directly with the CDN instead of buffering a large file in the function.
  let location = target.href;
  try {
    const upstream = await fetch(target, {
      method: 'GET', redirect: 'manual',
      headers: { accept: 'video/mp4,video/*;q=0.9,*/*;q=0.1', 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    const upstreamLocation = upstream.headers.get('location');
    if (upstreamLocation) {
      const redirected = allowedUrl(new URL(upstreamLocation, target));
      if (redirected) location = redirected.href;
    } else if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Upstream video unavailable' });
    }
  } catch {
    // Keep the original validated URL as a fallback. The client may still be
    // able to resolve it from its network location.
  }
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(307).end();
}
