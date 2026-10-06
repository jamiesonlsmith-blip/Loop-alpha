const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function normalizeQuery(value = '') {
  const q = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  if (/pizza/.test(q)) return 'pizza';
  if (/tire|tyre|flat tire|flat tyre|change my tire|change a tire/.test(q)) return 'tire shop';
  if (/mechanic|auto repair|car repair|oil change|brake/.test(q)) return 'auto repair';
  if (/urgent care|doctor|medical|clinic/.test(q)) return 'clinic';
  if (/coffee|cafe/.test(q)) return 'coffee';
  if (/restaurant|food|eat/.test(q)) return 'restaurant';
  return q.slice(0, 120);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = normalizeQuery(req.query.q);
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!query || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'A search term and valid location are required.' });
  }

  const dLat = 0.45;
  const dLon = 0.55;
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].join(',');

  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '15',
    bounded: '1',
    viewbox,
    q: query
  });

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'LoopAlpha/0.2 (+https://loop-alpha-nu.vercel.app/)',
        'Referer': 'https://loop-alpha-nu.vercel.app/'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Place search provider is temporarily unavailable.' });
    }

    const items = await response.json();
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    return res.status(200).json({
      query,
      items: Array.isArray(items) ? items : [],
      attribution: '© OpenStreetMap contributors'
    });
  } catch (error) {
    return res.status(502).json({ error: 'Place search is temporarily unavailable.' });
  }
}
