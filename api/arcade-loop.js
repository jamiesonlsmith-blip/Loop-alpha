const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slug(value) {
  return clean(value, 160)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function first(address, keys) {
  for (const key of keys) {
    const value = clean(address && address[key]);
    if (value) return value;
  }
  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=7200');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ ok: false, error: 'A valid location is required.' });
  }

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '12',
      lat: String(lat),
      lon: String(lon)
    });

    const response = await fetch(NOMINATIM_REVERSE + '?' + params.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': clean(req.headers['accept-language'], 100) || 'en-US,en;q=0.9',
        'User-Agent': 'LoopAlpha/0.6 (+https://loop-alpha-nu.vercel.app/)',
        Referer: 'https://loop-alpha-nu.vercel.app/'
      }
    });

    if (!response.ok) throw new Error('location provider');
    const place = await response.json();
    const address = place && place.address && typeof place.address === 'object' ? place.address : {};

    const locality = first(address, ['city','town','village','municipality','suburb','neighbourhood','hamlet','locality']);
    const region = first(address, ['state','region','province','state_district','county']);
    const country = first(address, ['country']);
    const countryCode = clean(address.country_code, 8).toLowerCase();

    const labelParts = [];
    for (const part of [locality, region]) {
      if (part && !labelParts.some(existing => existing.toLowerCase() === part.toLowerCase())) labelParts.push(part);
    }
    if (!labelParts.length && country) labelParts.push(country);
    const label = clean(labelParts.join(', ') || place.display_name || 'Current Loop', 120);
    const keyParts = [countryCode || country, region, locality].filter(Boolean).map(slug).filter(Boolean);
    const key = clean(keyParts.join('/') || ('loop/' + slug(label)), 160);

    return res.status(200).json({
      ok: true,
      loop: {
        key,
        label,
        locality: locality || null,
        region: region || null,
        country: country || null,
        countryCode: countryCode || null
      }
    });
  } catch (error) {
    console.error('Loop arcade location error:', error && error.message ? error.message : error);
    return res.status(503).json({ ok: false, error: 'Current Loop could not be identified right now.' });
  }
};
