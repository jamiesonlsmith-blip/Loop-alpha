import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Import as ESM without changing the application's deployment/module settings.
const source = await readFile(new URL('../api/places.js', import.meta.url), 'utf8');
const { default: handler, searchIntent, cuisineMatchType, overpassItem, overtureItem, overtureTerms, resultKey } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const restaurant = (cuisine, name = 'Test Kitchen') =>
  ({ type: 'restaurant', name, extratags: { cuisine } });

test('understands cuisine searches and dish synonyms', () => {
  assert.equal(searchIntent('Haitian food', 'restaurants').key, 'cuisine-haitian');
  assert.equal(searchIntent('best Haitian restaurants near me', 'restaurants').key, 'cuisine-haitian');
  assert.equal(searchIntent('where can I find griot?', 'restaurants').key, 'cuisine-haitian');
  assert.equal(searchIntent('best pasta nearby', 'restaurants').key, 'cuisine-italian');
  assert.equal(searchIntent('biryani takeout near me', 'restaurants').key, 'cuisine-indian');
  assert.equal(searchIntent('brake service', 'auto').key, 'brake-service');
  assert.equal(searchIntent('rooftop bar', 'restaurants').key, 'rooftop');
});

test('requires cuisine evidence and correctly labels related options', () => {
  const intent = searchIntent('Haitian food', 'restaurants');
  assert.equal(cuisineMatchType(restaurant('haitian'), intent, 'Haitian food'), 'direct');
  assert.equal(cuisineMatchType(restaurant('caribbean'), intent, 'Haitian food'), 'related');
  assert.equal(cuisineMatchType(restaurant('italian'), intent, 'Haitian food'), null);
  assert.equal(cuisineMatchType({ type: 'church', name: 'Haitian Church' }, intent, 'Haitian food'), null);
  assert.equal(cuisineMatchType(restaurant('haitian'), intent, 'griot near me'), 'related');
});

test('normalizes Overpass way coordinates and prevents OSM-ID collisions', () => {
  const place = overpassItem({ type: 'way', id: 42, center: { lat: 26.15, lon: -80.26 },
    tags: { amenity: 'restaurant', name: 'Haitian Kitchen', cuisine: 'haitian',
      'addr:street': 'Main Street', 'addr:city': 'Sunrise' } });
  assert.equal(place.name, 'Haitian Kitchen');
  assert.equal(place.lat, 26.15);
  assert.equal(place.address.city, 'Sunrise');
  assert.equal(resultKey(place), 'way:42');
  assert.notEqual(resultKey(place), resultKey({ ...place, osm_type: 'node' }));
});

test('API returns tagged Haitian restaurants even if Nominatim returns nothing', async () => {
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('overpass-api.de'))
      return { ok: true, json: async () => ({ elements: [
        { type: 'node', id: 1200, lat: 26.155, lon: -81.280,
          tags: { amenity: 'restaurant', name: 'Creole Test Kitchen', cuisine: 'haitian' } },
        { type: 'node', id: 1201, lat: 26.155, lon: -81.278,
          tags: { amenity: 'restaurant', name: 'Italian Test Kitchen', cuisine: 'italian' } }
      ] }) };
    return { ok: true, json: async () => [] };
  };
  try {
    const res = {
      statusCode: 200,
      setHeader() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', query: {
      q: 'Haitian food', lat: '26.155', lon: '-81.28',
      category: 'restaurants', scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.intentKey, 'cuisine-haitian');
    assert.equal(res.body.directCount, 1);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].loop_name, 'Creole Test Kitchen');
    assert.ok(calls.some(url => url.includes('overpass-api.de')));
  } finally {
    globalThis.fetch = savedFetch;
  }
});


