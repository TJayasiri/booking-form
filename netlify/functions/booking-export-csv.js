import { makeStore } from "./_store.js";

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsvRow(arr) {
  return arr.map(csvEscape).join(",") + "\n";
}

function buildRowFromRecord(rec) {
  // rec is the full JSON saved at records/<refId>.json
  const lastEvent = Array.isArray(rec.events) && rec.events.length
    ? rec.events[rec.events.length - 1].type
    : "";

  return {
    id: rec.refId || rec.id || "",
    ts: rec.ts || "",
    name: rec?.form?.requester?.company || "",
    email: rec?.form?.requester?.email || "",
    phone: rec?.form?.requester?.phone || "",
    date: rec?.form?.meta?.auditDate || rec?.form?.meta?.windowStart || "",
    time: rec?.form?.meta?.time || "",
    notes: rec?.form?.special?.details || "",
    locked: !!rec.locked,
    version: rec.version || 1,
    views: rec?.metrics?.views || 0,
    last_event: lastEvent,
  };
}

async function readViaIndex(store) {
  // returns array of "row objects" (already normalized)
  const index = await store.get("index.json", { type: "json" });
  if (!Array.isArray(index) || index.length === 0) return null;

  const rows = [];
  // Enrich each index item with live record (to get views/version/notes/phone reliably)
  for (const item of index) {
    const id = item.id || item.refId;
    if (!id) continue;
    const rec = await store.get(`records/${id}.json`, { type: "json" });
    if (rec) rows.push(buildRowFromRecord(rec));
  }
  return rows;
}

async function readViaList(store) {
  // fallback when index.json is missing; iterate records/
  const rows = [];
  // @netlify/blobs v6 supports list with prefix
  const iter = store.list({ prefix: "records/" });
  for await (const entry of iter) {
    if (!entry || !entry.key || !entry.key.endsWith(".json")) continue;
    const rec = await store.get(entry.key, { type: "json" });
    if (rec) rows.push(buildRowFromRecord(rec));
  }
  return rows;
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      body: "Method not allowed",
    };
  }

  try {
  

    // 1) Try fast path via index.json
    let rows = await readViaIndex(store);

    // 2) Fallback to listing records/
    if (!rows || rows.length === 0) {
      rows = await readViaList(store);
    }

    // 3) Nothing found
    if (!rows || rows.length === 0) {
      const headerOnly = "id,ts,name,email,phone,date,time,notes,locked,version,views,last_event\n";
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="bookings.csv"',
        },
        body: headerOnly,
      };
    }

    // 4) Build CSV
    const header = ["id","ts","name","email","phone","date","time","notes","locked","version","views","last_event"];
    let csv = toCsvRow(header);
    for (const r of rows) {
      csv += toCsvRow([r.id, r.ts, r.name, r.email, r.phone, r.date, r.time, r.notes, r.locked, r.version, r.views, r.last_event]);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="bookings.csv"',
      },
      body: csv,
    };
  } catch (e) {
    console.error("booking-export-csv error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      body: String(e?.message || "Export failed"),
    };
  }
}