const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

const SEARCH_SCOPES = {
  local: { extraMiles: 0, label: 'current Loop', next: 'expanded' },
  expanded: { extraMiles: 10, label: 'expanded Loop', next: 'broad' },
  broad: { extraMiles: 20, label: 'wider Loop', next: 'extended' },
  extended: { extraMiles: 30, label: 'extended Loop', next: 'range70' },
  range70: { extraMiles: 40, label: 'extended Loop', next: 'range80' },
  range80: { extraMiles: 50, label: 'extended Loop', next: 'range90' },
  range90: { extraMiles: 60, label: 'extended Loop', next: 'range100' },
  range100: { extraMiles: 70, label: 'extended Loop', next: null }
};
const DEFAULT_BASE_RADIUS_MILES = 30;
const MAX_BASE_RADIUS_MILES = 100;

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

const SEARCH_VOCABULARY = [
  {
    key: 'brake-service',
    match: /\bbrake(?:s| service| repair)?\b|\bbraking\b/i,
    exact: q => [q, 'brake service', 'brake repair'],
    related: ['auto repair', 'car repair', 'mechanic', 'garage', 'body shop'],
    relatedPattern: /\b(auto|car|vehicle|mechanic|garage|repair|body|collision)\b/i,
    relatedTypes: ['car_repair', 'car', 'garage'],
    relatedNote: 'Related auto-service option · Brake service is not confirmed'
  },
  {
    key: 'body-shop',
    match: /\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/i,
    exact: q => [q, 'auto body shop', 'collision repair', 'panel beater'],
    related: ['auto repair', 'car repair', 'mechanic'],
    relatedPattern: /\b(auto|car|vehicle|mechanic|garage|repair|body|collision|panel)\b/i,
    relatedTypes: ['car_repair', 'car', 'garage'],
    relatedNote: 'Related auto-service option · Body repair is not confirmed'
  },
  {
    key: 'oil-change',
    match: /\boil change\b|\blube\b|\blubrication\b/i,
    exact: q => [q, 'oil change', 'lube service'],
    related: ['auto repair', 'car repair', 'mechanic', 'service station'],
    relatedPattern: /\b(auto|car|vehicle|mechanic|garage|repair|service station)\b/i,
    relatedTypes: ['car_repair', 'car', 'fuel', 'garage'],
    relatedNote: 'Related auto-service option · Oil-change service is not confirmed'
  },
  {
    key: 'tire-service',
    match: /\btire\b|\btyre\b|flat tire|flat tyre|wheel repair/i,
    exact: q => [q, 'tire shop', 'tyre shop', 'tire repair', 'tyre repair'],
    related: ['auto repair', 'car repair', 'mechanic'],
    relatedPattern: /\b(auto|car|vehicle|mechanic|garage|repair|tire|tyre|wheel)\b/i,
    relatedTypes: ['car_repair', 'car', 'tyres', 'garage'],
    relatedNote: 'Related auto-service option · Tire service is not confirmed'
  },
  {
    key: 'mechanic',
    match: /\bmechanic\b|\bauto repair\b|\bcar repair\b|\brepair shop\b/i,
    exact: q => [q, 'auto repair', 'car repair', 'mechanic', 'garage'],
    related: ['body shop', 'service station'],
    relatedPattern: /\b(auto|car|vehicle|mechanic|garage|repair|body|service station)\b/i,
    relatedTypes: ['car_repair', 'car', 'fuel', 'garage'],
    relatedNote: 'Related vehicle-service option'
  },
  {
    key: 'urgent-care',
    match: /\burgent care\b/i,
    exact: q => [q, 'urgent care', 'walk-in clinic'],
    related: ['clinic', 'medical centre', 'medical center'],
    relatedPattern: /\b(clinic|medical|health|doctor|hospital)\b/i,
    relatedTypes: ['clinic', 'hospital', 'doctors'],
    relatedNote: 'Related medical option · Walk-in availability is not confirmed'
  },
  {
    key: 'dentist',
    match: /\bdentist\b|\bdental\b/i,
    exact: q => [q, 'dentist', 'dental clinic'],
    related: ['clinic'],
    relatedPattern: /\b(dentist|dental|clinic|medical|health)\b/i,
    relatedTypes: ['dentist', 'clinic'],
    relatedNote: 'Related care option · Dental services are not confirmed'
  },
  {
    key: 'electrician',
    match: /\belectrician\b|\belectrical repair\b/i,
    exact: q => [q, 'electrician', 'electrical contractor'],
    related: ['home repair', 'handyman'],
    relatedPattern: /\b(electric|electrical|contractor|home repair|handyman)\b/i,
    relatedTypes: ['electrician', 'handyman'],
    relatedNote: 'Related home-service option · Electrical service is not confirmed'
  },
  {
    key: 'plumber',
    match: /\bplumber\b|\bplumbing\b/i,
    exact: q => [q, 'plumber', 'plumbing service'],
    related: ['home repair', 'handyman'],
    relatedPattern: /\b(plumb|plumbing|home repair|handyman)\b/i,
    relatedTypes: ['plumber', 'handyman'],
    relatedNote: 'Related home-service option · Plumbing service is not confirmed'
  },
  {
    key: 'hvac',
    match: /\bhvac\b|\bac repair\b|air conditioning repair|air conditioner repair/i,
    exact: q => [q, 'hvac', 'air conditioning repair'],
    related: ['home repair', 'handyman'],
    relatedPattern: /\b(hvac|air condition|cooling|home repair|handyman)\b/i,
    relatedTypes: ['hvac', 'handyman'],
    relatedNote: 'Related home-service option · AC/HVAC service is not confirmed'
  }
];

