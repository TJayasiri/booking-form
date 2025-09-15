// netlify/functions/migrate-blobs.js
import { getStore } from "@netlify/blobs";

const H = { "Content-Type":"application/json; charset=utf-8",
            "Cache-Control":"no-store", "Access-Control-Allow-Origin":"*" };
const j = (s,b)=>({ statusCode:s, headers:H, body:JSON.stringify(b) });

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return j(200, { ok:true });

  // Admin guard
  const key = event.headers?.["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) return j(401, { error:"Unauthorized" });

  if (event.httpMethod !== "POST") return j(405, { error:"Method not allowed" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const {
    fromStore  = "site:bookings",
    toStore    = "bookings",
    fromPrefix = "records/",
    toPrefix   = "records/",       // keep this, but we compute cleanly
    overwrite  = false,
    dryRun     = true
  } = body;

  try {
    const src = getStore({ name: fromStore });
    const dst = getStore({ name: toStore });

    let cursor, moved = [], skipped = [];
    do {
      const page = await src.list({ prefix: fromPrefix, cursor });
      cursor = page.cursor;

      for (const b of page.blobs) {
        if (!b.key.endsWith(".json")) continue;

        // compute relative key and the new destination key
        const rel = b.key.startsWith(fromPrefix) ? b.key.slice(fromPrefix.length) : b.key;
        const destKey = `${toPrefix}${rel}`; // NO double "records/records/"

        // skip if already exists (unless overwrite)
        if (!dryRun && !overwrite) {
          const already = await dst.get(destKey, { type: "json" });
          if (already) { skipped.push({ from: b.key, to: destKey, reason: "exists" }); continue; }
        }

        if (!dryRun) {
          // read fully, then write (avoid locked/disturbed stream error)
          const data = await src.get(b.key, { type: "text" }); // could use "arrayBuffer" too
          await dst.set(destKey, data, { contentType: "application/json" });
        }
        moved.push({ from: b.key, to: destKey });
      }
    } while (cursor);

    return j(200, {
      ok: true, dryRun,
      movedCount: moved.length, moved,
      skippedCount: skipped.length, skipped
    });
  } catch (e) {
    console.error("migrate-blobs error:", e);
    return j(500, { error: e?.message || "Migration failed" });
  }
}