// netlify/functions/cleanup-blobs.js
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
    storeName = "site:bookings",   // the OLD namespace you want to delete
    prefix    = "",                // e.g. "records/" or "" for all
    dryRun    = true
  } = body;

  try {
    const store = getStore({ name: storeName });

    let cursor, deleted = [], kept = [];
    do {
      const page = await store.list({ prefix, cursor });
      cursor = page.cursor;

      for (const b of page.blobs) {
        if (dryRun) { kept.push(b.key); continue; }
        await store.delete(b.key);
        deleted.push(b.key);
      }
    } while (cursor);

    return j(200, { ok:true, storeName, prefix, dryRun,
                    deletedCount: deleted.length, deleted,
                    listedNotDeletedCount: kept.length, listedNotDeleted: kept });
  } catch (e) {
    console.error("cleanup-blobs error:", e);
    return j(500, { error: e?.message || "Cleanup failed" });
  }
}