// A phrase describes an intent, not necessarily words found in a venue's name.
// Keep cuisine aliases separate from geographic/category fallbacks so a Haitian
// request cannot silently turn into a generic unrelated restaurant result.
const CUISINE_VOCABULARY = [
  { key: 'haitian', aliases: /\b(haitian|haiti|kreyol|griot|pikliz)\b/i,
    cuisine: /\bhaitian\b/i, name: /\bhaitian\b|\bhaiti\b|\bkreyol\b/i,
    osmCuisine: 'haitian|creole|caribbean', osmName: 'haitian|haiti|kreyol|lakay|creole',
    relatedCuisine: /\b(creole|caribbean)\b/i, relatedName: /\blakay\b/i,
    relatedNote: 'Caribbean/Creole option · Haitian dishes not confirmed' },
  { key: 'jamaican', aliases: /\b(jamaican|jamaica|ackee)\b/i,
    cuisine: /\bjamaican\b/i, name: /\bjamaican\b|\bjamaica\b/i,
    osmCuisine: 'jamaican', osmName: 'jamaican|jamaica' },
  { key: 'italian', aliases: /\b(italian|pasta|trattoria)\b/i,
    cuisine: /\bitalian\b/i, name: /\bitalian\b|\btrattoria\b/i,
    osmCuisine: 'italian', osmName: 'italian|trattoria' },
  { key: 'mexican', aliases: /\b(mexican|taqueria|tacos?)\b/i,
    cuisine: /\bmexican\b/i, name: /\bmexican\b|\btaqueria\b/i,
    osmCuisine: 'mexican', osmName: 'mexican|taqueria' },
  { key: 'indian', aliases: /\b(indian|biryani|tandoori)\b/i,
    cuisine: /\bindian\b/i, name: /\bindian\b|\btandoori\b/i,
    osmCuisine: 'indian', osmName: 'indian|tandoori' },
  { key: 'ethiopian', aliases: /\b(ethiopian|injera)\b/i,
    cuisine: /\bethiopian\b/i, name: /\bethiopian\b/i,
    osmCuisine: 'ethiopian', osmName: 'ethiopian' },
  { key: 'thai', aliases: /\b(thai|pad thai)\b/i,
    cuisine: /\bthai\b/i, name: /\bthai\b/i,
    osmCuisine: 'thai', osmName: 'thai' },
  { key: 'vietnamese', aliases: /\b(vietnamese|pho|banh mi)\b/i,
    cuisine: /\bvietnamese\b/i, name: /\bvietnamese\b/i,
    osmCuisine: 'vietnamese', osmName: 'vietnamese' },
  { key: 'korean', aliases: /\b(korean|bibimbap)\b/i,
    cuisine: /\bkorean\b/i, name: /\bkorean\b/i,
    osmCuisine: 'korean', osmName: 'korean' },
  { key: 'chinese', aliases: /\b(chinese|dim sum)\b/i,
    cuisine: /\bchinese\b/i, name: /\bchinese\b/i,
    osmCuisine: 'chinese', osmName: 'chinese' },
  { key: 'caribbean', aliases: /\b(caribbean|west indian)\b/i,
    cuisine: /\bcaribbean\b/i, name: /\bcaribbean\b|\bwest indian\b/i,
    osmCuisine: 'caribbean', osmName: 'caribbean' }
];


// Source-checked, small initial directory: helps when public OSM lacks cuisine tags.
// A city centroid is NOT the physical coordinate of these businesses.
const LOCAL_LISTINGS = [
  { id:'hr-grill', name:'H & R Grill', number:'3535', street:'N Pine Island Rd', city:'Sunrise', state:'FL', postal:'33351', cuisine:'haitian', source:'https://hrbesthaitianrestaurant.com/' },
  { id:'choublak', name:'Choublak Restaurant', number:'2768', street:'N University Dr', city:'Sunrise', state:'FL', postal:'33322', cuisine:'haitian', source:'https://www.restaurantji.com/fl/sunrise/choublak-restaurant-/' },
  { id:'jj-gourmet', name:'J J Gourmet', number:'6937', street:'Sunset Strip', city:'Sunrise', state:'FL', postal:'33313', cuisine:'haitian', source:'https://find-open.com/sunrise/haitian-restaurants' },
  { id:'bistro-creole', name:'Bistro Creole', number:'6130', street:'W Oakland Park Blvd', city:'Sunrise', state:'FL', postal:'33313', cuisine:'haitian', source:'https://www.restaurantji.com/fl/sunrise/bistro-creole-/' }
];
const LOCAL_AREAS = {
  Sunrise: { lat:26.160, lon:-80.290, uncertaintyMiles:8 }
};
function sourceBackedLocalCandidates(intent, lat, lon, radiusMiles) {
  if (!intent.cuisine) return [];
  return LOCAL_LISTINGS.filter(entry => {
    const area = LOCAL_AREAS[entry.city];
    // A conservative radius test: include only if even the far edge of the city
    // area is within the requested search distance.
    return area && entry.cuisine === intent.cuisine.key &&
      milesBetween(lat, lon, area.lat, area.lon) + area.uncertaintyMiles <= radiusMiles;
  }).map(entry => {
    const area = LOCAL_AREAS[entry.city];
    return {
      place_id:'loop-source:' + entry.id, name:entry.name,
      type:'restaurant', category:'amenity',
      lat:area.lat, lon:area.lon,
      address:{house_number:entry.number,road:entry.street,city:entry.city,
        state:entry.state,postcode:entry.postal,country:'United States',country_code:'us'},
      display_name:[entry.name,entry.number+' '+entry.street,entry.city,entry.state,entry.postal].join(', '),
      extratags:{cuisine:entry.cuisine}, namedetails:{name:entry.name},
      loop_discovery_provider:'loop-curated',
      loop_geo_precision:'city', loop_uncertainty_miles:area.uncertaintyMiles,
      loop_listing_source_url:entry.source
    };
  });
}

function cuisineQueryNeedsDishVerification(query, cuisineKey) {
  return cuisineKey === 'haitian' && /\b(griot|pikliz)\b/i.test(query) ||
    cuisineKey === 'italian' && /\bpasta\b/i.test(query) ||
    cuisineKey === 'jamaican' && /\backee\b/i.test(query) ||
    cuisineKey === 'indian' && /\b(biryani|tandoori)\b/i.test(query) ||
    cuisineKey === 'ethiopian' && /\binjera\b/i.test(query) ||
    cuisineKey === 'vietnamese' && /\b(pho|banh mi)\b/i.test(query) ||
    cuisineKey === 'korean' && /\bbibimbap\b/i.test(query) ||
    cuisineKey === 'chinese' && /\bdim sum\b/i.test(query);
}

function cuisineMatchType(item, intent, query) {
  // Cuisine keywords in a non-food place's name are not restaurant matches.
  if (!['restaurant', 'fast_food', 'cafe', 'food_court'].includes(normalize(item.type))) return null;
  const cuisine = normalize(item.extratags?.cuisine || item.tags?.cuisine || item.cuisine);
  const name = normalize(item.name || item.namedetails?.name);
  const direct = intent.cuisine.cuisine.test(cuisine) || intent.cuisine.name.test(name);
  const related = intent.cuisine.relatedCuisine?.test(cuisine) ||
    intent.cuisine.relatedName?.test(name);
  // A cuisine tag does not prove that a specific dish is on the current menu.
  if (direct && cuisineQueryNeedsDishVerification(query, intent.cuisine.key)) return 'related';
  if (direct) return 'direct';
  return related ? 'related' : null;
}

