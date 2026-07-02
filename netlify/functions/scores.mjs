import { getStore } from '@netlify/blobs';

const STORE_NAME = 'finest-world-cup-scores';
const BOARD_KEY = 'leaderboard-v2';
const MAX_SCORES = 20;
const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8'
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) }
  });
}

function normalizeHandle(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  return raw ? '@' + raw.slice(0, 23) : '';
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(999999, Math.floor(score)));
}

function normalizeScores(list) {
  const byHandle = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const handle = normalizeHandle(item?.handle);
    const score = normalizeScore(item?.score);
    if (!handle || score <= 0) return;
    const dateValue = Number(item?.date);
    const date = Number.isFinite(dateValue) ? dateValue : Date.now();
    const key = handle.toLowerCase();
    const existing = byHandle.get(key);
    if (!existing || score > existing.score || (score === existing.score && date > existing.date)) {
      byHandle.set(key, { handle, score, date });
    }
  });
  return Array.from(byHandle.values()).sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_SCORES);
}

async function readBoard(store) {
  const entry = await store.getWithMetadata(BOARD_KEY, { type: 'json', consistency: 'strong' });
  if (!entry) return { scores: [], etag: undefined };
  return { scores: normalizeScores(entry.data || []), etag: entry.etag };
}

async function writeBoard(store, scores, etag) {
  const options = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
  return store.setJSON(BOARD_KEY, normalizeScores(scores), options);
}

async function addScore(store, nextScore) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { scores, etag } = await readBoard(store);
    const previousBest = scores[0]?.score || 0;
    const updated = normalizeScores([...scores, nextScore]);
    const result = await writeBoard(store, updated, etag);
    if (result.modified) {
      return { scores: updated, newBest: nextScore.score > previousBest };
    }
  }
  throw new Error('The leaderboard changed while saving. Please try again.');
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const { scores } = await readBoard(store);
    return json({ scores });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid score payload' }, { status: 400 });
  }

  const handle = normalizeHandle(body.handle);
  const score = normalizeScore(body.score);
  const dateValue = Number(body.date);
  const date = Number.isFinite(dateValue) ? dateValue : Date.now();

  if (!handle || score <= 0) {
    return json({ error: 'A social handle and positive score are required' }, { status: 400 });
  }

  const result = await addScore(store, { handle, score, date });
  return json({ saved: true, ...result });
}
