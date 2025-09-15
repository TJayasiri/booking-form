// netlify/functions/_store.js
import { getStore } from "@netlify/blobs";

/**
 * Always read/write the same store:
 *  - local dev:     "bookings" (implicit is fine)
 *  - production:    "bookings" with explicit credentials (prevents site:bookings)
 */
export function makeStore() {
  if (process.env.NETLIFY_DEV === "true") {
    return getStore({ name: "bookings" });
  }
  // Hard-pin to the plain "bookings" store in prod
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;
  if (!siteID || !token) {
    throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN. Set both to use the 'bookings' store.");
  }
  return getStore({ name: "bookings", siteID, token });
}