function searchIntent(value = '', category = '') {
  const q = normalize(value);
  const cuisine = CUISINE_VOCABULARY.find(item => item.aliases.test(q));
  if (cuisine) return {
    key: 'cuisine-' + cuisine.key,
    cuisine,
    exactQueries: unique([q, cuisine.key + ' restaurant']),
    relatedQueries: [],
    allowRelated: false,
    relatedNote: cuisine.relatedNote || 'Cuisine-related restaurant · Specific menu items not verified'
  };
  const vocabulary = SEARCH_VOCABULARY.find(item => item.match.test(q));
  if (vocabulary) {
    return {
      key: vocabulary.key,
      exactQueries: unique(vocabulary.exact(q)),
      relatedQueries: unique(vocabulary.related || []),
      relatedPattern: vocabulary.relatedPattern || null,
      relatedTypes: vocabulary.relatedTypes || [],
      relatedNote: vocabulary.relatedNote || 'Related option',
      allowRelated: true
    };
  }

  // Translate natural lifestyle requests to an actual place category, then
  // treat modifiers such as music as preferences, not mandatory place names.
  // Avoid misreading "bar" inside words like "barber".
  if (/\b(?:drinks?|cocktails?|happy hour|bars?|lounges?|pubs?|nightlife)\b/.test(q) &&
      (category === 'restaurants' || category === 'all' || category === '' || category === 'fun-games')) {
    const musicRequested = /\b(?:music|dj|jazz|band|dancing|dance|live performance|live entertainment)\b/.test(q);
    return {
      key: 'nightlife',
      interpretedAs: 'Bars, lounges, pubs and nightlife',
      qualifiers: musicRequested ? ['Music or atmosphere requested · Confirm with venue'] : [],
      exactQueries: ['bar', 'lounge', 'cocktail bar', 'pub'],
      relatedQueries: ['restaurant bar', 'nightclub'],
      allowRelated: true,
      relatedTypes: ['bar', 'pub', 'lounge', 'nightclub', 'restaurant'],
      relatedPattern: /\b(?:bar|pub|lounge|nightclub|restaurant)\b/i,
      relatedNote: 'Related dining or nightlife option · Drinks and music are not confirmed'
    };
  }
  if (/\brooftop\b|\broof[ -]?top\b/.test(q)) {
    return { key: 'rooftop', exactQueries: unique([q, 'rooftop bar', 'rooftop lounge', 'rooftop restaurant']), relatedQueries: [], allowRelated: false };
  }
  if (/\bfast[ -]?food\b|\bquick[ -]?bites?\b|\bdrive[ -]?thru\b/.test(q)) return {
    key: 'fast-food', exactQueries: ['fast food', 'quick service restaurant', 'casual eatery'],
    relatedQueries: ['restaurant'], allowRelated: true, relatedTypes: ['restaurant','fast_food'],
    relatedPattern: /restaurant|fast.food|casual.eatery|burger|takeaway|diner/i,
    relatedNote: 'Restaurant nearby · Fast-food service not verified'
  };
  if (/\bburgers?\b|\bhamburgers?\b/.test(q)) return {
    key: 'burgers', exactQueries: ['burger restaurant', 'hamburger restaurant'],
    relatedQueries: ['fast food'], allowRelated: true, relatedTypes:['restaurant','fast_food'],
    relatedPattern: /burger|hamburger|restaurant|fast.food/i,
    relatedNote: 'Related restaurant · Burgers not verified'
  };
  if (/\bsteak(?:house|s)?\b/.test(q)) return {
    key: 'steak', exactQueries: ['steakhouse', 'steak restaurant'],
    relatedQueries: ['restaurant'], allowRelated: true, relatedTypes:['restaurant'],
    relatedPattern: /restaurant|steak|grill/i,
    relatedNote: 'Related restaurant · Steak menu not verified'
  };
  if (/\b(?:desserts?|ice cream|bakery|pastries)\b/.test(q)) return {
    key: 'desserts', exactQueries: ['dessert', 'bakery', 'ice cream'],
    relatedQueries: ['cafe'], allowRelated: true, relatedTypes:['restaurant','cafe'],
    relatedPattern: /dessert|bakery|ice.cream|pastry|cafe/i,
    relatedNote: 'Related cafe · Desserts not verified'
  };
  if (/\bbrunch\b/.test(q)) return { key: 'brunch', exactQueries: unique([q, 'brunch', 'brunch restaurant', 'breakfast restaurant']), relatedQueries: [], allowRelated: false };
  if (/\bsushi\b/.test(q)) return { key: 'sushi', exactQueries: unique([q, 'sushi restaurant', 'japanese restaurant']), relatedQueries: [], allowRelated: false };
  if (/\bvegan\b/.test(q)) return { key: 'vegan', exactQueries: unique([q, 'vegan restaurant']), relatedQueries: [], allowRelated: false };
  if (/\bcoffee\b|\bcafe\b/.test(q)) return { key: 'coffee', exactQueries: unique([q, 'coffee', 'cafe']), relatedQueries: [], allowRelated: false };
  if (/\bpizza\b/.test(q)) return { key: 'pizza', exactQueries: unique([q, 'pizza', 'pizzeria']), relatedQueries: [], allowRelated: false };

  if (/\bbowling\b/.test(q)) return { key: 'bowling', exactQueries: unique([q, 'bowling alley', 'bowling']), relatedQueries: [], allowRelated: false };
  if (/\barcade\b|video arcade|game arcade/.test(q)) return { key: 'arcade', exactQueries: unique([q, 'arcade', 'amusement arcade', 'family entertainment center']), relatedQueries: [], allowRelated: false };
  if (/mini golf|miniature golf|putt[ -]?putt/.test(q)) return { key: 'mini-golf', exactQueries: unique([q, 'miniature golf', 'mini golf']), relatedQueries: [], allowRelated: false };
  if (/go[ -]?karts?|go[ -]?cart|karting/.test(q)) return { key: 'karting', exactQueries: unique([q, 'go kart', 'karting']), relatedQueries: [], allowRelated: false };
  if (/roller skating|roller rink|skating rink/.test(q)) return { key: 'roller-skating', exactQueries: unique([q, 'roller skating', 'skating rink']), relatedQueries: [], allowRelated: false };
  if (/escape room/.test(q)) return { key: 'escape-room', exactQueries: unique([q, 'escape room']), relatedQueries: [], allowRelated: false };
  if (/laser tag/.test(q)) return { key: 'laser-tag', exactQueries: unique([q, 'laser tag']), relatedQueries: [], allowRelated: false };
  if (/trampoline/.test(q)) return { key: 'trampoline', exactQueries: unique([q, 'trampoline park']), relatedQueries: [], allowRelated: false };
  if (/action park|amusement park|theme park|family fun|fun center|entertainment center/.test(q)) {
    return { key: 'fun-center', exactQueries: unique([q, 'amusement park', 'family entertainment center', 'arcade']), relatedQueries: [], allowRelated: false };
  }

  if (category === 'fun-games' && /^(fun|games|fun and games|something fun|activities|things to do|nearby|something nearby)$/.test(q)) {
    return { key: 'fun-general', exactQueries: ['family entertainment center', 'arcade', 'bowling alley', 'amusement park'], relatedQueries: [], allowRelated: false };
  }
  if (/^(restaurant|restaurants|food|places to eat|eat)$/.test(q) || (category === 'restaurants' && /^(nearby|something nearby)$/.test(q))) {
    return { key: 'restaurant-general', exactQueries: ['restaurant'], relatedQueries: [], allowRelated: false };
  }
  if (/^(park|parks)$/.test(q)) return { key: 'parks', exactQueries: ['park'], relatedQueries: [], allowRelated: false };
  if (/^(shopping|stores|retail)$/.test(q)) return { key: 'retail', exactQueries: ['shopping'], relatedQueries: [], allowRelated: false };

  return { key: 'general', exactQueries: [q], relatedQueries: [], allowRelated: false };
}

