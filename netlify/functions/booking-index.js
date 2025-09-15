// netlify/functions/booking-index.js
import { makeStore } from "./_store.js";


function json(status, body, extra = {}) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
    body: JSON.stringify(body),
  };
}

function csv(status, text) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": "inline; filename=index.csv",
    },
    body: text,
  };
}

function assertAdmin(event) {
  const h = event.headers || {};
  const k = h["x-admin-key"] || h["X-Admin-Key"];
  if (!k || k !== process.env.ADMIN_KEY) throw new Error("Unauthorized");
}

export async function handler(event) {
  try {
    assertAdmin(event);

    const store = makeStore();

    // Try fast index
    let rows = await store.get("index.json", { type: "json" });
    if (!Array.isArray(rows)) rows = [];

    // Allow CSV or JSON
    const format = (event.queryStringParameters?.format || "json").toLowerCase();

    // Optional filter/limit
    const q = (event.queryStringParameters?.q || "").toLowerCase().trim();
    const limit = Math.min(1000, Math.max(1, Number(event.queryStringParameters?.limit || 200)));

    let data = rows;
    if (q) {
      data = rows.filter((r) =>
        [r.id, r.name, r.email].filter(Boolean).some((v) => v.toLowerCase().includes(q))
      );
    }
    data = data.slice(0, limit);

    if (format === "csv") {
      const header = ["id","ts","name","email","phone","date","time","notes","locked","version","views","last_event"];
      const csvText = [
        header.join(","),
        ...data.map((r) => [
          r.id, r.ts, (r.name||""), (r.email||""), (r.phone||""),
          (r.date||""), (r.time||""), (r.notes||""),
          String(r.locked ?? false).toUpperCase(),
          r.version ?? "", r.views ?? "", r.last_event ?? ""
        ].map(v => String(v).replace(/"/g,'""')).map(v => /[,\"\n]/.test(v) ? `"${v}"` : v).join(","))
      ].join("\n");
      return csv(200, csvText);
    }

    return json(200, data);
  } catch (e) {
    if (/Unauthorized/.test(e.message)) return json(401, { error: "Unauthorized" });
    return json(500, { error: e?.message || "Index error" });
  }
}