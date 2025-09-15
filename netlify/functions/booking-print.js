// netlify/functions/booking-print.js
import { makeStore } from "./_store.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import QRCode from "qrcode";

/* -------- env + storage -------- */
const isLocal = process.env.NETLIFY_DEV === "true";
const LOCAL_DIR = path.join(os.tmpdir(), "greenleaf-bookings");

// In production, talk to Blobs; in dev, we use the local JSON file written by save-booking


/* -------- helpers -------- */
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const ymd = (d) => (d ? d : "");

function pngDataUrlFromText(text) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110'>
    <rect width='100%' height='100%' fill='#f4f4f5'/>
    <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
      font-family='monospace' font-size='10'>${esc(text)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* -------- A4, brand-forward, print-first CSS -------- */
const css = /* css */ `
  :root{
    --brand:#62BBC1;
    --ink:#0b0b0c;
    --muted:#6b7280;
    --line:#e5e7eb;
    --soft:#f7f7f8;
  }
  @page { size: A4; margin: 16mm 14mm; }
  html,body { background:#fff; }
  body{
    color:var(--ink);
    font:13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .hd{
    display:flex; align-items:center; justify-content:space-between;
    padding-bottom:10px; margin-bottom:12px;
    border-bottom:3px solid var(--brand);
  }
  h1{ margin:0; font-size:18px; font-weight:600 }
  h2{
    margin:16px 0 8px; font-size:15px; font-weight:600;
    border-bottom:1px solid var(--line); padding-bottom:4px;
  }
  .muted{ color:var(--muted); }
  .small{ font-size:12px; color:#4b5563; }
  .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .box{
    background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px;
  }
  table{
    width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--line);
    border-radius:10px; overflow:hidden;
  }
  th,td{ border:1px solid var(--line); padding:7px 9px; vertical-align:top; }
  th{ background:#fafafa; text-align:left; font-weight:600; }
  .qr img{
    display:block; background:#fff; border:1px solid var(--line); border-radius:10px; padding:4px;
  }
  .sig{ height:42px; object-fit:contain }
  @media print {
    body{ margin:0 }
    .hd{ page-break-inside:avoid }
  }
`;

/* -------- HTML -------- */
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

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Booking ${esc(refId || "")}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body onload="setTimeout(()=>window.print(), 50)">
  <div class="hd">
    <div>
      <h1>Greenleaf — Service Booking</h1>
      <div class="muted small">EFNET‑QMS 005 · v3.0 · Generated ${esc(new Date().toLocaleString())}</div>
    </div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR" width="110" height="110"></div>
  </div>

  <div class="box" style="margin-bottom:10px;">
    <div>
      <b>Reference:</b> <span class="mono">${esc(refId || "")}</span>
      &nbsp; <b>Created:</b> ${esc(ts || "")}
      &nbsp; <b>Locked:</b> ${locked ? "YES" : "NO"}
    </div>
  </div>

  <h2>1 — Audit Information & Platform Data</h2>
  <table>
    <tr><th style="width:28%">Service Type</th><td>${esc(meta.auditType || "")}${meta.auditType === "Other" ? ` — ${esc(meta.auditTypeOther || "")}` : ""}</td></tr>
    <tr><th>Fulfillment</th><td>${esc(meta.fulfillment || "")}${(meta.fulfillment || "Fixed") === "Fixed" ? ` — ${esc(meta.auditDate || "")}` : ` — ${esc(meta.windowStart || "")} → ${esc(meta.windowEnd || "")}`}</td></tr>
    <tr><th>Requested Services</th><td>${esc((meta.services || []).join(", "))}</td></tr>
    <tr><th>Clients expected</th><td>${esc(meta.clientsExpected || "")}</td></tr>
    <tr><th>Platform Ref / Site</th><td>${esc(meta.platformRef || "")} · ${esc(meta.platformSite || "")}</td></tr>
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
    ${["production","permanent","temporary","migrant","contractors","homeworkers","management"].map(c => `
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
        ${ack.requesterSignatureUrl ? `<div><img class="sig" src="${esc(ack.requesterSignatureUrl)}"/></div>` : ""}
      </td>
      <td>
        <div class="small"><b>Name:</b> ${esc(ack.glaName || "")}</div>
        <div class="small"><b>Date:</b> ${esc(ymd(ack.glaDate || ""))}</div>
        ${ack.glaSignatureUrl ? `<div><img class="sig" src="${esc(ack.glaSignatureUrl)}"/></div>` : ""}
      </td>
    </tr>
  </table>

  <p class="small" style="margin-top:6px;">
    Terms accepted: <b>${terms?.accepted ? "YES" : "NO"}</b>
    ${terms?.version ? ` · Version: ${esc(terms.version)}` : ""}
    ${terms?.url ? ` · ${esc(terms.url)}` : ""}
  </p>

  <p class="small" style="margin-top:12px;">
    © ${new Date().getFullYear()} Greenleaf Assurance · Reference <span class="mono">${esc(refId || "")}</span>
  </p>
</body></html>`;
}

/* -------- responses -------- */
function resHTML(html) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Commit-Ref": process.env.COMMIT_REF || "dev"
    },
    body: html,
  };
}
function resJSON(code, body) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

/* -------- handler -------- */
export async function handler(event) {
  try {
    if (event.httpMethod !== "GET") return resJSON(405, { error: "Method not allowed" });

    const refId = (event.queryStringParameters?.ref || "").trim();
    if (!refId) return resJSON(400, { error: "Missing ref" });

    // --- DEV: read from temp file written by save-booking
    let rec;
    if (isLocal) {
      try {
        const file = path.join(LOCAL_DIR, `${refId}.json`);
        const txt = await fs.readFile(file, "utf8");
        rec = JSON.parse(txt);
      } catch {
        return resJSON(404, { error: "Not found (dev)" });
      }
    } else {
      // --- PROD: read from Blobs
      const store = makeStore();
      const key = `records/${refId}.json`;
      rec = await store.get(key, { type: "json" });
      if (!rec) return resJSON(404, { error: "Not found" });
    }

    // QR
    const qrValue = `https://booking.greenleafassurance.com/?ref=${encodeURIComponent(refId)}`;
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, scale: 4 });
    } catch {
      qrDataUrl = pngDataUrlFromText(qrValue);
    }

    // Best‑effort print event only in PROD (don’t write during dev)
    if (!isLocal) {
      try {
        const store = makeStore();
        const key = `records/${refId}.json`;
        rec.events = Array.isArray(rec.events) ? rec.events : [];
        rec.events.push({ type: "print", ts: new Date().toISOString(), actor: "user" });
        rec.version = (rec.version || 0) + 1;
        await store.set(key, JSON.stringify(rec), { contentType: "application/json" });
      } catch { /* ignore */ }
    }

    return resHTML(renderHTML(rec, qrDataUrl));
  } catch (e) {
    return resJSON(500, { error: e?.message || "Failed to render print" });
  }
}