function hardIntentGroups(value = '') {
  const q = normalize(value);
  const groups = [];

  if (/\brooftop\b|\broof[ -]?top\b/.test(q)) groups.push(/\brooftop\b|\broof[ -]?top\b|\broof deck\b|\broof terrace\b|\bsky bar\b|\bsky lounge\b/i);
  if (/\bsushi\b/.test(q)) groups.push(/\bsushi\b|\bjapanese\b/i);
  if (/\bmexican\b/.test(q)) groups.push(/\bmexican\b|\btaqueria\b|\btaco\b/i);
  if (/\bitalian\b/.test(q)) groups.push(/\bitalian\b|\btrattoria\b|\bpizzeria\b/i);
  if (/\bvegan\b/.test(q)) groups.push(/\bvegan\b/i);
  if (/\bbrunch\b/.test(q)) groups.push(/\bbrunch\b|\bbreakfast\b/i);
  if (/\bcoffee\b|\bcafe\b/.test(q)) groups.push(/\bcoffee\b|\bcafe\b|\bcafé\b/i);
  if (/\bpizza\b/.test(q)) groups.push(/\bpizza\b|\bpizzeria\b/i);
  if (/\bfast[ -]?food\b|\bquick[ -]?bite\b/.test(q)) groups.push(/fast.food|quick.service|casual.eatery|burger|takeaway/i);
  if (/\bburgers?\b|\bhamburgers?\b/.test(q)) groups.push(/burger|hamburger/i);
  if (/\bsteak(?:house|s)?\b/.test(q)) groups.push(/steak|grill/i);

  if (/\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/.test(q)) groups.push(/\bbody shop\b|\bauto body\b|\bcollision\b|\bpanel beat(?:er|ing)\b|\bcoachwork\b/i);
  if (/\bbrake(?:s| service| repair)?\b|\bbraking\b/.test(q)) groups.push(/\bbrake\b|\bbrakes\b|\bbraking\b/i);
  if (/\boil change\b|\blube\b|\blubrication\b/.test(q)) groups.push(/\boil change\b|\blube\b|\blubrication\b/i);
  if (/\btire\b|\btyre\b/.test(q)) groups.push(/\btire\b|\btyre\b|\btyres\b/i);
  if (/\bmechanic\b|\bauto repair\b|\bcar repair\b/.test(q)) groups.push(/\bmechanic\b|\bauto repair\b|\bcar repair\b|\bgarage\b/i);

  if (/\burgent care\b/.test(q)) groups.push(/\burgent care\b|\bclinic\b/i);
  if (/\bdentist\b|\bdental\b/.test(q)) groups.push(/\bdentist\b|\bdental\b/i);
  if (/\belectrician\b|\belectrical repair\b/.test(q)) groups.push(/\belectric\b|\belectrical\b/i);
  if (/\bplumber\b|\bplumbing\b/.test(q)) groups.push(/\bplumb\b|\bplumbing\b/i);
  if (/\bhvac\b|\bac repair\b|air conditioning repair|air conditioner repair/.test(q)) groups.push(/\bhvac\b|air condition|cooling/i);

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
  return [item.name, item.display_name, item.type, item.category, ...address, ...extras, ...names]
    .filter(Boolean).join(' ').toLowerCase();
}

function meaningfulTokens(value = '') {
  const stop = new Set([
    'the','a','an','and','or','for','with','near','nearby','best','good','great','find','show','me',
    'place','places','restaurant','restaurants','food','eat','to','my','in','of','that','is','are'
  ]);
  return normalize(value).split(/[^a-z0-9]+/).filter(token => token.length > 2 && !stop.has(token));
}

function relevanceScore(item, query, matchType = 'direct') {
  const text = itemSearchText(item);
  const q = normalize(query);
  let score = matchType === 'direct' ? 20 : -12;
  if (q && text.includes(q)) score += 20;
  for (const token of meaningfulTokens(q)) if (text.includes(token)) score += 4;
  const type = String(item.type || '').toLowerCase();
  if (['restaurant','bar','pub','cafe','nightclub','fast_food','clinic','hospital','park','car_repair'].includes(type)) score += 1;
  return score;
}

function passesIntent(item, query) {
  const groups = hardIntentGroups(query);
  if (!groups.length) return true;
  const text = itemSearchText(item);
  return groups.every(pattern => pattern.test(text));
}

function passesRelatedIntent(item, intent) {
  if (!intent || !intent.allowRelated) return false;
  const type = normalize(item.type);
  const category = normalize(item.category);
  if ((intent.relatedTypes || []).includes(type) || (intent.relatedTypes || []).includes(category)) return true;
  const text = itemSearchText(item);
  return intent.relatedPattern ? intent.relatedPattern.test(text) : false;
}

// Music is a soft preference; there must be actual venue-type evidence for
// the suggestion to count as a nightlife result. Do not return barber shops,
// unrelated churches, or generic restaurants as confirmed bars.
function nightlifeMatchType(item = {}) {
  const type = normalize(item.type);
  const tags = item.extratags || {};
  const taxonomy = normalize(tags.taxonomy || '');
  const basic = normalize(tags.basic_category || '');
  const directTypes = ['bar', 'pub', 'lounge', 'nightclub', 'nightlife_venue',
    'dance_club', 'music_venue'];
  if (directTypes.includes(type) || directTypes.includes(basic) ||
    /^(?:bar|lounge|pub|cocktail_bar|sports_bar|wine_bar|beer_bar|dive_bar|hookah_bar|gay_bar|tapas_bar|gastropub|dance_club|nightclub|nightlife_venue|music_venue)$/.test(taxonomy)) return 'direct';
  // Bars inside restaurants may be useful, but their drink service is not verified.
  if (['restaurant', 'cafe'].includes(type) &&
      /(?:bar_and_grill_restaurant|gastropub|restaurant_bar|live_music)/.test(taxonomy)) return 'related';
  return null;
}

function confirmedMusicTag(item = {}) {
  const tags = item.extratags || {};
  return ['yes','true','live','regular'].includes(normalize(tags.live_music)) ||
    ['yes','true','live','regular'].includes(normalize(tags['music:live'])) ||
    ['live','yes'].includes(normalize(tags.music));
}

function clampBaseRadius(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BASE_RADIUS_MILES;
  return Math.max(DEFAULT_BASE_RADIUS_MILES, Math.min(MAX_BASE_RADIUS_MILES, Math.round(parsed)));
}

function searchRadiusFor(scopeKey, baseRadius) {
  const scope = SEARCH_SCOPES[scopeKey] || SEARCH_SCOPES.local;
  return Math.min(MAX_BASE_RADIUS_MILES, clampBaseRadius(baseRadius) + scope.extraMiles);
}

