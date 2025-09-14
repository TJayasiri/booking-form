// netlify/functions/migrate-blobs.js
import { BlobsContext } from '@netlify/blobs';

export async function handler() {
  const blobs = new BlobsContext();
  const OLD = 'old-prefix/';  // e.g. 'main@6414fc1/'
  const NEW = 'prod/';

  let moved = 0;
  for await (const { key } of blobs.list({ prefix: OLD })) {
    const buf = await blobs.get(key, { type: 'buffer' });
    const newKey = key.replace(OLD, NEW);
    await blobs.set(newKey, buf);
    moved++;
  }
  return { statusCode: 200, body: `Moved ${moved} objects` };
}