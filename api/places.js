const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const SEARCH_SCOPES = {
  local: { maxMiles: 8, dLat: 0.12, dLon: 0.15, label: 'current Loop', next: 'expanded' },
  expanded: { maxMiles: 22, dLat: 0.32, dLon: 0.38, label: 'expanded Loop', next: 'broad' },
  broad: { maxMiles: 45, dLat: 0.65, dLon: 0.78, label: 'wider area', next: null }
};

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function queryCandidates(value = '', category = '') {
  const q = normalize(value);
  if (!q) return [];

  // Preserve specific intent instead of widening prematurely.
  if (/\brooftop\b|\broof[ -]?top\b/.test(q)) {
    return unique([q, 'rooftop bar', 'rooftop lounge', 'rooftop restaurant']);
  }
  if (/\bbrunch\b/.test(q)) return unique([q, 'brunch', 'brunch restaurant']);
  if (/\bsushi\b/.test(q)) return unique([q, 'sushi restaurant']);
  if (/\bvegan\b/.test(q)) return unique([q, 'vegan restaurant']);
  if (/\bcoffee\b|\bcafe\b/.test(q)) return unique([q, 'coffee']);
  if (/\bpizza\b/.test(q)) return unique([q, 'pizza']);

  // Auto sub-intents stay specific so a brake search does not turn into a
  // generic list of every car-repair business nearby.
  if (/\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/.test(q)) {
    return unique([q, 'auto body shop', 'collision repair']);
  }
  if (/\bbrake(?:s| service| repair)?\b|\bbraking\b/.test(q)) {
    return unique([q, 'brake service', 'brake repair']);
  }
  if (/\boil change\b|\blube\b|\blubrication\b/.test(q)) {
    return unique([q, 'oil change', 'lube service']);
  }
  if (/tire|tyre|flat tire|flat tyre|change my tire|change a tire|tire repair|wheel repair/.test(q)) {
    return unique([q, 'tire shop', 'tyre shop']);
  }
  if (/car shop|auto shop|repair shop|mechanic|auto repair|car repair/.test(q)) {
    return unique([q, 'auto repair', 'car repair', 'mechanic']);
  }

  if (/urgent care|doctor|medical|clinic/.test(q)) return unique([q, 'clinic']);
  if (/\bbowling\b/.test(q)) return unique([q, 'bowling alley', 'bowling']);
  if (/\barcade\b|video arcade|game arcade/.test(q)) return unique([q, 'arcade', 'amusement arcade', 'family entertainment center']);
  if (/mini golf|miniature golf|putt[ -]?putt/.test(q)) return unique([q, 'miniature golf', 'mini golf']);
  if (/go[ -]?karts?|go[ -]?cart|karting/.test(q)) return unique([q, 'go kart', 'karting']);
  if (/roller skating|roller rink|skating rink/.test(q)) return unique([q, 'roller skating', 'skating rink']);
  if (/escape room/.test(q)) return unique([q, 'escape room']);
  if (/laser tag/.test(q)) return unique([q, 'laser tag']);
  if (/trampoline/.test(q)) return unique([q, 'trampoline park']);
  if (/action park|amusement park|theme park|family fun|fun center|entertainment center/.test(q)) {
    return unique([q, 'amusement park', 'family entertainment center', 'arcade']);
  }
  if (category === 'fun-games' && /^(fun|games|fun and games|something fun|activities|things to do|nearby|something nearby)$/.test(q)) {
    return ['family entertainment center', 'arcade', 'bowling alley', 'amusement park'];
  }

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

  if (/\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/.test(q)) {
    groups.push(/\bbody shop\b|\bauto body\b|\bcollision\b|\bpanel beat(?:er|ing)\b|\bcoachwork\b/i);
  }
  if (/\bbrake(?:s| service| repair)?\b|\bbraking\b/.test(q)) {
    groups.push(/\bbrake\b|\bbrakes\b|\bbraking\b/i);
  }
  if (/\boil change\b|\blube\b|\blubrication\b/.test(q)) {
    groups.push(/\boil change\b|\blube\b|\blubrication\b/i);
  }
  if (/\btire\b|\btyre\b/.test(q)) groups.push(/\btire\b|\btyre\b|\btyres\b/i);
  if (/\bmechanic\b|\bauto repair\b|\bcar repair\b/.test(q)) groups.push(/\bmechanic\b|\bauto repair\b|\bcar repair\b|\bgarage\b/i);

  if (/\burgent care\b/.test(q)) groups.push(/\burgent care\b|\bclinic\b/i);
  if (/\bbowling\b/.test(q)) groups.push(/\bbowling\b|\bbowling alley\b/i);
  if (/\barcade\b|video arcade|game arcade/.test(q)) groups.push(/\barcade\b|\bamusement arcade\b|\bfamily entertainment\b/i);
  if (/mini golf|miniature golf|putt[ -]?putt/.test(q)) groups.push(/\bmini golf\b|\bminiature golf\b|\bputt[ -]?putt\b/i);
  if (/go[ -]?karts?|go[ -]?cart|karting/.test(q)) groups.push(/\bgo[ -]?karts?\b|\bkarting\b/i);
  if (/roller skating|roller rink/.test(q)) groups.push(/\broller\b|\broller skating\b|\broller rink\b/i);
  if (/escape room/.test(q)) groups.push(/\bescape room\b|\bescape game\b/i);
  if (/laser tag/.test(q)) groups.push(/\blaser tag\b/i);
  if (/trampoline/.test(q)) groups.push(/\btrampoline\b/i);
  if (/amusement park|theme park/.test(q)) groups.push(/\bamusement park\b|\btheme park\b/i);

  return groups;
}