function viewboxForRadius(lat, lon, radiusMiles) {
  const latDelta = radiusMiles / 69.0;
  const cosLat = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const lonDelta = Math.min(180, radiusMiles / (69.172 * cosLat));
  return [lon - lonDelta, lat + latDelta, lon + lonDelta, lat - latDelta].join(',');
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
  if (roadLine && locality) shortParts = dedupeParts([roadLine, locality, country], placeName);
  else if (locality) shortParts = dedupeParts([locality, region, country], placeName);
  else if (region) shortParts = dedupeParts([region, country], placeName);
  else {
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

function categoryPresentation(item = {}, query = '', category = '', matchType = 'direct') {
  const q = normalize(query);
  const type = normalize(item.type);
  const rawCategory = normalize(item.category);

  if (matchType === 'direct') {
    if (/\bbody shop\b|\bauto body\b|\bcollision(?: repair)?\b|\bpanel beat(?:er|ing)\b/.test(q)) return { label: 'Body Shop', icon: '🚗🔧' };
    if (/\bbrake(?:s| service| repair)?\b|\bbraking\b/.test(q)) return { label: 'Brake Service', icon: '🚗🔧' };
    if (/\boil change\b|\blube\b|\blubrication\b/.test(q)) return { label: 'Oil Change', icon: '🚗🔧' };
    if (/\btire\b|\btyre\b/.test(q)) return { label: 'Tire Shop', icon: '🚗🔧' };
    if (/\bmechanic\b|\bauto repair\b|\bcar repair\b/.test(q)) return { label: 'Auto Repair', icon: '🚗🔧' };
  }

  const typeMap = {
    restaurant: ['Restaurant', '🍽'], cafe: ['Café', '☕'], coffee_shop: ['Coffee', '☕'],
    fast_food: ['Quick Bites', '🍽'], bar: ['Bar & Lounge', '🍸'], pub: ['Pub', '🍸'],
    nightclub: ['Nightlife', '♫'], clinic: ['Clinic', '✚'], hospital: ['Hospital', '✚'],
    doctors: ['Medical', '✚'], dentist: ['Dentist', '✚'], pharmacy: ['Pharmacy', '✚'],
    park: ['Park', '🌿'], garden: ['Garden', '🌿'], car_repair: ['Auto Repair', '🚗🔧'],
    car_parts: ['Auto Parts', '🚗'], tyres: ['Tire Shop', '🚗🔧'], clothes: ['Fashion', '🛍'],
    shoes: ['Shoes', '🛍'], jewelry: ['Jewelry', '🛍'], furniture: ['Furniture', '🛍'],
    supermarket: ['Shopping', '🛍'], hotel: ['Hotel', '✈'], motel: ['Stay', '✈'],
    guest_house: ['Stay', '✈'], car_rental: ['Car Rental', '✈'], bowling_alley: ['Bowling', '🎯'],
    amusement_arcade: ['Arcade', '🎮'], amusement_park: ['Amusement Park', '🎯'],
    miniature_golf: ['Mini Golf', '🎯'], electrician: ['Electrician', '⌂'], plumber: ['Plumber', '⌂']
  };
  if (typeMap[type]) return { label: typeMap[type][0], icon: typeMap[type][1] };

  const categoryMap = {
    restaurants: ['Restaurant', '🍽'], medical: ['Medical', '✚'], parks: ['Parks & Outdoors', '🌿'],
    'home-services': ['Home Service', '⌂'], auto: ['Auto Service', '🚗🔧'], retail: ['Retail', '🛍'],
    travel: ['Travel', '✈'], 'fun-games': ['Fun & Games', '🎯']
  };
  if (categoryMap[category]) return { label: categoryMap[category][0], icon: categoryMap[category][1] };

  const fallback = humanizeSlug(type && type !== 'yes' ? type : rawCategory);
  return { label: fallback || 'Local Place', icon: '◎' };
}

function commonsFileUrl(fileName, width = 760) {
  const file = cleanText(fileName).replace(/^File:/i, '');
  if (!file) return '';
  return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(file) + '?width=' + width;
}

function commonsSourceUrl(fileName) {
  const file = cleanText(fileName).replace(/^File:/i, '').replace(/ /g, '_');
  return file ? 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(file) : '';
}

function allowedWikimediaUrl(value = '') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    return host === 'upload.wikimedia.org' || host === 'commons.wikimedia.org' ? url.toString() : '';
  } catch {
    return '';
  }
}

function directPhotoFor(item = {}) {
  const extras = item.extratags && typeof item.extratags === 'object' ? item.extratags : {};
  const image = cleanText(extras.image);
  const commons = cleanText(extras.wikimedia_commons);

  if (/^File:/i.test(image)) {
    return { url: commonsFileUrl(image), sourceUrl: commonsSourceUrl(image), galleryUrl: commonsSourceUrl(image), credit: 'Wikimedia Commons' };
  }
  const safeImage = allowedWikimediaUrl(image);
  if (safeImage) {
    return { url: safeImage, sourceUrl: safeImage, galleryUrl: safeImage, credit: 'Wikimedia Commons' };
  }
  if (/^File:/i.test(commons)) {
    return { url: commonsFileUrl(commons), sourceUrl: commonsSourceUrl(commons), galleryUrl: commonsSourceUrl(commons), credit: 'Wikimedia Commons' };
  }
  if (/^Category:/i.test(commons)) {
    const category = commons.replace(/^Category:/i, '').replace(/ /g, '_');
    return { url: '', sourceUrl: '', galleryUrl: 'https://commons.wikimedia.org/wiki/Category:' + encodeURIComponent(category), credit: 'Wikimedia Commons' };
  }
  return { url: '', sourceUrl: '', galleryUrl: '', credit: '' };
}

