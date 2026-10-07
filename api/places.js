const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const SEARCH_SCOPES = {
  local: { maxMiles: 8, dLat: 0.12, dLon: 0.15, label: 'current Loop', next: 'expanded' },
  expanded: { maxMiles: 22, dLat: 0.32, dLon: 0.38, label: 'expanded Loop', next: 'broad' },
  broad: { maxMiles: 45, dLat: 0.65, dLon: 0.78, label: 'wider area', next: null }
};

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function queryCandidates(value = '', category = '') {
  const q = normalize(value);
  if (!q) return [];

  // Preserve the user's actual intent. Never collapse a specific request such
  // as "rooftop lounge" into a generic "restaurant" search.
  if (/\brooftop\b|\broof[ -]?top\b/.test(q)) {
    return unique([q, 'rooftop bar', 'rooftop lounge', 'rooftop restaurant']);
  }
  if (/\bbrunch\b/.test(q)) return unique([q, 'brunch', 'brunch restaurant']);
  if (/\bsushi\b/.test(q)) return unique([q, 'sushi restaurant']);
  if (/\bvegan\b/.test(q)) return unique([q, 'vegan restaurant']);
  if (/\bcoffee\b|\bcafe\b/.test(q)) return unique([q, 'coffee']);
  if (/\bpizza\b/.test(q)) return unique([q, 'pizza']);
  if (/tire|tyre|flat tire|flat tyre|change my tire|change a tire|tire repair|wheel repair/.test(q)) {
    return unique([q, 'tire shop', 'auto repair']);
  }
  if (/car shop|auto shop|repair shop|mechanic|auto repair|car repair|oil change|brake/.test(q)) {
    return unique([q, 'auto repair', 'car repair', 'mechanic']);
  }
  if (/urgent care|doctor|medical|clinic/.test(q)) return unique([q, 'clinic']);

  // Only normalize when the user actually made a broad category request.
  if (/^(restaurant|restaurants|food|places to eat|eat)$/.test(q) || (category === 'restaurants' && /^(nearby|something nearby)$/.test(q))) {
    return ['restaurant'];
  }
  if (/^(park|parks)$/.test(q)) return ['park'];
  if (/^(shopping|stores|retail)$/.test(q)) return ['shopping'];

  return [q];
}

function hardIntentGroups(value = '') {
  const q = normalize(value);
  const groups = [];

  if (/\brooftop\b|\broof[ -]?top\b/.test(q)) {
    groups.push(/\brooftop\b|\broof[ -]?top\b|\broof deck\b|\broof terrace\b|\bsky bar\b|\bsky lounge\b/i);
  }
  if (/\bsushi\b/.test(q)) groups.push(/\bsushi\b|\bjapanese\b/i);
  if (/\bmexican\b/.test(q)) groups.push(/\bmexican\b|\btaqueria\b|\btaco\b/i);
  if (/\bitalian\b/.test(q)) groups.push(/\bitalian\b|\btrattoria\b|\bpizzeria\b/i);
  if (/\bvegan\b/.test(q)) groups.push(/\bvegan\b/i);
  if (/\bbrunch\b/.test(q)) groups.push(/\bbrunch\b|\bbreakfast\b/i);
  if (/\bcoffee\b|\bcafe\b/.test(q)) groups.push(/\bcoffee\b|\bcafe\b|\bcafé\b/i);
  if (/\bpizza\b/.test(q)) groups.push(/\bpizza\b|\bpizzeria\b/i);
  if (/\btire\b|\btyre\b/.test(q)) groups.push(/\btire\b|\btyre\b|\btyres\b/i);
  if (/\bmechanic\b|\bauto repair\b|\bcar repair\b/.test(q)) groups.push(/\bmechanic\b|\bauto repair\b|\bcar repair\b|\bgarage\b/i);
  if (/\burgent care\b/.test(q)) groups.push(/\burgent care\b|\bclinic\b/i);

  return groups;
}

