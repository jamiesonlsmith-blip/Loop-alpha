import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Import as ESM without changing the application's deployment/module settings.
const source = await readFile(new URL('../api/places.js', import.meta.url), 'utf8');
const { default: handler, searchIntent, cuisineMatchType, overpassItem, resultKey } =
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
        { type: 'node', id: 1200, lat: 26.155, lon: -80.280,
          tags: { amenity: 'restaurant', name: 'Creole Test Kitchen', cuisine: 'haitian' } },
        { type: 'node', id: 1201, lat: 26.155, lon: -80.278,
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
      q: 'Haitian food', lat: '26.155', lon: '-80.28',
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
