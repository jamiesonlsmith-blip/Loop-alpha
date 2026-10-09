/* Loop Guide v1: small, auditable, on-device preference matcher.
   No model API, covert user profiling, invented ratings, or autonomous code edits. */
(function (root) {
  'use strict';
  const OPTIONS = {
    restaurants: [
      ['pizza','Pizza','pizza|pizzeria'], ['burgers','Burgers','burger|hamburger'],
      ['fast-food','Quick bites','fast.food|quick.service|casual.eatery|takeaway'],
      ['steak','Steak','steak|steakhouse'], ['seafood','Seafood','seafood|fish|oyster'],
      ['desserts','Desserts','dessert|bakery|ice.cream|pastry'],
      ['haitian','Haitian cuisine','haitian|kreyol'],['sushi','Sushi','sushi|japanese'],
      ['vegetarian','Vegetarian','vegetarian|vegan'],
      ['outdoors','Outdoor seating','patio|outdoor|terrace|garden'],
      ['quiet','Quiet atmosphere','quiet|relax|intimate'],['upscale','Upscale dining','fine.dining|upscale|luxury|fine restaurant'],
      ['casual','Casual dining','casual|diner|bistro'],
      ['live-music','Live music','live.music|jazz|music bar'],
      ['family-friendly','Family friendly','family|kid.friendly|children']
    ],
    'fun-games':[
      ['bowling','Bowling','bowling'],['arcades','Arcades','arcade|game.center'],
      ['pool','Pool / billiards','billiard|pool.hall'],['go-karts','Go-karts','karting|go.kart'],
      ['escape-rooms','Escape rooms','escape.room'],['mini-golf','Mini golf','mini.golf|miniature.golf'],
      ['laid-back','Laid-back','lounge|casual|quiet'],['action','Action-packed','laser.tag|paintball|trampoline|adventure']
    ],
    parks:[
      ['walking','Walking trails','trail|walking|path'],['picnics','Picnics','picnic'],
      ['playgrounds','Playgrounds','playground'],['dog-parks','Dog friendly','dog.park|dog.friendly'],
      ['scenic','Scenic','scenic|lake|river|nature']
    ],
    auto:[
      ['maintenance','Maintenance','maintenance|automotive.repair|car.repair|mechanic'],
      ['brakes','Brakes','brake'],['tires','Tires','tire|tyre'],
      ['body','Body / collision','body.shop|collision|auto.body']
    ],
    retail:[
      ['fashion','Clothing','clothing|fashion|apparel'],['sneakers','Sneakers','sneaker|shoe'],
      ['jewelry','Jewelry','jewel'],['furniture','Furniture','furniture'],
      ['budget','Budget shopping','discount|outlet|budget'],['luxury','Luxury shopping','luxury|designer|boutique']
    ],
    travel:[
      ['hotels','Hotels','hotel|resort'],['rental-cars','Rental cars','car.rental|rental.car'],
      ['airports','Airports','airport'],['budget','Budget travel','budget|low.cost'],
      ['family','Family travel','family|kid.friendly'],['comfort','Comfort','comfort|premium|luxury']
    ],
    'home-services':[
      ['plumbing','Plumbing','plumb'],['electrical','Electrical','electric'],
      ['ac','AC / HVAC','hvac|air.conditioning'],['cleaning','Cleaning','cleaning'],
      ['handyman','Handyman','handyman']
    ],
    movies:[['action','Action','action'],['comedy','Comedy','comedy'],['crime','Crime','crime'],['scifi','Sci-fi','sci.fi'],['horror','Horror','horror']],
    music:[['rnb','R&B','r&b|rnb'],['hiphop','Hip-hop','hip.hop|rap'],['jazz','Jazz','jazz'],['rock','Rock','rock'],['dance','Dance','dance|techno']]
  };
  const CHAINS = /\b(?:mcdonald'?s|wendy'?s|burger king|taco bell|kfc|subway|domino'?s|pizza hut|starbucks|dunkin'?|chick.fil.a|chipotle)\b/i;
  const asText = x => String(x == null ? '' : x).toLowerCase().replace(/[_-]/g, ' ').trim();
  function normalize(raw) {
    const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const cats = {};
    for (const [cat, options] of Object.entries(OPTIONS)) {
      const selected = Array.isArray(p.categories?.[cat]) ? p.categories[cat] : [];
      const allowed = new Set(options.map(x => x[0]));
      cats[cat] = [...new Set(selected.filter(x => typeof x === 'string' && allowed.has(x)))].slice(0, 16);
    }
    return {version:1,categories:cats,preferLocal: p.preferLocal === true, learnFromActivity:p.learnFromActivity === true};
  }
  function categoryFor(current, query='') {
    if (current && current !== 'all') return current;
    const q=asText(query);
    if (/restaurant|food|pizza|burger|steak|dining|brunch|dessert|sushi|cafe/.test(q)) return 'restaurants';
    if (/bowling|arcade|mini golf|go.kart|billiard|games|fun/.test(q)) return 'fun-games';
    if (/park|trail|picnic/.test(q)) return 'parks';
    if (/mechanic|brake|tire|auto|car repair/.test(q)) return 'auto';
    if (/shopping|shoe|clothing|jewelry/.test(q)) return 'retail';
    if (/hotel|rental car|airport/.test(q)) return 'travel';
    return '';
  }
  function evidenceText(place) {
    const extratags=place?.extratags && typeof place.extratags==='object' ? Object.values(place.extratags) : [];
    return asText([place?.loop_name,place?.name,place?.type,place?.loop_category_label,...extratags].filter(Boolean).join(' '));
  }
  function scorePlace(place,prefs,cat,query='',activity={}) {
    const text=evidenceText(place), name=asText(place?.loop_name || place?.name), q=asText(query);
    const matches=[];
    const options=OPTIONS[cat]||[];
    for (const opt of options) {
      if (!prefs.categories[cat]?.includes(opt[0]))continue;
      const matcher=new RegExp(opt[2].replace(/\./g,'[\\s_-]?'),'i');
      if (matcher.test(text)) matches.push(opt[1]);
    }
    const explicitWords=q.replace(/\b(best|good|new|nearby|near|place|restaurant|restaurants|food|find|for|me|to|a|the)\b/g,' ').split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>3);
    const queryHits=explicitWords.reduce((n,word)=>n+(text.includes(word)?1:0),0);
    const hasEvidence=matches.length>0;
    let extra=Math.min(7,matches.length*3)+Math.min(12,queryHits*4);
    if(prefs.preferLocal && CHAINS.test(name)) extra-=8;
    // A click is a weak signal. Explicit interests and search meaning always outweigh it.
    const id=String(place?.place_id||'').slice(0,160);
    const clicks=Number(activity?.[id])||0;
    if(prefs.learnFromActivity && clicks>0) extra+=Math.min(2,clicks);
    const direct=place?.loop_match_type==='related'?0:1;
    const reason=hasEvidence ? 'Matches your '+matches.slice(0,2).join(' + ')+' interest in the listed place information; details should be verified.' :
      (prefs.preferLocal && !CHAINS.test(name) ? 'Not one of the common chains Loop screens for; independent ownership is not verified.' : '');
    return {place,extra,direct,reason};
  }
  function rankPlaces(items, rawPreferences, category, query='',activity={}) {
    if (!Array.isArray(items))return [];
    const prefs=normalize(rawPreferences),cat=categoryFor(category,query);
    const isGeneric = /^(?:restaurants?|food|places to eat|eat|nearby|something nearby|fun|games|shopping|stores|retail)$/i.test(query.trim());
    // Explicit exclusions belong to the search, not a guessed personality.
    const exclusions=[];
    const requested=asText(query);
    for(const [name,pattern] of [
      ['mcdonalds',/mcdonald'?s?/],['wendys',/wendy'?s?/],['burger king',/burger king/],
      ['taco bell',/taco bell/],['kfc',/\bkfc\b/],['starbucks',/starbucks/]
    ]){
      const found=requested.match(pattern);
      if(!found)continue;
      const before=requested.slice(Math.max(0,found.index-26),found.index);
      if(/(?:\bnot\s+(?:a\s+|the\s+|like\s+)?|\bavoid\s+|\bexcept\s+|\bother than\s+)$/.test(before))
        exclusions.push(name);
    }
    const scored=items.filter(item=>{
      const name=asText(item?.loop_name||item?.name).replace(/[^a-z0-9]+/g,'');
      return !exclusions.some(excluded=>name.includes(excluded.replace(/[^a-z0-9]+/g,'')));
    }).map((place,index)=>({ ...scorePlace(place,prefs,cat,query,activity),index }));
    // Direct matches always outrank related suggestions; do not override explicit intent.
    scored.sort((a,b)=>b.direct-a.direct || b.extra-a.extra || a.index-b.index);
    return scored.map(({place,reason,extra})=>({
      ...place,
      loop_guide_reason: reason,
      loop_guide_matched: Boolean(reason && extra>0),
      loop_guide_personalized: Boolean(prefs.categories[cat]?.length || prefs.preferLocal),
      loop_guide_source:'profile-preferences'
    }));
  }
  const guide={OPTIONS,normalize,categoryFor,rankPlaces};
  root.LoopGuide=guide;
  if(typeof module!=='undefined' && module.exports)module.exports=guide;
})(typeof window!=='undefined'?window:globalThis);
