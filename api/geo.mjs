function firstHeader(value) {
  return Array.isArray(value) ? value[0] : String(value || '').split(',')[0].trim();
}

function country(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(code) ? code : '';
}

export default function handler(req, res) {
  const query = req?.query?.country || req?.url?.match(/[?&]country=([A-Za-z]{2,3})/)?.[1];
  const code = country(query)
    || country(firstHeader(req?.headers?.['x-vercel-ip-country']))
    || country(firstHeader(req?.headers?.['cf-ipcountry']))
    || country(firstHeader(req?.headers?.['x-country-code']))
    || '';
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ countryCode: code, source: code ? 'edge-header' : 'browser-fallback' });
}
