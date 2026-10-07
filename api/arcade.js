function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validGame(value) {
  const game = clean(value, 40).toLowerCase();
  return game === 'snake' || game === 'space-impact' ? game : '';
}

function safeLoopKey(value) {
  return clean(value, 160).toLowerCase().replace(/[^a-z0-9\/_-]+/g, '-').replace(/-+/g, '-');
}

function publicName(value) {
  const parts = clean(value, 120).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Loop Player';
  if (parts.length === 1) return parts[0].slice(0, 28);
  return (parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.').slice(0, 32);
}

function supabaseBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function supabaseKey() {
  return process.env.SUPABASE_SECRET_KEY || '';
}

async function serviceRequest(path, options = {}) {
  const base = supabaseBase();
  const key = supabaseKey();
  if (!base || !key) throw new Error('Arcade storage is not configured.');

  const response = await fetch(base + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Arcade storage failed: ' + response.status + ' ' + detail.slice(0, 180));
  }
  return response;
}

async function verifyUser(token) {
  const base = supabaseBase();
  const key = supabaseKey();
  if (!base || !key || !token) return null;

  const response = await fetch(base + '/auth/v1/user', {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + token
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && user.id ? user : null;
}

async function getProfile(user) {
  const response = await serviceRequest(
    'profiles?id=eq.' + encodeURIComponent(user.id) + '&select=display_name,home_area&limit=1',
    { method: 'GET' }
  );
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return row || {};
}

async function getExisting(userId, game, loopKey) {
  const path =
    'arcade_scores?user_id=eq.' + encodeURIComponent(userId) +
    '&game=eq.' + encodeURIComponent(game) +
    '&loop_key=eq.' + encodeURIComponent(loopKey) +
    '&select=score&limit=1';
  const response = await serviceRequest(path, { method: 'GET' });
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? Number(rows[0].score) || 0 : 0;
}

async function saveBest(record) {
  const response = await serviceRequest(
    'arcade_scores?on_conflict=user_id,game,loop_key',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(record)
    }
  );
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function leaderboard(game, scope, loopKey) {
  let path =
    'arcade_scores?game=eq.' + encodeURIComponent(game) +
    '&select=user_id,display_name,loop_label,score,updated_at' +
    '&order=score.desc,updated_at.asc&limit=100';

  if (scope === 'loop') {
    if (!loopKey) return [];
    path += '&loop_key=eq.' + encodeURIComponent(loopKey);
  }

  const response = await serviceRequest(path, { method: 'GET' });
  const rows = await response.json();
  const source = Array.isArray(rows) ? rows : [];

  const seen = new Set();
  const compact = [];
  for (const row of source) {
    if (scope === 'global') {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
    }
    compact.push({
      name: publicName(row.display_name),
      loopLabel: clean(row.loop_label, 120),
      score: Number(row.score) || 0
    });
    if (compact.length >= 20) break;
  }
  return compact.map((row, index) => ({ rank: index + 1, ...row }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const game = validGame(req.query.game);
      const scope = clean(req.query.scope, 20).toLowerCase() === 'global' ? 'global' : 'loop';
      const loopKey = safeLoopKey(req.query.loopKey);

      if (!game) return res.status(400).json({ ok: false, error: 'Choose a valid game.' });
      if (scope === 'loop' && !loopKey) return res.status(400).json({ ok: false, error: 'A Loop is required.' });

      const items = await leaderboard(game, scope, loopKey);
      return res.status(200).json({ ok: true, game, scope, items });
    }

    if (req.method === 'POST') {
      const auth = clean(req.headers.authorization, 500);
      const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
      const user = await verifyUser(token);
      if (!user) return res.status(401).json({ ok: false, error: 'Sign in to post a leaderboard score.' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const game = validGame(body.game);
      const score = Math.floor(Number(body.score));
      const loopKey = safeLoopKey(body.loopKey);
      const loopLabel = clean(body.loopLabel, 120);

      if (!game) return res.status(400).json({ ok: false, error: 'Choose a valid game.' });
      if (!Number.isFinite(score) || score < 0 || score > 10000000) {
        return res.status(400).json({ ok: false, error: 'That score is not valid.' });
      }
      if (!loopKey || !loopLabel) return res.status(400).json({ ok: false, error: 'A current Loop is required.' });

      const profile = await getProfile(user);
      const displayName =
        clean(profile.display_name, 120) ||
        clean(user.user_metadata && (user.user_metadata.display_name || user.user_metadata.name), 120) ||
        clean(String(user.email || '').split('@')[0], 80) ||
        'Loop Player';

      const existing = await getExisting(user.id, game, loopKey);
      if (score <= existing) {
        return res.status(200).json({
          ok: true,
          improved: false,
          best: existing,
          loopLabel,
          publicName: publicName(displayName)
        });
      }

      const saved = await saveBest({
        user_id: user.id,
        game,
        loop_key: loopKey,
        loop_label: loopLabel,
        display_name: displayName,
        score
      });

      return res.status(200).json({
        ok: true,
        improved: true,
        best: Number(saved && saved.score) || score,
        loopLabel,
        publicName: publicName(displayName)
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (error) {
    console.error('Loop arcade API error:', error && error.message ? error.message : error);
    return res.status(503).json({ ok: false, error: 'Loop Arcade is temporarily unavailable.' });
  }
};
