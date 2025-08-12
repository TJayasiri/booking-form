import { getStore } from '@netlify/blobs';

export async function handler(event) {
  const ref = event.queryStringParameters?.ref;
  if (!ref) return { statusCode: 400, body: 'Missing ref' };

  const store = getStore('bookings');
  const value = await store.get(ref);
  if (!value) return { statusCode: 404, body: 'Not found' };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: value };
}