async function wikidataPhotos(items = []) {
  const ids = [...new Set(items.map(item => {
    const extras = item.extratags && typeof item.extratags === 'object' ? item.extratags : {};
    const id = cleanText(extras.wikidata).toUpperCase();
    return /^Q\d+$/.test(id) ? id : '';
  }).filter(Boolean))].slice(0, 50);

  if (!ids.length) return new Map();

  try {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims',
      format: 'json',
      origin: '*'
    });
    const response = await fetch(WIKIDATA_API + '?' + params.toString(), {
      headers: { 'Accept': 'application/json', 'User-Agent': 'LoopAlpha/0.6 (+https://loop-alpha-nu.vercel.app/)' }
    });
    if (!response.ok) return new Map();
    const data = await response.json();
    const map = new Map();

    for (const id of ids) {
      const claims = data && data.entities && data.entities[id] && data.entities[id].claims;
      const p18 = claims && Array.isArray(claims.P18) ? claims.P18[0] : null;
      const file = p18 && p18.mainsnak && p18.mainsnak.datavalue && cleanText(p18.mainsnak.datavalue.value);
      if (file) map.set(id, { url: commonsFileUrl(file), sourceUrl: commonsSourceUrl(file), galleryUrl: commonsSourceUrl(file), credit: 'Wikimedia Commons' });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function addPhotos(items = []) {
  const wikiMap = await wikidataPhotos(items);
  return items.map(item => {
    const direct = directPhotoFor(item);
    const extras = item.extratags && typeof item.extratags === 'object' ? item.extratags : {};
    const qid = cleanText(extras.wikidata).toUpperCase();
    const fromWiki = /^Q\d+$/.test(qid) ? wikiMap.get(qid) : null;
    const photo = direct.url ? direct : (fromWiki || direct);

    return {
      ...item,
      loop_photo_url: photo && photo.url ? photo.url : '',
      loop_photo_source_url: photo && photo.sourceUrl ? photo.sourceUrl : '',
      loop_photo_gallery_url: direct.galleryUrl || (photo && photo.galleryUrl) || '',
      loop_photo_credit: photo && photo.credit ? photo.credit : ''
    };
  });
}

// Nominatim geocodes names/addresses; it is not a general cuisine index.
// Overpass retrieves OSM restaurant objects using structured cuisine tags.
function overpassItem(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = cleanText(tags.name || tags['name:en'] || '');
  if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;
  const address = {
    house_number: tags['addr:housenumber'] || '',
    road: tags['addr:street'] || '',
    city: tags['addr:city'] || '',
    town: tags['addr:town'] || '',
    state: tags['addr:state'] || '',
    postcode: tags['addr:postcode'] || '',
    country: tags['addr:country'] || ''
  };
  const addressText = [address.house_number, address.road, address.city, address.state].filter(Boolean).join(' ');
  return {
    osm_type: element.type,
    osm_id: element.id,
    lat, lon,
    name,
    display_name: [name, addressText].filter(Boolean).join(', '),
    type: tags.amenity || 'restaurant',
    category: 'amenity',
    address,
    extratags: tags,
    namedetails: { name }
  };
}

async function searchCuisineOverpass(intent, lat, lon, radiusMiles) {
  if (!intent.cuisine) return [];
  const metres = Math.ceil(radiusMiles * 1609.344);
  const around = `(around:${metres},${lat},${lon})`;
  const cuisine = intent.cuisine;
  // Both regex patterns are fixed, allowlisted vocabulary values, never raw user input.
  const query = `[out:json][timeout:12];(nwr${around}["amenity"~"^(restaurant|fast_food|cafe)$"]["cuisine"~"${cuisine.osmCuisine}",i];nwr${around}["amenity"~"^(restaurant|fast_food|cafe)$"]["name"~"${cuisine.osmName}",i];);out center 80;`;
  // Fail over when a public Overpass mirror is busy or down. Do not silently
  // interpret an unavailable provider as proof that no matching business exists.
  let lastError;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(4800)
      });
      if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
      const json = await response.json();
      return Array.isArray(json.elements) ? json.elements.map(overpassItem).filter(Boolean) : [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Overpass is unavailable');
}


// A category-based fallback for nightlife. Nominatim is a geocoder, not a
// comprehensive bar directory; read tagged bar/pub/nightclub POIs instead.
// Fixed OSM tags only: no raw user phrase is interpolated into Overpass.
async function searchNightlifeOverpass(lat, lon, radiusMiles) {
  const metres = Math.ceil(radiusMiles * 1609.344);
  const around = `(around:${metres},${lat},${lon})`;
  const query = `[out:json][timeout:12];(nwr${around}["amenity"~"^(bar|pub|nightclub)$"];nwr${around}["amenity"="restaurant"]["bar"="yes"];);out center 80;`;
  let lastError;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(4800)
      });
      if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
      const json = await response.json();
      return (Array.isArray(json.elements) ? json.elements : []).map(overpassItem).filter(Boolean);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Nightlife place-data provider unavailable');
}

/*
 * An optional, more complete POI index for cuisine discovery. OSM/Nominatim
 * often omit restaurant cuisine tags; a free-text geocoder cannot compensate.
 * Configure GOOGLE_PLACES_API_KEY in Vercel to enable Places Text Search (New).
 * Never send the server-side key to clients or pretend a search hit verifies
 * a dish or the current menu.
 */
async function searchCuisineGooglePlaces(intent, lat, lon, radiusMiles) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !intent.cuisine) return { enabled: false, items: [] };
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.googleMapsUri'
    },
    body: JSON.stringify({
      textQuery: intent.cuisine.key + ' restaurants',
      pageSize: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lon },
        radius: Math.min(50000, Math.max(1000, radiusMiles * 1609.344)) } }
    }),
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error('Places search HTTP ' + response.status);
  const data = await response.json();
  const items = (Array.isArray(data.places) ? data.places : []).map(place => {
    const types = Array.isArray(place.types) ? place.types : [];
    const isFood = types.some(type => type === 'restaurant' ||
      type.endsWith('_restaurant') || type === 'cafe' || type === 'meal_takeaway');
    const name = cleanText(place.displayName?.text);
    const plat = Number(place.location?.latitude), plon = Number(place.location?.longitude);
    if (!isFood || !name || !place.id || !Number.isFinite(plat) || !Number.isFinite(plon)) return null;
    return {
      place_id: 'google:' + place.id,
      name,
      display_name: [name, cleanText(place.formattedAddress)].filter(Boolean).join(', '),
      type: 'restaurant', category: 'amenity',
      lat: plat, lon: plon, address: {},
      loop_discovery_provider: 'google-places',
      loop_google_maps_url: cleanText(place.googleMapsUri),
      namedetails: { name }
    };
  }).filter(Boolean);
  return { enabled: true, items };
}


// Overture is the first-party searchable index. Search only through Loop's
// own Supabase database; never expose service role credentials to the client.
function overtureTerms(intent, query) {
  if (intent.cuisine) return [intent.cuisine.key];
  const categoryTerms = {
    'restaurant-general': ['restaurant', 'casual_eatery', 'cafe', 'food_court'],
    nightlife: ['bar', 'lounge', 'pub', 'nightlife_venue', 'dance_club', 'cocktail_bar'],
    'fast-food': ['fast_food', 'casual_eatery', 'quick_service_restaurant', 'burger_restaurant'],
    burgers: ['burger_restaurant', 'hamburger', 'burger', 'casual_eatery'],
    steak: ['steakhouse', 'steak', 'grill_restaurant'],
    desserts: ['dessert', 'bakery', 'ice_cream_shop', 'pastry_shop'],
    'brake-service': ['automotive_repair', 'car_repair', 'auto_repair', 'brake'],
    'body-shop': ['auto_body', 'body_shop', 'collision_repair', 'automotive_repair'],
    'oil-change': ['oil_change', 'automotive_repair', 'car_repair'],
    'tire-service': ['tire_shop', 'tyre', 'automotive_repair'],
    mechanic: ['automotive_repair', 'car_repair', 'auto_repair', 'mechanic'],
    'urgent-care': ['urgent_care', 'walk_in_clinic'],
    dentist: ['dentist', 'dental'],
    electrician: ['electrician'],
    plumber: ['plumber'],
    hvac: ['hvac', 'air_conditioning'],
    rooftop: ['rooftop', 'sky_lounge'],
    brunch: ['brunch'],
    sushi: ['sushi', 'japanese_restaurant'],
    vegan: ['vegan'],
    coffee: ['coffee_shop', 'cafe'],
    pizza: ['pizza_restaurant', 'pizzeria'],
    bowling: ['bowling'],
    arcade: ['arcade'],
    'mini-golf': ['miniature_golf'],
    karting: ['go_kart', 'karting'],
    'roller-skating': ['roller_skating'],
    'escape-room': ['escape_room'],
    'laser-tag': ['laser_tag'],
    trampoline: ['trampoline'],
    'fun-center': ['amusement_park', 'entertainment_center'],
    'fun-general': ['arcade', 'bowling', 'amusement_park'],
    parks: ['park'],
    retail: ['fashion_and_apparel_store', 'clothing_store', 'shoe_store', 'jewelry_store', 'shop']
  };
  return (categoryTerms[intent.key] || meaningfulTokens(query).slice(0, 3))
    .map(value => normalize(value).replace(/[^a-z0-9_ -]/g, ''))
    .filter(value => value.length >= 2).slice(0, 6);
}

