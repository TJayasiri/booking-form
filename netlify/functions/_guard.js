// Rate‑limit guard (server side) — shared helper
// NOTE: In-memory only; resets on cold start and doesn't share across instances.
// For production-grade limits, back this with KV/Redis/Blobs.
const hits = new Map();

/**
 * guard(ip, limit, windowMs)
 * Returns true if under the limit; false if rate-limited.
 */
export function guard(ip, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(ts => now - ts < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length <= limit;
}