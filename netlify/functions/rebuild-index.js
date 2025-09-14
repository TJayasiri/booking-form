// netlify/functions/rebuild-index.js
import { getStore } from "@netlify/blobs";

function makeStore() {
  if (process.env.NETLIFY_DEV === "true") return getStore({ name: "bookings" });
  return getStore({
    name: "bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}
const H = { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" };
const j = (s, b) => ({ statusCode: s, headers: H, body: JSON.stringify(b) });

export async function handler(event) {
  // Auth: same header name/value you already use elsewhere
  const key = event.headers?.["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) return j(401, { error: "Unauthorized" });

  const store = makeStore();
  // list all records/* blobs (paginated)
  let cursor, out = [];
  do {
    const res = await store.list({ prefix: "records/", cursor });
    cursor = res.cursor;
    for (const b of res.blobs) {
      if (!b.key.endsWith(".json")) continue;
      const rec = await store.get(b.key, { type: "json" });
      if (!rec) continue;
      const id = (rec.refId || b.key.replace(/^records\/|\.json$/g, ""));
      out.push({
        id,
        ts: rec.ts || new Date().toISOString(),
        name: rec?.form?.requester?.company || "",
        email: rec?.form?.requester?.email || "",
        date: rec?.form?.meta?.auditDate || rec?.form?.meta?.windowStart || "",
        time: rec?.form?.meta?.time || "",
        locked: !!rec.locked,
        version: rec.version || 1,
        views: rec?.metrics?.views || 0,
      });
    }
  } while (cursor);

  // newest first
  out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

  await store.set("index.json", JSON.stringify(out), { contentType: "application/json" });
  return j(200, { ok: true, count: out.length });
}