test('tries a second OSM index when the primary Overpass endpoint is down', async () => {
  const savedFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).includes('overpass-api.de')) return { ok: false, status: 503 };
    if (String(url).includes('overpass.kumi.systems'))
      return { ok: true, json: async () => ({ elements: [
        { type: 'node', id: 300, lat: 26.155, lon: -81.28,
          tags: { amenity: 'restaurant', name: 'Haitian Café', cuisine: 'haitian' } }
      ] }) };
    return { ok: true, json: async () => [] };
  };
  try {
    const res = { statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method: 'GET', query: {
      q: 'Haitian food', lat: '26.155', lon: '-81.28',
      category: 'restaurants', scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.directCount, 1);
    assert.ok(urls.some(url => url.includes('overpass.kumi.systems')));
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('uses optional Google Places discovery for cuisine listings missing OSM tags', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-only-placeholder';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('places.googleapis.com'))
      return { ok: true, json: async () => ({ places: [
        { id: 'place-1', displayName: { text: 'H & R Grill' },
          location: { latitude: 26.155, longitude: -81.28 },
          formattedAddress: '3535 N Pine Island Rd, Sunrise, FL',
          types: ['restaurant','food'],
          googleMapsUri: 'https://maps.google.com/?cid=test' },
        { id: 'place-2', displayName: { text: 'Not a restaurant' },
          location: { latitude: 26.155, longitude: -81.28 },
          types: ['church'] }
      ] }) };
    if (String(url).includes('overpass')) return { ok: true, json: async () => ({ elements: [] }) };
    return { ok: true, json: async () => [] };
  };
  try {
    const res = { statusCode: 200, headers: {}, setHeader(key,value) { this.headers[key]=value; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method: 'GET', query: {
      q: 'Haitian food', lat: '26.155', lon: '-81.28',
      category: 'restaurants', scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.relatedCount, 1);
    assert.equal(res.body.items[0].loop_name, 'H & R Grill');
    assert.match(res.body.items[0].loop_match_note, /Confirm cuisine/);
    assert.match(res.body.attribution, /Google/);
    assert.equal(res.body.supplementalPlacesConfigured, true);
    assert.ok(calls.some(call => call.url.includes('places.googleapis.com')));
    const request = calls.find(call => call.url.includes('places.googleapis.com'));
    assert.equal(request.options.headers['X-Goog-Api-Key'], 'test-only-placeholder');
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = savedKey;
  }
});

test('unavailable search providers cannot masquerade as zero matching restaurants', async () => {
  const savedFetch = globalThis.fetch;
  const savedGoogle = process.env.GOOGLE_PLACES_API_KEY;
  const savedMaps = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  globalThis.fetch = async () => { throw new Error('upstream unavailable'); };
  try {
    const res = { statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method: 'GET', query: {
      q: 'Haitian food', lat: '26.155', lon: '-81.28',
      category: 'restaurants', scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /temporarily unavailable/i);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedGoogle === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = savedGoogle;
    if (savedMaps === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = savedMaps;
  }
});

test('real Sunrise Haitian search returns multiple source-backed businesses even with all providers down', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('all external providers unavailable'); };
  try {
    const res = { statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method: 'GET', query: {
      q: 'Haitian food', lat: '26.155', lon: '-80.28', category: 'restaurants',
      scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.items.length >= 3, 'at least three independent local listings');
    assert.equal(res.body.localDirectoryCount, 4);
    assert.ok(res.body.items.some(item => item.loop_name === 'H & R Grill'));
    assert.ok(res.body.items.some(item => item.loop_name === 'Choublak Restaurant'));
    for (const place of res.body.items) {
      assert.equal(place.loop_geo_precision, 'city');
      assert.equal(place.loop_distance_miles, null, 'no false exact mileage');
      assert.match(place.loop_listing_source_url, /^https:\/\//);
      assert.match(place.loop_match_note, /Source-backed/);
      assert.match(place.loop_full_address, /Sunrise/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('source-backed listings are not shown outside their conservative search area', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok:true, json:async () => [] });
  try {
    const res = { statusCode:200, setHeader() {},
      status(code){this.statusCode=code;return this;},
      json(data){this.body=data;return this;} };
    await handler({ method:'GET', query: {
      q:'Haitian food',lat:'28.0',lon:'-82.0',category:'restaurants',
      scope:'local',baseRadius:'30'
    }, headers:{} },res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.localDirectoryCount,0);
    assert.equal(res.body.items.length,0);
  } finally { globalThis.fetch=originalFetch; }
});


test('search prefers the Overture / Loop database before external providers', async () => {
  const savedFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-key';
  const called = [];
  globalThis.fetch = async (url, options = {}) => {
    called.push(String(url));
    if (String(url).includes('/rpc/loop_search_index')) {
      const body = JSON.parse(options.body);
      assert.ok(body.in_terms.includes('italian'));
      assert.equal(body.in_radius_miles, 30);
      assert.equal(options.headers.Authorization, 'Bearer test-only-key');
      return { ok: true, json: async () => [{
        overture_id: 'overture-test-id',
        name: 'Trattoria Test',
        taxonomy_primary: 'italian_restaurant',
        basic_category: 'restaurant',
        taxonomy_hierarchy: ['dining', 'restaurant', 'italian_restaurant'],
        full_address: 'Test Street',
        locality: 'Sunrise', region: 'FL', country: 'US',
        latitude: 26.155, longitude: -80.28, source_release: 'test-release',
        confidence: 0.94
      }] };
    }
    if (String(url).includes('overpass'))
      return { ok: true, json: async () => ({ elements: [] }) };
    return { ok: true, json: async () => [] };
  };
  try {
    const res = { statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method: 'GET', query: {
      q: 'Italian food', lat: '26.155', lon: '-80.28',
      category: 'restaurants', scope: 'local', baseRadius: '30'
    }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.overtureIndexConfigured, true);
    assert.equal(res.body.overtureMatches, 1);
    assert.equal(res.body.items[0].loop_name, 'Trattoria Test');
    assert.equal(res.body.items[0].place_id, 'overture:overture-test-id');
    assert.equal(res.body.items[0].loop_match_type, 'direct');
    assert.ok(called[0].includes('/rpc/loop_search_index'));
  } finally {
    globalThis.fetch = savedFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});

test('a failing Overture index retains the existing live-provider fallback', async () => {
  const savedFetch = globalThis.fetch, oldUrl = process.env.SUPABASE_URL,
    oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-key';
  globalThis.fetch = async url => {
    if (String(url).includes('/rpc/loop_search_index'))
      return { ok: false, status: 503 };
    if (String(url).includes('overpass'))
      return { ok: true, json: async () => ({ elements: [
        { type: 'node', id: 1002, lat: 26.155, lon: -81.28,
          tags: { amenity: 'restaurant', name: 'Fallback Italian', cuisine: 'italian' } }
      ] }) };
    return { ok: true, json: async () => [] };
  };
  try {
    const res = { statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ method:'GET', query: {
      q:'Italian food',lat:'26.155',lon:'-81.28',
      category:'restaurants',scope:'local',baseRadius:'30'
    },headers:{} },res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.items.some(p => p.loop_name === 'Fallback Italian'));
  } finally {
    globalThis.fetch = savedFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});


test('maps September 2026 Overture taxonomy and aliases to actual categories', () => {
  assert.ok(overtureTerms(searchIntent('brake service','auto'),'brake service')
    .includes('automotive_repair'));
  assert.ok(overtureTerms(searchIntent('shopping','retail'),'shopping')
    .includes('fashion_and_apparel_store'));
  const auto = overtureItem({
    overture_id:'test-auto',name:'Independent Repair',
    basic_category:'automotive_service',taxonomy_primary:'automotive_repair',
    taxonomy_hierarchy:['services_and_business','automotive_service','automotive_repair'],
    latitude:26.15,longitude:-80.28,source_release:'2026-09-23.1'
  });
  assert.equal(auto.type,'car_repair');
  const eatery = overtureItem({
    overture_id:'test-eatery',name:'Test Haitian Eatery',
    basic_category:'casual_eatery',taxonomy_primary:'casual_eatery',
    taxonomy_hierarchy:['food_and_drink','restaurant','casual_eatery'],
    latitude:26.15,longitude:-80.28,source_release:'2026-09-23.1'
  });
  assert.equal(eatery.type,'restaurant');
  assert.equal(cuisineMatchType(eatery,searchIntent('Haitian food','restaurants'),'Haitian food'),'direct');
  const nonFood = overtureItem({
    overture_id:'test-charity',name:'Haitian Community Support',
    basic_category:'charity_organization',taxonomy_primary:'charity_organization',
    taxonomy_hierarchy:['community_and_government','charity_organization'],
    latitude:26.15,longitude:-80.28,source_release:'2026-09-23.1'
  });
  assert.equal(cuisineMatchType(nonFood,searchIntent('Haitian food','restaurants'),'Haitian food'),null);
});

test('understands everyday food choices as restaurant intents',()=>{
  assert.equal(searchIntent('new fast food place','restaurants').key,'fast-food');
  assert.equal(searchIntent('burgers','restaurants').key,'burgers');
  assert.equal(searchIntent('steakhouse','restaurants').key,'steak');
  assert.equal(searchIntent('desserts','restaurants').key,'desserts');
  assert.ok(overtureTerms(searchIntent('new fast food place','restaurants'),'new fast food place').includes('casual_eatery'));
});
