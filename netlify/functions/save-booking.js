import { getStore } from '@netlify/blobs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const payload = JSON.parse(event.body || '{}');
  if (!payload.refId || !payload.form) return { statusCode: 400, body: 'Missing refId/form' };

  const store = getStore('bookings'); // creates if needed
  await store.set(payload.refId, JSON.stringify(payload), { metadata: { created: Date.now() } });

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
}
