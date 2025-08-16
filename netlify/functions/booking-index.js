import { getStore } from "@netlify/blobs";

function makeStore() {
  if (process.env.NETLIFY_DEV === "true") return getStore({ name: "bookings" });
  return getStore({
    name: "bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

const ADMIN_HEADER = "x-admin-token";

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const supplied = event.headers[ADMIN_HEADER] || event.headers[ADMIN_HEADER.toLowerCase()];
  if (!supplied || supplied !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const store = makeStore();
    // Try fast path
    let index = await store.get("index.json", { type: "json" });
    if (!Array.isArray(index)) index = [];

    // If index empty, build from records
    if (index.length === 0) {
      const rows = [];
      const iter = store.list({ prefix: "records/" });
      for await (const entry of iter) {
        if (!entry.key.endsWith(".json")) continue;
        const rec = await store.get(entry.key, { type: "json" });
        if (!rec) continue;
        rows.push({
          id: rec.refId || "",
          ts: rec.ts || "",
          name: rec?.form?.requester?.company || "",
          email: rec?.form?.requester?.email || "",
          locked: !!rec.locked,
          version: rec.version || 1,
          views: rec?.metrics?.views || 0,
        });
      }
      index = rows;
    }

    // sort newest first
    index.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify(index),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "index failed" }) };
  }
}