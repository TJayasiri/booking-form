// netlify/functions/booking-print.js
import { getStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
// SAFE import style for esbuild/Netlify Functions
import * as QRCode from "qrcode";

/* ---------------------- storage helpers ---------------------- */
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

/* ---------------------- tiny utils ---------------------- */
const esc = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const ymd = (s = "") => {
  if (!s) return "";
  try {
    const d = new Date(s);
    if (isNaN(+d)) return s;
    return d.toISOString().slice(0, 10);
  } catch {
    return s;
  }
};

function pngDataUrlFromText(text) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110'>
    <rect width='100%' height='100%' fill='#f4f4f5'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
          font-family='monospace' font-size='10'>${esc(text)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ---------------------- CSS ---------------------- */
const css = `
  *{box-sizing:border-box}
  body{font:13px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:16px;color:#0b0b0c;background:#fff}
  h1,h2{margin:.4em 0 .3em}
  h1{font-size:18px} h2{font-size:15px}
  .small{font-size:12px;color:#4b5563}
  .muted{color:#6b7280}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .hd{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #62BBC1;padding-bottom:8px;margin-bottom:10px}
  .qr img{display:block;border:1px solid #e5e7eb;border-radius:10px;padding:4px;background:#fff}
  .box{border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fff}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
  th,td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top}
  th{background:#f9fafb;text-align:left}
  .sig{height:42px;object-fit:contain}
  @media print {
    @page { size: A4; margin: 16mm 14mm; }
    body{padding:0;margin:10mm}
    .hd{page-break-inside:avoid}
  }
`;

/* ---------------------- HTML builder ---------------------- */
function renderHTML(rec, qrDataUrl) {
  const { refId, form = {}, ts, locked, terms = {} } = rec || {};
  const {
    meta = {}, requester = {}, supplier = {}, vendor = {}, buyer = {},
    staffCounts = {}, special = {}, ack = {},
  } = form;

  const cats = ["production","permanent","temporary","migrant","contractors","homeworkers","management"];
  const sum = (k) => cats.reduce((a,c)=>a + Number(staffCounts?.[c]?.[k] || 0), 0);
  const totalMale = sum("male");
  const totalFemale = sum("female");

  // ALWAYS use a safe url (passed QR or placeholder)
  const qrUrl = qrDataUrl || pngDataUrlFromText(`https://booking.greenleafassurance.com/?ref=${refId}`);

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Booking ${esc(refId)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body onload="setTimeout(()=>window.print(), 50)">
  <div class="hd">
    <div>
      <h1>Greenleaf — Service Booking</h1>
      <div class="muted small">EFNET-QMS 005 · v3.0 · Generated ${esc(new Date().toLocaleString())}</div>
    </div>
    <div class="qr"><img src="${qrUrl}" alt="QR" width="110" height="110"></div>
  </div>

  <div class="box" style="margin-bottom:10px;">
    <div><b>Reference:</b> <span class="mono">${esc(refId)}</span> &nbsp;
         <b>Created:</b> ${esc(ts || "")} &nbsp;
         <b>Locked:</b> ${locked ? "YES" : "NO"}</div>
  </div>

  <h2>1 — Audit Information & Platform Data</h2>
  <table>
    <tr><th style="width:28%">Service Type</th><td>${esc(meta.auditType || "")}${(meta.auditType === "Other") ? ` — ${esc(meta.auditTypeOther || "")}` : ""}</td></tr>
    <tr><th>Fulfillment</th><td>${esc(meta.fulfillment || "")}${(meta.fulfillment || "Fixed") === "Fixed" ? ` — ${esc(meta.auditDate || "")}` : ` — ${esc(meta.windowStart || "")} → ${esc(meta.windowEnd || "")}`}</td></tr>
    <tr><th>Requested Services</th><td>${esc((meta.services || []).join(", "))}</td></tr>
    <tr><th>Clients expected</th><td>${esc(meta.clientsExpected || "")}</td></tr>
    <tr><th>Platform Ref / Site</th><td>${esc(meta.platformRef || "")}  ·  ${esc(meta.platformSite || "")}</td></tr>
    <tr><th>Factory / Requester ID</th><td>${esc(meta.factoryOrRequesterId || "")}</td></tr>
  </table>

  <h2>2 — Parties & Contacts</h2>
  <div class="grid2">
    <div class="box">
      <b>Requester (Lead Account)</b><br>
      <div class="small">${esc(requester.company || "")}</div>
      <div class="small">${esc(requester.address || "")}</div>
      <div class="small"><b>${esc(requester.contact || "")}</b> · ${esc(requester.title || "")}</div>
      <div class="small">${esc(requester.phone || "")} · ${esc(requester.email || "")}</div>
      ${requester.gps ? `<div class="small">GPS: ${esc(requester.gps)}</div>` : ""}
    </div>
    <div class="box">
      <b>Supplier / Factory</b><br>
      <div class="small">${esc(supplier.company || "")}</div>
      <div class="small">${esc(supplier.address || "")}</div>
      <div class="small"><b>${esc(supplier.contact || "")}</b> · ${esc(supplier.title || "")}</div>
      <div class="small">${esc(supplier.phone || "")} · ${esc(supplier.email || "")}</div>
      ${supplier.gps ? `<div class="small">GPS: ${esc(supplier.gps)}</div>` : ""}
    </div>
  </div>
  <div class="grid2" style="margin-top:10px;">
    <div class="box">
      <b>Vendor / Trading</b><br>
      <div class="small">${esc(vendor.company || "")}</div>
      <div class="small">${esc(vendor.address || "")}</div>
      <div class="small"><b>${esc(vendor.contact || "")}</b> · ${esc(vendor.title || "")}</div>
      <div class="small">${esc(vendor.phone || "")} · ${esc(vendor.email || "")}</div>
    </div>
    <div class="box">
      <b>Buyer / Billing</b><br>
      <div class="small">${esc(buyer.company || "")}</div>
      <div class="small">${esc(buyer.address || "")}</div>
      <div class="small"><b>${esc(buyer.contact || "")}</b> · ${esc(buyer.title || "")}</div>
      <div class="small">${esc(buyer.phone || "")} · ${esc(buyer.email || "")}</div>
    </div>
  </div>

  <h2>3 — Manday & Special Conditions</h2>
  <table>
    <tr><th>Category</th><th>Male</th><th>Female</th></tr>
    ${cats.map(c => `
      <tr><td>${esc(c)}</td>
      <td>${Number(staffCounts?.[c]?.male || 0)}</td>
      <td>${Number(staffCounts?.[c]?.female || 0)}</td></tr>`).join("")}
    <tr><th>Total</th><th>${totalMale}</th><th>${totalFemale}</th></tr>
  </table>

  ${special?.details ? `
    <div class="box" style="margin-top:8px;">
      <b>Special Conditions / Notes:</b>
      <div class="small">${esc(special.details)}</div>
    </div>` : ""}

  <h2>4 — Acknowledgements</h2>
  <table>
    <tr><th style="width:50%">Requester</th><th style="width:50%">Greenleaf</th></tr>
    <tr>
      <td>
        <div class="small"><b>Name:</b> ${esc(ack.requesterName || "")}</div>
        <div class="small"><b>Title/Role:</b> ${esc(ack.requesterTitle || "")}</div>
        <div class="small"><b>Date:</b> ${esc(ymd(ack.requesterDate || ""))}</div>
        ${ack.requesterSignatureUrl ? `<div><img class="sig" src="${esc(ack.requesterSignatureUrl)}" /></div>` : ""}
      </td>
      <td>
        <div class="small"><b>Name:</b> ${esc(ack.glaName || "")}</div>
        <div class="small"><b>Date:</b> ${esc(ymd(ack.glaDate || ""))}</div>
        ${ack.glaSignatureUrl ? `<div><img class="sig" src="${esc(ack.glaSignatureUrl)}" /></div>` : ""}
      </td>
    </tr>
  </table>

  <!-- Terms BEFORE copyright -->
  <p class="small" style="margin-top:6px;">
    Terms accepted: <b>${terms?.accepted ? "YES" : "NO"}</b>
    ${terms?.version ? ` · Version: ${esc(terms.version)}` : ""}
    ${terms?.url ? ` · ${esc(terms.url)}` : ""}
  </p>

  <p class="small" style="margin-top:12px;">
    © ${new Date().getFullYear()} Greenleaf Assurance · Reference <span class="mono">${esc(refId)}</span>
  </p>
</body></html>`;
}

/* ---------------------- responses ---------------------- */
const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const resHTML = (html) => ({ statusCode: 200, headers: htmlHeaders, body: html });
const resJSON = (status, obj) => ({ statusCode: status, headers: jsonHeaders, body: JSON.stringify(obj) });

/* ---------------------- handler ---------------------- */
export async function handler(event) {
  try {
    if (event.httpMethod !== "GET") return resJSON(405, { error: "Method not allowed" });

    const refId = (event.queryStringParameters?.ref || "").trim();
    if (!refId) return resJSON(400, { error: "Missing ref" });

    // Load record (local or Blobs)
    let rec = null;
    if (isLocal) {
      const p = path.join(LOCAL_DIR, `${refId}.json`);
      try {
        const raw = await fs.readFile(p, "utf8");
        rec = JSON.parse(raw);
      } catch {
        return resJSON(404, { error: "Record not found" });
      }
    } else {
      const store = makeStore();
      rec = await store.get(`records/${refId}.json`, { type: "json" });
      if (!rec) return resJSON(404, { error: "Record not found" });
    }

    // Build QR (with fallback)
    const qrValue = `https://booking.greenleafassurance.com/?ref=${encodeURIComponent(refId)}`;
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, scale: 4 });
      // console.log("QR length:", qrDataUrl?.length); // enable if you want to verify
    } catch {
      qrDataUrl = pngDataUrlFromText(qrValue);
    }

    return resHTML(renderHTML(rec, qrDataUrl));
  } catch (e) {
    console.error("booking-print error:", e);
    return resJSON(500, { error: e?.message || "Failed to render" });
  }
}