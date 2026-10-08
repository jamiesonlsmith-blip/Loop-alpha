function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeKey(value, max = 180) {
  return clean(value, max).toLowerCase().replace(/[^a-z0-9:_/.-]+/g, '-').replace(/-+/g, '-');
}

function safeCategory(value) {
  return clean(value, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
}

const EVENT_POINTS = {
  review: 6,
  recommendation: 4,
  community_post: 2,
  reply: 1,
  interaction: 1
};

function supabaseBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function supabaseKey() {
  return process.env.SUPABASE_SECRET_KEY || '';
}

async function serviceRequest(path, options = {}) {
  const base = supabaseBase();
  const key = supabaseKey();
  if (!base || !key) throw new Error('Reputation storage is not configured.');

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
    throw new Error('Reputation storage failed: ' + response.status + ' ' + detail.slice(0, 220));
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

async function readEvents(userId) {
  const response = await serviceRequest(
    'reputation_events?user_id=eq.' + encodeURIComponent(userId) +
    '&select=event_type,category,points,created_at&order=created_at.desc&limit=1000',
    { method: 'GET' }
  );
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function summarize(rows = []) {
  const breakdown = {
    review: 0,
    recommendation: 0,
    community_post: 0,
    reply: 0,
    interaction: 0
  };
  const categoryPoints = {};
  let totalPoints = 0;

  for (const row of rows) {
    const type = clean(row.event_type, 40);
    const points = Math.max(0, Number(row.points) || 0);
    if (Object.prototype.hasOwnProperty.call(breakdown, type)) breakdown[type] += 1;
    totalPoints += points;

    const category = safeCategory(row.category);
    if (category) categoryPoints[category] = (categoryPoints[category] || 0) + points;
  }

  const cappedPoints = Math.min(100, totalPoints);
  const score = Math.min(10, Math.round(cappedPoints) / 10);
  const categories = Object.entries(categoryPoints)
    .map(([category, points]) => ({
      category,
      points: Math.round(points),
      score: Math.min(10, Math.round(Math.min(100, points)) / 10)
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 12);

  return {
    score,
    points: Math.round(cappedPoints),
    totalEvidencePoints: Math.round(totalPoints),
    breakdown,
    categories
  };
}

async function saveProfileScore(userId, score) {
  await serviceRequest(
    'profiles?id=eq.' + encodeURIComponent(userId),
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ reputation_score: score })
    }
  );
}

async function addEvent(userId, eventType, sourceKey, category) {
  const points = EVENT_POINTS[eventType];
  const response = await serviceRequest(
    'reputation_events?on_conflict=user_id,event_type,source_key',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userId,
        event_type: eventType,
        source_key: sourceKey,
        category: category || null,
        points
      })
    }
  );
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const auth = clean(req.headers.authorization, 500);
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ ok: false, error: 'Sign in to use Loop Reputation.' });

    if (req.method === 'GET') {
      const rows = await readEvents(user.id);
      const summary = summarize(rows);
      await saveProfileScore(user.id, summary.score);
      return res.status(200).json({ ok: true, ...summary });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const eventType = clean(body.eventType, 40).toLowerCase();
      const sourceKey = safeKey(body.sourceKey);
      const category = safeCategory(body.category);

      if (!Object.prototype.hasOwnProperty.call(EVENT_POINTS, eventType)) {
        return res.status(400).json({ ok: false, error: 'That reputation event is not supported.' });
      }
      if (!sourceKey) {
        return res.status(400).json({ ok: false, error: 'A source is required for reputation evidence.' });
      }

      const added = await addEvent(user.id, eventType, sourceKey, category);
      const rows = await readEvents(user.id);
      const summary = summarize(rows);
      await saveProfileScore(user.id, summary.score);

      return res.status(200).json({
        ok: true,
        added,
        eventType,
        eventPoints: EVENT_POINTS[eventType],
        ...summary
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (error) {
    console.error('Loop reputation API error:', error && error.message ? error.message : error);
    return res.status(503).json({ ok: false, error: 'Loop Reputation is temporarily unavailable.' });
  }
};
