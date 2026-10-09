import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('place and search Back buttons return to the previous page, not Home',()=>{
  assert.match(html, /id="categoryPage"[\s\S]*?onclick="goBackInLoop\(\)">← Back/);
  assert.match(html, /id="placePage"[\s\S]*?onclick="goBackInLoop\(\)">← Back/);
  assert.doesNotMatch(html, /onclick="showHome\(\)">← Back/);
  assert.match(html, /window\.addEventListener\('popstate'/);
});

test('navigating search → place → Back → Back preserves original query and results',()=>{
  const names=['categoryPage','placePage','communityPage','profile','activityPage','messengerPage',
    'savedPage','settingsPage','trustPage','aboutPage','privacyPage','termsPage',
    'howLoopWorksPage','communityGuidelinesPage','contactSupportPage'];
  function node(){
    const classes=new Set();
    return {classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)}};
  }
  const ctx={home:{style:{display:'block'}},q:{value:'Haitian food'},
    results:{innerHTML:'<article>Saved Haitian Restaurant</article>'},
    currentCategory:'restaurants',currentPlace:'harbor',setLoopWallpaper(){},
    setActiveNav(){},closeMenu(){},requestAnimationFrame:fn=>fn(),
    loopDiscoveryMap:{invalidateSize(){this.calls=(this.calls||0)+1;}}};
  for(const name of names)ctx[name]=node();
  const listeners={};
  let historyBackCalls=0;
  ctx.window={
    scrollY:300,scrollTo(x,y){this.scrollY=y},
    location:{href:'https://loop.test/'},
    addEventListener(event,fn){listeners[event]=fn},
    history:{state:{},
      pushState(state){this.state=state},
      back(){historyBackCalls++;listeners.popstate?.({state:this.state})}
    }
  };
  const from=html.indexOf('const loopNavigationStack = []');
  const to=html.indexOf('    function returnToMenu()',from);
  assert.ok(from>=0&&to>from,'navigation implementation should be present');
  const source=html.slice(from,to)+'\nglobalThis.navigation={hidePrimaryViews,goBackInLoop,loopNavigationStack,loopActiveView};';
  vm.runInNewContext(source,ctx,{timeout:1000});
  const nav=ctx.navigation;
  nav.hidePrimaryViews(); // Home -> Restaurants
  ctx.categoryPage.classList.add('active');
  assert.equal(nav.loopActiveView(),'category');
  nav.hidePrimaryViews(); // Restaurants -> Haitian restaurant detail
  ctx.placePage.classList.add('active');
  assert.equal(nav.loopNavigationStack.length,2);
  nav.goBackInLoop(); // Restaurant -> prior results
  assert.equal(nav.loopActiveView(),'category');
  assert.equal(ctx.q.value,'Haitian food');
  assert.equal(ctx.results.innerHTML,'<article>Saved Haitian Restaurant</article>');
  assert.equal(ctx.window.scrollY,300);
  assert.equal(ctx.loopDiscoveryMap.calls,1);
  nav.goBackInLoop(); // Results -> Home
  assert.equal(nav.loopActiveView(),'home');
  assert.equal(nav.loopNavigationStack.length,0);
  assert.equal(historyBackCalls,2);
});

test('place listing search explains when Loop interprets a broad phrase',()=>{
  assert.match(html, /data\.interpretedAs\|\|''/);
  assert.match(html, /Loop understood:/);
  assert.match(html, /searchQualifiers/);
});