function overtureItem(row) {
  if (!row || !row.overture_id || !row.name) return null;
  const lat = Number(row.latitude), lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const category = normalize(row.taxonomy_primary || row.basic_category || '');
  const basic = normalize(row.basic_category || '');
  const hierarchy = Array.isArray(row.taxonomy_hierarchy)
    ? row.taxonomy_hierarchy.map(normalize) : [];
  const food = hierarchy.some(label => ['restaurant', 'casual_eatery', 'cafe', 'fast_food'].includes(label)) ||
    /(?:^|_)restaurant$/.test(category) ||
    ['restaurant', 'casual_eatery', 'cafe', 'coffee_shop', 'fast_food', 'food_court', 'diner'].includes(basic);
  const auto = [...hierarchy, basic, category].some(label =>
    /automotive_repair|vehicle_repair|car_repair|auto_repair|garage|body_shop|collision_repair/.test(label));
  const type = food ? 'restaurant' : auto ? 'car_repair' : category;
  const cuisine = food ? category.replace(/_/g, ' ') : '';
  return {
    place_id: 'overture:' + String(row.overture_id),
    name: cleanText(row.name), type, category: 'overture',
    lat, lon,
    display_name: [row.name, row.full_address, row.locality, row.region, row.country]
      .map(cleanText).filter(Boolean).join(', '),
    address: {
      road: cleanText(row.full_address),
      city: cleanText(row.locality), state: cleanText(row.region),
      country: cleanText(row.country), country_code: normalize(row.country)
    },
    extratags: { cuisine, taxonomy: category, basic_category: basic },
    namedetails: { name: cleanText(row.name) },
    loop_discovery_provider: 'overture',
    loop_source_release: cleanText(row.source_release),
    loop_listing_source_url: 'https://overturemaps.org/',
    loop_overture_confidence: row.confidence
  };
}

async function searchOvertureIndex(intent, query, lat, lon, radiusMiles) {
  const base = cleanText(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return { configured: false, items: [] };
  const terms = overtureTerms(intent, query);
  if (!terms.length) return { configured: true, items: [] };
  const response = await fetch(base + '/rest/v1/rpc/loop_search_index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: key,
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      in_lat: lat, in_lon: lon, in_radius_miles: radiusMiles,
      in_terms: terms, in_limit: 35
    }),
    signal: AbortSignal.timeout(4500)
  });
  if (!response.ok) throw new Error('Overture index HTTP ' + response.status);
  const data = await response.json();
  return {
    configured: true,
    items: Array.isArray(data) ? data.map(overtureItem).filter(Boolean) : []
  };
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
      'User-Agent': 'LoopAlpha/0.6 (+https://loop-alpha-nu.vercel.app/)',
      'Referer': 'https://loop-alpha-nu.vercel.app/'
    }
  });

  if (!response.ok) throw new Error('provider');
  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

function resultKey(item = {}) {
  if (item.osm_type && item.osm_id) return item.osm_type + ':' + item.osm_id;
  return String(item.place_id || item.display_name || [item.lat,item.lon,item.type].join('|'));
}

