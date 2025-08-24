import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { guard } from "./_guard.js"; // ← Rate‑limit guard (server side)

const isLocal = process.env.NETLIFY_DEV === "true";
const LOCAL_DIR = path.join(os.tmpdir(), "greenleaf-bookings");

function makeStore() {
  // In local dev, Blobs works without siteID/token too,
  // but we keep a filesystem path for easy inspection.
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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status, body) => ({
  statusCode: status,
  headers: baseHeaders,
  body: JSON.stringify(body),
});

function isAdmin(event) {
  const h = event.headers || {};
  const key = h["x-admin-key"] || h["X-Admin-Key"] || h["x-admin-key".toLowerCase()];
  return key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

// Accept JSON or urlencoded
function parseBody(event) {
  try {
    const b = JSON.parse(event.body || "{}");
    if (b && typeof b === "object") return b;
  } catch {}
  try {
    const u = new URLSearchParams(event.body || "");
    const obj = Object.fromEntries(u.entries());
    if (Object.keys(obj).length) return obj;
  } catch {}
  return {};
}

const STAGE_WHITELIST = new Set([
  "APPLICATION_SUBMITTED",
  "ACCEPTED_INITIATED",
  "ESTIMATE_INVOICE_ISSUED",
  "AGREEMENT_GENERATED",
  "SCHEDULE_RELEASED",
  "REPORT_ACTION_TAKEN",
  "FOLLOW_UP",
  "COMPLETED",
]);

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!isAdmin(event)) return json(401, { error: "Unauthorized" });

  // ---- Rate‑limit guard (server side)
  const ip =
    event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["x-forwarded-for"]?.split(",")[0].trim() ||
    event.headers?.["client-ip"] ||
    event.ip ||
    "unknown";
  if (!guard(ip, 30, 60_000)) { // 30 writes/min/IP for admin endpoint
    return json(429, { error: "Too many requests" });
  }

  // Body + QS
  const body = parseBody(event);
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const ref = (body.ref || body.refId || qs.get("ref") || qs.get("refId") || "").trim();
  const stageRaw = (body.stage || qs.get("stage") || "").trim();
  // Normalize dueAt: allow "", null, ISO, or datetime-local "YYYY-MM-DDTHH:mm"
  let dueAt = body.dueAt ?? qs.get("dueAt");
  if (!dueAt || String(dueAt).trim() === "") {
    dueAt = null;
  } else {
    // If not a full ISO, try to convert the common "YYYY-MM-DDTHH:mm"
    const d = new Date(dueAt);
    if (!Number.isNaN(d.getTime())) {
      dueAt = d.toISOString();
    } else {
      // Leave as-is; API will store the provided value
    }
  }

  if (!ref)   return json(400, { error: "Missing ref" });
  if (!stageRaw) return json(400, { error: "Missing stage" });

  const stage = stageRaw.toUpperCase();
  if (!STAGE_WHITELIST.has(stage)) {
    return json(400, { error: "Invalid stage value" });
  }

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

    // --- Netlify Blobs
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