// netlify/functions/migrate-blobs.js
import { getStore } from "@netlify/blobs";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

function makeStore() {
  // Works on Netlify (prod) and on recent Netlify CLI
  // Falls back to explicit creds if provided locally
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
    return getStore({
      name: "bookings",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });
  }
  return getStore({ name: "bookings" });
}

export async function handler(event) {
  // auth
  const key = event.headers?.["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    return json(401, { error: "Unauthorized" });
  }

  // input
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const fromPrefix = body.fromPrefix ?? "main@";
  const toPrefix = body.toPrefix ?? "records/";
  const dryRun = !!body.dryRun;

  const store = makeStore();

  const moved = [];
  const skipped = [];
  let cursor;

  try {
    do {
      const res = await store.list({ prefix: fromPrefix, cursor });
      cursor = res.cursor;

      for (const b of res.blobs) {
        if (!b.key.endsWith(".json")) { skipped.push({ key: b.key, reason: "not-json" }); continue; }

        // Extract ref id from the legacy key:
        // examples: "main@GLB-…json" or "main@/GLB-…json"
        const filename = b.key.replace(/^main@\/?/, "");
        const refId = filename.replace(/\.json$/i, "");
        const destKey = `${toPrefix}${refId}.json`;

        if (dryRun) {
          moved.push({ from: b.key, to: destKey, size: b.size });
          continue;
        }

        // copy content then delete old
        const buf = await store.get(b.key, { type: "stream" });
        if (!buf) { skipped.push({ key: b.key, reason: "read-failed" }); continue; }

        await store.set(destKey, buf, { contentType: "application/json" });
        await store.delete(b.key);
        moved.push({ from: b.key, to: destKey, size: b.size });
      }
    } while (cursor);

    return json(200, { ok: true, dryRun, movedCount: moved.length, moved, skippedCount: skipped.length, skipped });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
}