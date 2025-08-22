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

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  // light CORS so you can hit this from anywhere during admin/testing
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status, body) => ({ statusCode: status, headers: baseHeaders, body: JSON.stringify(body) });

function isAdmin(event) {
  const h = event.headers || {};
  const key = h["x-admin-key"] || h["X-Admin-Key"] || h["x-admin-key".toLowerCase()];
  return key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

function parseBody(event) {
  // Try JSON first
  try {
    const b = JSON.parse(event.body || "{}");
    if (b && typeof b === "object") return b;
  } catch {}
  // Try URL-encoded (Netlify sometimes sends this if headers mismatch)
  try {
    const u = new URLSearchParams(event.body || "");
    const obj = Object.fromEntries(u.entries());
    if (Object.keys(obj).length) return obj;
  } catch {}
  return {};
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAdmin(event)) return json(401, { error: "Unauthorized" });

  // Accept body OR querystring
  const body = parseBody(event);
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const ref = (body.ref || body.refId || qs.get("ref") || qs.get("refId") || "").trim();
  const stage = (body.stage || qs.get("stage") || "").trim();
  const dueAt = (body.dueAt ?? qs.get("dueAt")) ?? null;

  if (!ref)   return json(400, { error: "Missing ref" });
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

      rec.job = rec.job || {
        current_stage: "APPLICATION_SUBMITTED",
        created_at: rec.ts || new Date().toISOString(),
        due_at: null,
      };
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

    rec.job = rec.job || {
      current_stage: "APPLICATION_SUBMITTED",
      created_at: rec.ts || new Date().toISOString(),
      due_at: null,
    };
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