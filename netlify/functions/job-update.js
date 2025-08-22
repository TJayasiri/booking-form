// netlify/functions/job-update.js
import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const isLocal = process.env.NETLIFY_DEV === "true";
const LOCAL_DIR = path.join(os.tmpdir(), "greenleaf-bookings");

function makeStore() {
  if (isLocal) return getStore({ name: "bookings" });
  return getStore({
    name: "bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

function isAdmin(event) {
  const k = event.headers?.["x-admin-key"] || event.headers?.["X-Admin-Key"];
  return k && process.env.ADMIN_KEY && k === process.env.ADMIN_KEY;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAdmin(event)) return json(401, { error: "Unauthorized" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }
  const ref = (body.ref || body.refId || "").trim();
  const stage = (body.stage || "").trim();
  const dueAt = (body.dueAt || null);

  if (!ref) return json(400, { error: "Missing ref" });
  if (!stage) return json(400, { error: "Missing stage" });

  try {
    // --- load current record
    let rec;
    if (isLocal) {
      const p = path.join(LOCAL_DIR, `${ref}.json`);
      try {
        const raw = await fs.readFile(p, "utf8");
        rec = JSON.parse(raw);
      } catch {
        return json(404, { error: "Record not found" });
      }

      rec.job = rec.job || { current_stage: "APPLICATION_SUBMITTED", created_at: rec.ts || new Date().toISOString(), due_at: null };
      rec.history = Array.isArray(rec.history) ? rec.history : [];

      const prev = rec.job.current_stage;
      rec.job.current_stage = stage;
      if (dueAt !== null) rec.job.due_at = dueAt;
      if (prev !== stage) rec.history.push({ stage, at: new Date().toISOString() });

      await fs.mkdir(LOCAL_DIR, { recursive: true });
      await fs.writeFile(p, JSON.stringify(rec, null, 2), "utf8");
      return json(200, { ok: true, job: rec.job, history: rec.history });
    }

    const store = makeStore();
    const key = `records/${ref}.json`;
    rec = await store.get(key, { type: "json" });
    if (!rec) return json(404, { error: "Record not found" });

    rec.job = rec.job || { current_stage: "APPLICATION_SUBMITTED", created_at: rec.ts || new Date().toISOString(), due_at: null };
    rec.history = Array.isArray(rec.history) ? rec.history : [];

    const prev = rec.job.current_stage;
    rec.job.current_stage = stage;
    if (dueAt !== null) rec.job.due_at = dueAt;
    if (prev !== stage) rec.history.push({ stage, at: new Date().toISOString() });

    await store.set(key, JSON.stringify(rec), { contentType: "application/json" });
    return json(200, { ok: true, job: rec.job, history: rec.history });
  } catch (e) {
    console.error("job-update POST error:", e);
    return json(500, { error: e?.message || "Update failed" });
  }
}