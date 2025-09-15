// netlify/functions/job.js
import { makeStore } from "./_store.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const isLocal = process.env.NETLIFY_DEV === "true";
const LOCAL_DIR = path.join(os.tmpdir(), "greenleaf-bookings");


const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  const ref = (event.queryStringParameters?.ref || "").trim();
  if (!ref) return json(400, { error: "Missing ref" });

  try {
    if (isLocal) {
      try {
        const raw = await fs.readFile(path.join(LOCAL_DIR, `${ref}.json`), "utf8");
        const rec = JSON.parse(raw);
        const job = rec.job || {
          current_stage: "APPLICATION_SUBMITTED",
          created_at: rec.ts || new Date().toISOString(),
          due_at: null,
        };
        const history = Array.isArray(rec.history) ? rec.history : [];
        return json(200, { job, history });
      } catch {
        return json(404, { error: "Not found" });
      }
    }

    const store = makeStore();
    const key = `records/${ref}.json`;
    const rec = await store.get(key, { type: "json" });
    if (!rec) return json(404, { error: "Not found" });

    const job = rec.job || {
      current_stage: "APPLICATION_SUBMITTED",
      created_at: rec.ts || new Date().toISOString(),
      due_at: null,
    };
    const history = Array.isArray(rec.history) ? rec.history : [];
    return json(200, { job, history });
  } catch (e) {
    console.error("job GET error:", e);
    return json(500, { error: e?.message || "Failed" });
  }
}