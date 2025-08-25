import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Buffer } from "node:buffer";
import { guard } from "./_guard.js";

/* ------------ config ------------ */
const isLocal = process.env.NETLIFY_DEV === "true";
const LOCAL_DIR = path.join(os.tmpdir(), "greenleaf-bookings");

/* ------------ helpers ------------ */
const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  },
  body: JSON.stringify(body),
});

const makeStore = () =>
  isLocal
    ? getStore({ name: "bookings" })
    : getStore({
        name: "bookings",
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_API_TOKEN,
      });

const isAdmin = (event) => {
  const k = event.headers?.["x-admin-key"] || event.headers?.["X-Admin-Key"];
  return k && process.env.ADMIN_KEY && k === process.env.ADMIN_KEY;
};

const getIp = (event) => {
  const h = event.headers || {};
  return (
    h["x-nf-client-connection-ip"] ||
    (h["x-forwarded-for"] || "").split(",")[0].trim() ||
    h["client-ip"] ||
    event.ip ||
    "unknown"
  );
};

/* ------------ handler ------------ */
export async function handler(event) {
  const ip = getIp(event);

  // Rate limit (30 req / 60s)
  if (!guard(ip, 30, 60_000)) {
    return json(429, { error: "Too many requests" });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, { Allow: "POST" });
  }

  try {
    const raw = event.body || "{}";
    const bytes = Buffer.byteLength(raw, "utf8");
    if (bytes > 2 * 1024 * 1024) {
      return json(413, { error: `Payload too large (${bytes} bytes)` });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    const refId = (payload.refId || "").trim();
    if (!refId) return json(400, { error: "Missing refId" });

    payload.ts = payload.ts || new Date().toISOString();

    /* ---------- local dev ---------- */
    if (isLocal) {
      await fs.mkdir(LOCAL_DIR, { recursive: true });
      await fs.writeFile(
        path.join(LOCAL_DIR, `${refId}.json`),
        JSON.stringify(payload, null, 2),
        "utf8"
      );
      return json(200, { ok: true, id: refId, mode: "local" });
    }

    /* ---------- prod (Netlify Blobs) ---------- */
    const store = makeStore();
    const key = `records/${refId}.json`;
    const existing = await store.get(key, { type: "json" });

    if (existing?.locked && !isAdmin(event)) {
      return json(423, { error: "Record is locked" }); // 423 Locked
    }

    const now = new Date().toISOString();
    const next = {
      ...existing,
      ...payload,
      locked: existing?.locked ?? false,
      version: (existing?.version || 0) + 1,
      metrics: existing?.metrics || { views: 0 },
      events: Array.isArray(existing?.events) ? existing.events.slice() : [],
    };
    next.events.push({
      type: existing ? "update" : "create",
      ts: now,
      actor: isAdmin(event) ? "admin" : "user",
      ip,
    });

    await store.set(key, JSON.stringify(next), {
      contentType: "application/json",
    });

    // Update index.json (best-effort)
    try {
      const ixKey = "index.json";
      let index = await store.get(ixKey, { type: "json" });
      if (!Array.isArray(index)) index = [];

      const brief = {
        id: refId,
        ts: next.ts,
        name: next?.form?.requester?.company || "",
        email: next?.form?.requester?.email || "",
        date: next?.form?.meta?.auditDate || next?.form?.meta?.windowStart || "",
        time: next?.form?.meta?.time || "",
        locked: !!next.locked,
        version: next.version,
      };

      const i = index.findIndex((x) => x.id === refId);
      if (i >= 0) index[i] = brief;
      else index.push(brief);

      await store.set(ixKey, JSON.stringify(index), {
        contentType: "application/json",
      });
    } catch {
      /* ignore */
    }

    return json(200, {
      ok: true,
      id: refId,
      mode: "blobs",
      version: next.version,
      locked: next.locked,
    });
  } catch (e) {
    console.error("save-booking error:", e);
    return json(500, { error: e?.message || "Save failed" });
  }
}