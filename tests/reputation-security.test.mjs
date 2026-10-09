import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/reputation.js');
const member = '5d67139c-302a-4875-b17c-6869e3144811';
const other = '7a691e4c-46f0-4c3d-a0f7-c6c7640c3bfa';
const post = '65c5a1d1-a6c8-4e4c-9bc7-7209854fe281';
const reply = '96db2db7-8f9e-49a4-83cf-29c6fbd944b5';
const originalFetch = globalThis.fetch;
const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-only-not-a-real-key';

function fakeResponse(data, code = 200) {
  return { ok: code >= 200 && code < 300, status: code, json: async () => data,
    text: async () => JSON.stringify(data) };
}
async function exercise(eventType, sourceKey, state = {}) {
  const calls = [];
  const owner = state.owner || member;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    calls.push([u.pathname, method]);
    if (u.pathname === '/auth/v1/user') return fakeResponse({ id: member });
    if (u.pathname === '/rest/v1/community_posts') {
      const id = u.searchParams.get('id')?.slice(3);
      return fakeResponse(id === post && u.searchParams.get('user_id') !== 'eq.' + other
        ? [{ topic: state.topic || 'Recommendation', category: 'restaurants' }] : []);
    }
    if (u.pathname === '/rest/v1/community_replies')
      return fakeResponse(state.replyAuthor === member ? [{ post_id: post }] : []);
    if (u.pathname === '/rest/v1/community_reactions')
      return fakeResponse(state.liked ? [{ post_id: post }] : []);
    if (u.pathname === '/rest/v1/reputation_events' && method === 'GET') return fakeResponse([]);
    if (u.pathname === '/rest/v1/reputation_events' && method === 'POST') return fakeResponse([{ id: 'event' }]);
    if (u.pathname === '/rest/v1/profiles' && method === 'PATCH') return fakeResponse({});
    throw Error('Unexpected call ' + method + ' ' + u.pathname);
  };
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' },
    body: { eventType, sourceKey, category: 'forged-category' } }, res);
  return { res, calls };
}
test('browser-only review never creates verified points', async () => {
  const { res, calls } = await exercise('review', 'experience-12345');
  assert.equal(res.code, 422);
  assert.equal(calls.some(([path,method]) => path.includes('reputation_events') && method === 'POST'), false);
});
test('nonexistent recommendation cannot create reputation evidence', async () => {
  const { res, calls } = await exercise('recommendation', other);
  assert.equal(res.code, 422);
  assert.equal(calls.some(([path,method]) => path.includes('reputation_events') && method === 'POST'), false);
});
test('verified recommendation is accepted and category comes from server', async () => {
  const { res, calls } = await exercise('recommendation', post);
  assert.equal(res.code, 200);
  assert.equal(res.body.added, true);
  assert.ok(calls.some(([path,method]) => path.endsWith('/reputation_events') && method === 'POST'));
});
test('same post cannot be claimed as both recommendation and regular post', async () => {
  const { res } = await exercise('community_post', post);
  assert.equal(res.code, 422);
});
test('own durable reply can earn points', async () => {
  const { res } = await exercise('reply', reply, { replyAuthor: member });
  assert.equal(res.code, 200);
});
test('unpersisted reaction cannot earn points', async () => {
  const { res } = await exercise('interaction', 'community-like:' + post);
  assert.equal(res.code, 422);
});
test('persisted reaction can earn points', async () => {
  const { res } = await exercise('interaction', 'community-like:' + post, { liked: true });
  assert.equal(res.code, 200);
});
test.after(() => {
  globalThis.fetch = originalFetch;
  for(const [name,value] of [['SUPABASE_URL',originalEnv.url],['SUPABASE_SECRET_KEY',originalEnv.key]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
