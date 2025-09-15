import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

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

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function clientIp(headers) {
  const xfwd = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const conn = headers["x-nf-client-connection-ip"] || headers["X-NF-Client-Connection-IP"];
  const raw = (xfwd ? String(xfwd).split(",")[0].trim() : "") || (conn ? String(conn).trim() : "");
  return raw || "0.0.0.0";
}
function hashIp(ip) {
  if (!process.env.LOG_SALT) return null;
  return crypto.createHash("sha256").update(`${ip}|${process.env.LOG_SALT}`).digest("hex");
}
function truncIp(ip) {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : ip;
}

export async function handler(event) {
  const refId = (event.queryStringParameters?.ref || "").trim();
  if (!refId) return json(400, { error: "Missing ref parameter" });

  try {
    // ---- local dev fallback
    if (isLocal) {
      try {
        const txt = await fs.readFile(path.join(LOCAL_DIR, `${refId}.json`), "utf8");
        return json(200, JSON.parse(txt));
      } catch {
        return json(404, { error: "Not found (local)" });
      }
    }

    const store = makeStore();
    const candidates = [
      `records/${refId}.json`,   // new layout
      `main@${refId}.json`,      // legacy layout
      `main@/${refId}.json`,     // legacy variant with slash
    ];

    let rec = null;
    let keyUsed = null;
    for (const key of candidates) {
      rec = await store.get(key, { type: "json" });
      if (rec) { keyUsed = key; break; }
    }

    if (!rec) return json(404, { error: "Not found" });

    // ---- privacy-safe view tracking
    try {
      const ip = clientIp(event.headers || {});
      rec.metrics = rec.metrics || { views: 0 };
      rec.metrics.views += 1;
      rec.events = Array.isArray(rec.events) ? rec.events : [];
      rec.events.push({
        type: "view",
        ts: new Date().toISOString(),
        actor: "user",
        ipHash: hashIp(ip),
        ipTrunc: truncIp(ip),
      });
      if (keyUsed) {
        await store.set(keyUsed, JSON.stringify(rec), {
          contentType: "application/json",
        });
      }
    } catch {
      /* ignore tracking errors */
    }

    return json(200, rec);
  } catch (e) {
    console.error("get-booking error:", e);
    return json(500, { error: e?.message || "Load failed" });
  }
}