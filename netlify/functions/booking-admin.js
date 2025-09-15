// netlify/functions/booking-admin.js
// Admin-only lock/unlock endpoint

import { makeStore } from "./_store.js";
import { guard } from "./_guard.js";


/* ---------- helpers Removed to Central---------- */

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status, body, extraHeaders = {}) => ({
  statusCode: status,
  headers: { ...baseHeaders, ...extraHeaders },
  body: JSON.stringify(body),
});

// lower-case header lookup (Netlify lowercases keys)
const getHeader = (event, name) => (event.headers?.[name.toLowerCase()] ?? "");

// Require admin header: X-Admin-Key must match ADMIN_KEY
function assertAdmin(event) {
  const supplied = getHeader(event, "x-admin-key");
  if (!supplied || supplied !== process.env.ADMIN_KEY) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

// Best-effort IP extraction for audit log + rate limit
function getIp(event) {
  const h = event.headers || {};
  const conn = h["x-nf-client-connection-ip"] || h["client-ip"] || "";
  const xff = (h["x-forwarded-for"] || "").split(",")[0].trim();
  return conn || xff || "";
}

// tolerant body parsing (JSON or urlencoded)
function parseBody(event) {
  try {
    const obj = JSON.parse(event.body || "{}");
    if (obj && typeof obj === "object") return obj;
  } catch {}
  try {
    const u = new URLSearchParams(event.body || "");
    const obj = Object.fromEntries(u.entries());
    if (Object.keys(obj).length) return obj;
  } catch {}
  return {};
}

/* ---------- handler ---------- */
export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, { Allow: "POST" });
  }

  // rate limit per client IP (memory-based within function instance)
  const ip = getIp(event) || "unknown";
  if (!guard(ip, 30, 60_000)) {
    return json(429, { error: "Too many requests" });
  }

  try {
    assertAdmin(event);

    const { refId, action } = parseBody(event);
    if (!refId || !action) return json(400, { error: "refId and action are required" });
    if (!["lock", "unlock"].includes(action)) {
      return json(400, { error: "action must be lock|unlock" });
    }

    const store = makeStore();
    const key = `records/${refId}.json`;

    const rec = await store.get(key, { type: "json" });
    if (!rec) return json(404, { error: "Not found" });

    const now = new Date().toISOString();
    if (action === "lock") {
      rec.locked = true;
      rec.lockedAt = now;
    } else {
      rec.locked = false;
      rec.unlockedAt = now;
    }

    rec.version = (rec.version || 0) + 1;
    rec.events = Array.isArray(rec.events) ? rec.events : [];
    rec.events.push({ type: action, ts: now, actor: "admin", ip });

    // Persist record
    await store.set(key, JSON.stringify(rec), { contentType: "application/json" });

    // Keep index.json in sync (best‑effort)
    try {
      const ixKey = "index.json";
      let index = await store.get(ixKey, { type: "json" });
      if (!Array.isArray(index)) index = [];

      const brief = {
        id: refId,
        ts: rec.ts || now,
        name: rec?.form?.requester?.company || "",
        email: rec?.form?.requester?.email || "",
        date: rec?.form?.meta?.auditDate || rec?.form?.meta?.windowStart || "",
        time: rec?.form?.meta?.time || "",
        locked: !!rec.locked,
        version: rec.version || 1,
        views: rec?.metrics?.views || 0,
      };

      const i = index.findIndex((x) => (x.id || x.refId) === refId);
      if (i >= 0) index[i] = { ...index[i], ...brief };
      else index.push(brief);

      await store.set(ixKey, JSON.stringify(index), { contentType: "application/json" });
    } catch {
      // ignore index update issues
    }

    return json(200, { ok: true, id: refId, locked: !!rec.locked, version: rec.version });
  } catch (e) {
    const code = e.statusCode === 401 ? 401 : 500;
    if (code === 401) return json(401, { error: "Unauthorized" });
    console.error("booking-admin error:", e);
    return json(500, { error: e?.message || "Admin action failed" });
  }
}