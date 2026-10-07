(() => {
  const PROFILE_KEY = 'loopUserProfileV1';
  const LOOP_CACHE_KEY = 'loopArcadeCurrentLoopV1';
  const LOOP_CACHE_MS = 15 * 60 * 1000;
  let authClient = null;
  let session = null;
  let currentLoop = null;
  let initPromise = null;

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  }

  function slug(value) {
    return String(value || '')
      .trim().toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  function profileFallbackLoop() {
    const profile = readJson(PROFILE_KEY) || {};
    const label = String(profile.location || '').trim();
    if (!label) return { key: 'global', label: 'Global Loop', source: 'fallback' };
    return { key: 'profile/' + slug(label), label, source: 'profile' };
  }

  async function initializeAuth() {
    try {
      const response = await fetch('/api/auth-config', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.configured) return;
      const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      authClient = module.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      const result = await authClient.auth.getSession();
      session = result && result.data ? result.data.session : null;
      authClient.auth.onAuthStateChange((_event, nextSession) => { session = nextSession || null; });
    } catch (_) {
      authClient = null;
      session = null;
    }
  }

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('geolocation unavailable'));
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 }
      );
    });
  }

  async function resolveCurrentLoop(force = false) {
    const cached = readJson(LOOP_CACHE_KEY);
    if (!force && cached && cached.key && cached.label && Date.now() - Number(cached.savedAt || 0) < LOOP_CACHE_MS) {
      currentLoop = cached;
      return currentLoop;
    }

    try {
      const position = await locate();
      const params = new URLSearchParams({
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude)
      });
      const response = await fetch('/api/arcade-loop?' + params.toString(), { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (response.ok && data.loop && data.loop.key) {
        currentLoop = { ...data.loop, source: 'device', savedAt: Date.now() };
        localStorage.setItem(LOOP_CACHE_KEY, JSON.stringify(currentLoop));
        return currentLoop;
      }
    } catch (_) {}

    currentLoop = { ...profileFallbackLoop(), savedAt: Date.now() };
    localStorage.setItem(LOOP_CACHE_KEY, JSON.stringify(currentLoop));
    return currentLoop;
  }

  async function initialize() {
    if (!initPromise) {
      initPromise = Promise.all([initializeAuth(), resolveCurrentLoop()]).then(() => ({
        signedIn: Boolean(session && session.access_token),
        loop: currentLoop,
        profile: readJson(PROFILE_KEY) || {}
      }));
    }
    await initPromise;
    return {
      signedIn: Boolean(session && session.access_token),
      loop: currentLoop,
      profile: readJson(PROFILE_KEY) || {}
    };
  }

  async function submitScore(game, score) {
    await initialize();
    if (!session || !session.access_token) return { ok: false, reason: 'guest' };
    if (!currentLoop || !currentLoop.key) await resolveCurrentLoop();

    try {
      const response = await fetch('/api/arcade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          game,
          score: Math.max(0, Math.floor(Number(score) || 0)),
          loopKey: currentLoop.key,
          loopLabel: currentLoop.label
        })
      });
      const data = await response.json();
      if (!response.ok) return { ok: false, reason: 'server', error: data.error || 'Score could not be posted.' };
      return data;
    } catch (_) {
      return { ok: false, reason: 'offline' };
    }
  }

  async function leaderboard(game, scope = 'loop') {
    await initialize();
    const params = new URLSearchParams({ game, scope });
    if (scope !== 'global') params.set('loopKey', currentLoop && currentLoop.key ? currentLoop.key : 'global');
    try {
      const response = await fetch('/api/arcade?' + params.toString(), { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'leaderboard');
      return Array.isArray(data.items) ? data.items : [];
    } catch (_) {
      return [];
    }
  }

  function localBest(game) {
    const key = game === 'snake' ? 'loopSnakeBest' : 'loopSpaceImpactBest';
    return Math.max(0, Number(localStorage.getItem(key) || 0));
  }

  window.LoopArcade = {
    init: initialize,
    refreshLoop: () => resolveCurrentLoop(true),
    submitScore,
    leaderboard,
    localBest,
    state: () => ({
      signedIn: Boolean(session && session.access_token),
      loop: currentLoop,
      profile: readJson(PROFILE_KEY) || {}
    })
  };
})();