function enrichItem(item, query, category, lat, lon, matchType, matchNote = '') {
  const itemLat = Number(item.lat);
  const itemLon = Number(item.lon);
  const distanceMiles = milesBetween(lat, lon, itemLat, itemLon);
  const cityLevelLocation = item.loop_geo_precision === 'city';
  const loopName = placeNameFor(item);
  const loopAddress = internationalAddressFor(item, loopName);
  const loopCategory = categoryPresentation(item, query, category, matchType);

  return {
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
    loop_match_type: matchType,
    loop_match_note: matchNote,
    loop_distance_miles: cityLevelLocation ? null : Math.round(distanceMiles * 10) / 10,
    loop_relevance: relevanceScore(item, query, matchType)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const category = normalize(req.query.category);
  const query = normalize(req.query.q);
  const intent = searchIntent(query, category);
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const scopeKey = SEARCH_SCOPES[req.query.scope] ? req.query.scope : 'local';
  const scope = SEARCH_SCOPES[scopeKey];
  const baseRadiusMiles = clampBaseRadius(req.query.baseRadius);
  const radiusMiles = searchRadiusFor(scopeKey, baseRadiusMiles);
  const language = cleanText(req.headers['accept-language'] || 'en-US,en;q=0.9').slice(0, 100);

  if (!intent.exactQueries.length || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'A search term and valid location are required.' });
  }

  const viewbox = viewboxForRadius(lat, lon, radiusMiles);

  try {
    const merged = [];
    const seen = new Set();
    const matchedQueries = [];
    let directCount = 0;
    let relatedCount = 0;
    let providerSucceeded = false;
    let googlePlacesUsed = false;
    let overtureIndexUsed = false;
    let overtureResults = 0;
    const addMatchedItem = item => {
      const itemLat = Number(item.lat), itemLon = Number(item.lon);
      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return;
      const uncertainty = item.loop_geo_precision === 'city' ? Number(item.loop_uncertainty_miles) || 0 : 0;
      if (milesBetween(lat, lon, itemLat, itemLon) + uncertainty > radiusMiles) return;
      const isPlacesSuggestion = item.loop_discovery_provider === 'google-places';
      const matchType = intent.key === 'nightlife' ? nightlifeMatchType(item)
        : isPlacesSuggestion && intent.cuisine
        ? (cuisineMatchType(item, intent, query) || 'related')
        : intent.cuisine
          ? (passesIntent(item, query) ? cuisineMatchType(item, intent, query) : null)
          : (hardIntentGroups(query).length && !passesIntent(item, query)
              ? (intent.key !== 'general' && passesRelatedIntent(item, intent) ? 'related' : null)
              : 'direct');
      if (!matchType) return;
      const key = resultKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      const note = intent.key === 'nightlife'
        ? (matchType === 'related'
            ? 'Related restaurant option · Drinks/music not verified'
            : confirmedMusicTag(item)
              ? 'Bar/lounge listing · Live music tag present; verify schedule'
              : 'Bar/lounge listing · Music and atmosphere not verified')
        : item.loop_discovery_provider === 'overture'
        ? (matchType === 'direct' ? 'Category from Overture Maps · Confirm current details' : intent.relatedNote)
        : item.loop_discovery_provider === 'loop-curated'
        ? 'Source-backed local listing · Check current hours before visiting'
        : isPlacesSuggestion
          ? 'Places search suggestion · Confirm cuisine and current menu'
        : matchType === 'related' ? intent.relatedNote :
          (intent.cuisine ? 'Cuisine listed in place data · Verify current menu' : '');
      merged.push(enrichItem(item, query, category, lat, lon, matchType, note));
      if (matchType === 'direct') directCount++;
      else relatedCount++;
    };

    // Query Loop's own Overture-backed index first, before any live providers.
    try {
      const indexed = await searchOvertureIndex(intent, query, lat, lon, radiusMiles);
      if (indexed.configured) {
        overtureIndexUsed = true;
        providerSucceeded = true;
        matchedQueries.push('Overture Maps / Loop index');
        indexed.items.forEach(addMatchedItem);
        overtureResults = indexed.items.length;
      }
    } catch (error) {
      console.warn('Loop indexed place lookup unavailable:', error?.message || error);
    }

    // Source-backed local coverage protects known listings while the bulk
    // Overture import is staged. Never use city coordinates as a real pin.
    const localCandidates = merged.length >= 5 ? [] :
      sourceBackedLocalCandidates(intent, lat, lon, radiusMiles);
    localCandidates.forEach(addMatchedItem);
    if (localCandidates.length) {
      providerSucceeded = true;
      matchedQueries.push('Loop source-backed local directory');
    }
    const enoughLocalCoverage = merged.length >= 3;
    // For cuisine searches, structured OSM tags are more reliable than name-only
    // geocoding. If Overpass is unavailable, keep trying the Nominatim fallback.
    if (intent.cuisine && !enoughLocalCoverage) {
      try {
        const found = await searchCuisineOverpass(intent, lat, lon, radiusMiles);
        providerSucceeded = true;
        matchedQueries.push('OpenStreetMap cuisine: ' + intent.cuisine.key);
        found.forEach(addMatchedItem);
      } catch (error) {
        console.warn('Loop cuisine lookup unavailable:', error?.message || error);
      }
    }

    // Resolve nightlife to structured POIs when the Overture regional index is
    // sparse, without depending on a word-for-word match in business names.
    if (intent.key === 'nightlife' && merged.length < 8) {
      try {
        const found = await searchNightlifeOverpass(lat, lon, radiusMiles);
        providerSucceeded = true;
        matchedQueries.push('OpenStreetMap nightlife venues');
        found.forEach(addMatchedItem);
      } catch (error) {
        console.warn('Loop nightlife lookup unavailable:', error?.message || error);
      }
    }

    // Search for the actual cuisine category, not a long natural-language phrase.
    const namesToFind = intent.cuisine ? [intent.cuisine.key + ' restaurant'] : intent.exactQueries;
    for (const candidate of merged.length >= 15 ? [] : namesToFind) {
      try {
        const found = await searchNominatim(candidate, viewbox, language);
        providerSucceeded = true;
        matchedQueries.push(candidate);
        found.forEach(addMatchedItem);
      } catch (error) {
        console.warn('Loop name lookup unavailable:', error?.message || error);
      }
    }
    // If the OSM index is sparse, enrich from an independently maintained
    // restaurant index when the project has explicitly configured its API key.
    if (intent.cuisine && directCount < 6 && !enoughLocalCoverage) {
      try {
        const places = await searchCuisineGooglePlaces(intent, lat, lon, radiusMiles);
        if (places.enabled) {
          googlePlacesUsed = true;
          providerSucceeded = true;
          matchedQueries.push('Google Places: ' + intent.cuisine.key);
          places.items.forEach(addMatchedItem);
        }
      } catch (error) {
        console.warn('Loop supplemental places lookup unavailable:', error?.message || error);
      }
    }
    if (!providerSucceeded) throw new Error('No place-search providers are available');

    // If the literal/synonym search is sparse, widen semantically inside the same
    // requested category before widening geography. These are clearly marked as
    // related options so Loop stays useful without pretending a service is confirmed.
    if (intent.allowRelated && merged.length < 6) {
      for (const candidate of intent.relatedQueries) {
        let found;
        try { found = await searchNominatim(candidate, viewbox, language); }
        catch (error) { console.warn('Loop related lookup unavailable:', error?.message || error); continue; }
        matchedQueries.push(candidate);

        for (const item of found) {
          const itemLat = Number(item.lat);
          const itemLon = Number(item.lon);
          if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) continue;

          const distanceMiles = milesBetween(lat, lon, itemLat, itemLon);
          if (distanceMiles > radiusMiles || !passesRelatedIntent(item, intent)) continue;

          const key = resultKey(item);
          if (seen.has(key)) continue;
          seen.add(key);

          merged.push(enrichItem(item, query, category, lat, lon, 'related', intent.relatedNote));
          relatedCount++;
          if (merged.length >= 15) break;
        }
        if (merged.length >= 15) break;
      }
    }

    merged.sort((a, b) => {
      if (a.loop_match_type !== b.loop_match_type) return a.loop_match_type === 'direct' ? -1 : 1;
      if (b.loop_relevance !== a.loop_relevance) return b.loop_relevance - a.loop_relevance;
      return a.loop_distance_miles - b.loop_distance_miles;
    });

    const withPhotos = await addPhotos(merged.slice(0, 15));
    const items = withPhotos.map(({ loop_relevance, ...item }) => item);

    // Do not cache empty coverage for an hour while a transient provider outage resolves.
    res.setHeader('Cache-Control', items.length
      ? 'public, s-maxage=120, stale-while-revalidate=180'
      : 'public, s-maxage=30, stale-while-revalidate=30');
    return res.status(200).json({
      query,
      matchedQueries,
      scope: scopeKey,
      scopeLabel: scope.label,
      baseRadiusMiles,
      radiusMiles,
      canExpand: Boolean(scope.next && radiusMiles < MAX_BASE_RADIUS_MILES),
      nextScope: radiusMiles < MAX_BASE_RADIUS_MILES ? scope.next : null,
      strictIntent: hardIntentGroups(query).length > 0,
      intentKey: intent.key,
      interpretedAs: intent.interpretedAs || '',
      searchQualifiers: intent.qualifiers || [],
      directCount,
      relatedCount,
      items,
      discoveryProviders: matchedQueries.filter(value => /^OpenStreetMap cuisine:|^Google Places:/.test(value)),
      supplementalPlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY),
      localDirectoryCount: localCandidates.length,
      overtureIndexConfigured: overtureIndexUsed,
      overtureMatches: overtureResults,
      coverage: 'OpenStreetMap listings may be incomplete. A missing result does not establish that no business exists.',
      attribution: (overtureResults ? 'Place data © Overture Maps Foundation and data providers. ' : '') +
        (matchedQueries.some(value => /OpenStreetMap cuisine:|OpenStreetMap nightlife|restaurant|food|repair|shop/i.test(value)) ?
          'OpenStreetMap data © OpenStreetMap contributors. ' : '') +
        (googlePlacesUsed ? 'Google Places results © Google. ' : '') +
        (localCandidates.length ? 'Additional public directory references checked by Loop. ' : '') +
        'Photos, when available, © Wikimedia Commons contributors.'
    });
  } catch (error) {
    console.error('Loop place search error:', error && error.message ? error.message : error);
    return res.status(502).json({ error: 'Place search is temporarily unavailable.' });
  }
}

// Small, side-effect-free exports for search-intent regression tests.
export { searchIntent, cuisineMatchType, nightlifeMatchType, overpassItem, overtureItem, overtureTerms, resultKey };
