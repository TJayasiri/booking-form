// netlify/functions/booking-admin.js
// Admin-only lock/unlock endpoint

import { getStore } from "@netlify/blobs";
import { guard } from "./_guard.js";


const ip = event.headers?.["x-nf-client-connection-ip"] ||
           event.headers?.["x-forwarded-for"]?.split(",")[0].trim() ||
           event.headers?.["client-ip"] ||
           event.ip || "unknown";
if (!guard(ip, 30, 60_000)) return json(429, { error: "Too many requests" });

function makeStore() {
  if (process.env.NETLIFY_DEV === "true") return getStore({ name: "bookings" });
  return getStore({
    name: "bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

// Require admin header: X-Admin-Key must match ADMIN_KEY (set in Netlify env)
function assertAdmin(event) {
  const h = event.headers || {};
  // Netlify lower-cases header names
  const supplied = h["x-admin-key"] || h["X-Admin-Key"];
  if (!supplied || supplied !== process.env.ADMIN_KEY) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

// Best-effort IP extraction for audit log
function getIp(event) {
  const h = event.headers || {};
  const connIp = h["x-nf-client-connection-ip"] || h["client-ip"] || "";
  const xff = (h["x-forwarded-for"] || "").split(",")[0].trim();
  return connIp || xff || "";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, { Allow: "POST" });
  }

  try {
    assertAdmin(event);

    const { refId, action } = JSON.parse(event.body || "{}");
    if (!refId || !action) return json(400, { error: "refId and action are required" });
    if (!["lock", "unlock"].includes(action)) return json(400, { error: "action must be lock|unlock" });

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
    rec.events.push({
      type: action,
      ts: now,
      actor: "admin",
      ip: getIp(event),
    });

    // Persist record
    await store.set(key, JSON.stringify(rec), { contentType: "application/json" });

    // ---- Keep index.json in sync (best-effort) ----
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
      if (i >= 0) {
        index[i] = { ...index[i], ...brief };
      } else {
        index.push(brief);
      }

      await store.set(ixKey, JSON.stringify(index), { contentType: "application/json" });
    } catch {
      // ignore index update errors
    }

    return json(200, { ok: true, id: refId, locked: !!rec.locked, version: rec.version });
  } catch (e) {
    const code = e.statusCode === 401 || /Unauthorized/i.test(e.message) ? 401 : 500;
    if (code === 401) return json(401, { error: "Unauthorized" });
    console.error("booking-admin error:", e);
    return json(500, { error: e?.message || "Admin action failed" });
  }
}