function itemSearchText(item = {}) {
  const extras = item.extratags && typeof item.extratags === 'object' ? Object.values(item.extratags) : [];
  const names = item.namedetails && typeof item.namedetails === 'object' ? Object.values(item.namedetails) : [];
  const address = item.address && typeof item.address === 'object' ? Object.values(item.address) : [];
  return [
    item.name,
    item.display_name,
    item.type,
    item.category,
    ...address,
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

function firstAddressValue(address = {}, keys = []) {
  for (const key of keys) {
    const value = cleanText(address[key]);
    if (value) return value;
  }
  return '';
}

function dedupeParts(parts = [], placeName = '') {
  const seen = new Set();
  const placeKey = normalize(placeName);
  return parts.map(cleanText).filter(value => {
    if (!value) return false;
    const key = normalize(value);
    if (!key || key === placeKey || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackAddressParts(item = {}, placeName = '') {
  const parts = String(item.display_name || '').split(',').map(cleanText).filter(Boolean);
  if (parts.length && normalize(parts[0]) === normalize(placeName)) parts.shift();
  return dedupeParts(parts, placeName);
}

function placeNameFor(item = {}) {
  const namedetails = item.namedetails && typeof item.namedetails === 'object' ? item.namedetails : {};
  return cleanText(item.name || namedetails.name || namedetails['name:en'] || String(item.display_name || '').split(',')[0] || 'Local place');
}

function internationalAddressFor(item = {}, placeName = '') {
  const address = item.address && typeof item.address === 'object' ? item.address : {};
  const houseNumber = firstAddressValue(address, ['house_number']);
  const road = firstAddressValue(address, ['road','pedestrian','residential','street','footway','path']);
  const locality = firstAddressValue(address, ['city','town','village','municipality','hamlet','suburb','neighbourhood','quarter','city_district','locality']);
  const region = firstAddressValue(address, ['state','region','province','state_district','county']);
  const postcode = firstAddressValue(address, ['postcode']);
  const country = firstAddressValue(address, ['country']);
  const countryCode = cleanText(address.country_code).toUpperCase();
  const roadLine = cleanText([houseNumber, road].filter(Boolean).join(' '));

  let fullParts = dedupeParts([roadLine, locality, region, postcode, country], placeName);
  if (!fullParts.length) fullParts = fallbackAddressParts(item, placeName);

  let shortParts;
  if (roadLine && locality) {
    shortParts = dedupeParts([roadLine, locality, country], placeName);
  } else if (locality) {
    shortParts = dedupeParts([locality, region, country], placeName);
  } else if (region) {
    shortParts = dedupeParts([region, country], placeName);
  } else {
    const fallback = fallbackAddressParts(item, placeName);
    shortParts = fallback.length > 3 ? [fallback[0], fallback[1], fallback[fallback.length - 1]] : fallback;
  }

  return {
    short: shortParts.join(' · '),
    full: fullParts.join(', '),
    locality,
    region,
    country,
    countryCode
  };
}

function humanizeSlug(value = '') {
  const text = cleanText(value).replace(/[_-]+/g, ' ');
  return text ? text.replace(/\b\w/g, letter => letter.toUpperCase()) : '';
}

function categoryPresentation(item = {}, query = '', category = '') {
  const q = normalize(query);
  const type = normalize(item.type);
  const rawCategory = normalize(item.category);

  if (/\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/.test(q)) return { label: 'Body Shop', icon: '🚗🔧' };
  if (/\bbrake(?:s| service| repair)?\b|\bbraking\b/.test(q)) return { label: 'Brake Service', icon: '🚗🔧' };
  if (/\boil change\b|\blube\b|\blubrication\b/.test(q)) return { label: 'Oil Change', icon: '🚗🔧' };
  if (/\btire\b|\btyre\b/.test(q)) return { label: 'Tire Shop', icon: '🚗🔧' };
  if (/\bmechanic\b|\bauto repair\b|\bcar repair\b/.test(q)) return { label: 'Auto Repair', icon: '🚗🔧' };

  const typeMap = {
    restaurant: ['Restaurant', '🍽'],
    cafe: ['Café', '☕'],
    coffee_shop: ['Coffee', '☕'],
    fast_food: ['Quick Bites', '🍽'],
    bar: ['Bar & Lounge', '🍸'],
    pub: ['Pub', '🍸'],
    nightclub: ['Nightlife', '♫'],
    clinic: ['Clinic', '✚'],
    hospital: ['Hospital', '✚'],
    doctors: ['Medical', '✚'],
    dentist: ['Dentist', '✚'],
    pharmacy: ['Pharmacy', '✚'],
    park: ['Park', '🌿'],
    garden: ['Garden', '🌿'],
    car_repair: ['Auto Repair', '🚗🔧'],
    car_parts: ['Auto Parts', '🚗'],
    tyres: ['Tire Shop', '🚗🔧'],
    clothes: ['Fashion', '🛍'],
    shoes: ['Shoes', '🛍'],
    jewelry: ['Jewelry', '🛍'],
    furniture: ['Furniture', '🛍'],
    supermarket: ['Shopping', '🛍'],
    hotel: ['Hotel', '✈'],
    motel: ['Stay', '✈'],
    guest_house: ['Stay', '✈'],
    car_rental: ['Car Rental', '✈'],
    bowling_alley: ['Bowling', '🎯'],
    amusement_arcade: ['Arcade', '🎮'],
    amusement_park: ['Amusement Park', '🎯'],
    miniature_golf: ['Mini Golf', '🎯']
  };

  if (typeMap[type]) return { label: typeMap[type][0], icon: typeMap[type][1] };

  const categoryMap = {
    restaurants: ['Restaurant', '🍽'],
    medical: ['Medical', '✚'],
    parks: ['Parks & Outdoors', '🌿'],
    'home-services': ['Home Service', '⌂'],
    auto: ['Auto Service', '🚗🔧'],
    retail: ['Retail', '🛍'],
    travel: ['Travel', '✈'],
    'fun-games': ['Fun & Games', '🎯']
  };
  if (categoryMap[category]) return { label: categoryMap[category][0], icon: categoryMap[category][1] };

  const fallback = humanizeSlug(type && type !== 'yes' ? type : rawCategory);
  return { label: fallback || 'Local Place', icon: '◎' };
}

async function searchNominatim(query, viewbox, language = 'en-US,en;q=0.9') {
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
      'Accept-Language': language,
      'User-Agent': 'LoopAlpha/0.5 (+https://loop-alpha-nu.vercel.app/)',
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
  const language = cleanText(req.headers['accept-language'] || 'en-US,en;q=0.9').slice(0, 100);

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
      const found = await searchNominatim(candidate, viewbox, language);
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

        const loopName = placeNameFor(item);
        const loopAddress = internationalAddressFor(item, loopName);
        const loopCategory = categoryPresentation(item, query, category);

        merged.push({
          ...item,
          loop_name: loopName,
          loop_short_address: loopAddress.short,
          loop_full_address: loopAddress.full,
          loop_locality: loopAddress.locality,
          loop_region: loopAddress.region,
          loop_country: loopAddress.country,
          loop_country_code: loopAddress.countryCode,
          loop_category_label: loopCategory.label,
          loop_category_icon: loopCategory.icon,
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