function itemSearchText(item = {}) {
  const extras = item.extratags && typeof item.extratags === 'object' ? Object.values(item.extratags) : [];
  const names = item.namedetails && typeof item.namedetails === 'object' ? Object.values(item.namedetails) : [];
  return [
    item.name,
    item.display_name,
    item.type,
    item.category,
    ...extras,
    ...names
  ].filter(Boolean).join(' ').toLowerCase();
}

function meaningfulTokens(value = '') {
  const stop = new Set([
    'the','a','an','and','or','for','with','near','nearby','best','good','great','find','show','me',
    'place','places','restaurant','restaurants','food','eat','to','my','in','of','that','is','are'
  ]);
  return normalize(value).split(/[^a-z0-9]+/).filter(token => token.length > 2 && !stop.has(token));
}

function relevanceScore(item, query) {
  const text = itemSearchText(item);
  const q = normalize(query);
  let score = 0;

  if (q && text.includes(q)) score += 20;
  for (const token of meaningfulTokens(q)) {
    if (text.includes(token)) score += 4;
  }

  const type = String(item.type || '').toLowerCase();
  if (['restaurant','bar','pub','cafe','nightclub','fast_food','clinic','hospital','park','car_repair'].includes(type)) score += 1;

  return score;
}

function passesIntent(item, query) {
  const text = itemSearchText(item);
  return hardIntentGroups(query).every(pattern => pattern.test(text));
}

function milesBetween(lat1, lon1, lat2, lon2) {
  const toRad = value => value * Math.PI / 180;
  const r = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

async function searchNominatim(query, viewbox) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    dedupe: '1',
    limit: '25',
    bounded: '1',
    viewbox,
    q: query
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'LoopAlpha/0.4 (+https://loop-alpha-nu.vercel.app/)',
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

  const category = normalize(req.query.category);
  const query = normalize(req.query.q);
  const candidates = queryCandidates(query, category);
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const scopeKey = SEARCH_SCOPES[req.query.scope] ? req.query.scope : 'local';
  const scope = SEARCH_SCOPES[scopeKey];

  if (!candidates.length || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'A search term and valid location are required.' });
  }

  const viewbox = [
    lon - scope.dLon,
    lat + scope.dLat,
    lon + scope.dLon,
    lat - scope.dLat
  ].join(',');

  try {
    const merged = [];
    const seen = new Set();
    const matchedQueries = [];

    for (const candidate of candidates) {
      const found = await searchNominatim(candidate, viewbox);
      matchedQueries.push(candidate);

      for (const item of found) {
        const itemLat = Number(item.lat);
        const itemLon = Number(item.lon);
        if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) continue;

        const distanceMiles = milesBetween(lat, lon, itemLat, itemLon);
        if (distanceMiles > scope.maxMiles) continue;
        if (!passesIntent(item, query)) continue;

        const key = String(item.place_id || item.osm_id || item.display_name);
        if (seen.has(key)) continue;
        seen.add(key);

        merged.push({
          ...item,
          loop_distance_miles: Math.round(distanceMiles * 10) / 10,
          loop_relevance: relevanceScore(item, query)
        });
      }
    }

    merged.sort((a, b) => {
      if (b.loop_relevance !== a.loop_relevance) return b.loop_relevance - a.loop_relevance;
      return a.loop_distance_miles - b.loop_distance_miles;
    });

    const items = merged.slice(0, 15).map(({ loop_relevance, ...item }) => item);

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({
      query,
      matchedQueries,
      scope: scopeKey,
      scopeLabel: scope.label,
      canExpand: Boolean(scope.next),
      nextScope: scope.next,
      strictIntent: hardIntentGroups(query).length > 0,
      items,
      attribution: '© OpenStreetMap contributors'
    });
  } catch (error) {
    return res.status(502).json({ error: 'Place search is temporarily unavailable.' });
  }
}
