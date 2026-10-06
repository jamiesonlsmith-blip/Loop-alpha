const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function queryCandidates(value = '') {
  const q = String(value).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  if (!q) return [];

  if (/pizza/.test(q)) return ['pizza'];
  if (/tire|tyre|flat tire|flat tyre|change my tire|change a tire|tire repair|wheel repair/.test(q)) {
    return ['tire shop', 'auto repair', 'car repair', 'mechanic'];
  }
  if (/car shop|auto shop|repair shop|mechanic|auto repair|car repair|oil change|brake/.test(q)) {
    return ['auto repair', 'car repair', 'mechanic'];
  }
  if (/urgent care|doctor|medical|clinic/.test(q)) return ['clinic'];
  if (/coffee|cafe/.test(q)) return ['coffee'];
  if (/restaurant|food|eat/.test(q)) return ['restaurant'];
  return [q];
}

async function searchNominatim(query, viewbox) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '15',
    bounded: '1',
    viewbox,
    q: query
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'LoopAlpha/0.3 (+https://loop-alpha-nu.vercel.app/)',
      'Referer': 'https://loop-alpha-nu.vercel.app/'
    }
  });

  if (!response.ok) throw new Error('provider');
  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const candidates = queryCandidates(req.query.q);
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!candidates.length || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'A search term and valid location are required.' });
  }

  const dLat = 0.45;
  const dLon = 0.55;
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].join(',');

  try {
    const merged = [];
    const seen = new Set();
    const matchedQueries = [];

    for (const candidate of candidates) {
      const found = await searchNominatim(candidate, viewbox);
      matchedQueries.push(candidate);

      for (const item of found) {
        const key = String(item.place_id || item.osm_id || item.display_name);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= 15) break;
      }

      if (merged.length >= 8) break;
    }

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    return res.status(200).json({
      query: candidates[0],
      matchedQueries,
      items: merged.slice(0, 15),
      attribution: '© OpenStreetMap contributors'
    });
  } catch (error) {
    return res.status(502).json({ error: 'Place search is temporarily unavailable.' });
  }
}
