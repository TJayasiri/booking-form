// netlify/functions/migrate-blobs.js
import { getStore } from "@netlify/blobs";

function makeStore() {
  // In Netlify (prod), implicit creds are injected. In Netlify Dev, also works implicitly.
  // If you *really* need token/site id, you could wire them like in rebuild-index,
  // but implicit is the simplest & recommended.
  return getStore({ name: "bookings" });
}

const H = { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" };
const j = (s, b) => ({ statusCode: s, headers: H, body: JSON.stringify(b) });

export async function handler(event) {
  // Auth
  const key = event.headers?.["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) return j(401, { error: "Unauthorized" });

  if (event.httpMethod !== "POST") return j(405, { error: "Method not allowed" });

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return j(400, { error: "Invalid JSON body" });
  }

  const fromPrefix = (body.fromPrefix || "").trim();
  const toPrefix   = (body.toPrefix   || "").trim();
  const dryRun     = !!body.dryRun;

  if (!fromPrefix || !toPrefix) {
    return j(400, { error: "fromPrefix and toPrefix are required" });
  }
  if (fromPrefix === toPrefix) {
    return j(400, { error: "fromPrefix and toPrefix must differ" });
  }

  const store = makeStore();

  let cursor;
  const willMove = [];
  do {
    const res = await store.list({ prefix: fromPrefix, cursor });
    cursor = res.cursor;

    for (const b of res.blobs) {
      // only migrate JSON booking records
      if (!b.key.endsWith(".json")) continue;

      const newKey = b.key.replace(fromPrefix, toPrefix);
      willMove.push({ from: b.key, to: newKey });
    }
  } while (cursor);

  if (dryRun) {
    return j(200, { ok: true, dryRun: true, count: willMove.length, moves: willMove.slice(0, 50) });
  }

  // Perform the copy/write, then delete the old key (safe move)
  let moved = 0;
  for (const { from, to } of willMove) {
    const data = await store.get(from, { type: "arrayBuffer" });
    if (!data) continue;

    await store.set(to, data, { contentType: "application/json" });
    await store.delete(from);
    moved++;
  }

  return j(200, { ok: true, moved, fromPrefix, toPrefix });
}