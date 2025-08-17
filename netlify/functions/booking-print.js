// netlify/functions/booking-print.js
import { getStore } from "@netlify/blobs";
import QRCode from "qrcode";

function makeStore() {
  if (process.env.NETLIFY_DEV === "true") return getStore({ name: "bookings" });
  return getStore({
    name: "bookings",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN,
  });
}

const css = /* css */ `
  @page { size: A4; margin: 16mm 14mm; }
  html, body { background: #fff; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif; color:#111; }
  .hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .muted { color:#666; }
  h1 { font-size:16px; line-height:1.2; margin:0; }
  h2 { font-size:14px; margin:18px 0 8px; border-bottom:1px solid #ddd; padding-bottom:4px; }
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #ddd; padding:5px 7px; font-size:11.5px; vertical-align:top; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .box { border:1px solid #ddd; border-radius:8px; padding:8px; }
  .qr { border:1px solid #ddd; border-radius:8px; padding:4px; display:inline-block; background:#fff; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .sig { height:40px; object-fit:contain; }
  .small { font-size:11px; line-height:1.35; color:#555; }
`;

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const ymd = (d) => (d ? d : "");

function renderHTML(rec, qrDataUrl) {
  const { refId, form = {}, ts, locked } = rec;
  const { terms = {} } = rec; // Added for terms and conditions
  const {
    meta = {},
    requester = {},
    supplier = {},
    vendor = {},
    buyer = {},
    staffCounts = {},
    special = {},
    ack = {},
  } = form;

  const cats = ["production", "permanent", "temporary", "migrant", "contractors", "homeworkers", "management"];
  const sum = (k) => cats.reduce((a, c) => a + Number(staffCounts?.[c]?.[k] || 0), 0);
  const totalMale = sum("male"),
    totalFemale = sum("female");

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
    <div class="qr"><img src="${qrDataUrl}" alt="QR" width="110" height="110"></div>
  </div>

  <div class="box" style="margin-bottom:10px;">
    <div><b>Reference:</b> <span class="mono">${esc(refId)}</span> &nbsp; <b>Created:</b> ${esc(ts || "")} &nbsp; <b>Locked:</b> ${
    locked ? "YES" : "NO"
  }</div>
  </div>

  <h2>1 — Audit Information & Platform Data</h2>
  <table>
    <tr><th style="width:28%">Service Type</th><td>${esc(meta.auditType)}${
    meta.auditType === "Other" ? ` — ${esc(meta.auditTypeOther)}` : ""
  }</td></tr>
    <tr><th>Fulfillment</th><td>${esc(meta.fulfillment)}${
    meta.fulfillment === "Fixed" ? ` — ${esc(meta.auditDate)}` : ` — ${esc(meta.windowStart)} → ${esc(meta.windowEnd)}`
  }</td></tr>
    <tr><th>Requested Services</th><td>${esc((meta.services || []).join(", "))}</td></tr>
    <tr><th>Clients expected</th><td>${esc(meta.clientsExpected)}</td></tr>
    <tr><th>Platform Ref / Site</th><td>${esc(meta.platformRef)}  ·  ${esc(meta.platformSite)}</td></tr>
    <tr><th>Factory / Requester ID</th><td>${esc(meta.factoryOrRequesterId)}</td></tr>
  </table>

  <h2>2 — Parties & Contacts</h2>
  <div class="grid2">
    <div class="box">
      <b>Requester (Lead Account)</b><br>
      <div class="small">${esc(requester.company)}</div>
      <div class="small">${esc(requester.address)}</div>
      <div class="small"><b>${esc(requester.contact)}</b> · ${esc(requester.title)}</div>
      <div class="small">${esc(requester.phone)} · ${esc(requester.email)}</div>
      ${requester.gps ? `<div class="small">GPS: ${esc(requester.gps)}</div>` : ""}
    </div>
    <div class="box">
      <b>Supplier / Factory</b><br>
      <div class="small">${esc(supplier.company)}</div>
      <div class="small">${esc(supplier.address)}</div>
      <div class="small"><b>${esc(supplier.contact)}</b> · ${esc(supplier.title)}</div>
      <div class="small">${esc(supplier.phone)} · ${esc(supplier.email)}</div>
      ${supplier.gps ? `<div class="small">GPS: ${esc(supplier.gps)}</div>` : ""}
    </div>
  </div>
  <div class="grid2" style="margin-top:10px;">
    <div class="box">
      <b>Vendor / Trading</b><br>
      <div class="small">${esc(vendor.company)}</div>
      <div class="small">${esc(vendor.address)}</div>
      <div class="small"><b>${esc(vendor.contact)}</b> · ${esc(vendor.title)}</div>
      <div class="small">${esc(vendor.phone)} · ${esc(vendor.email)}</div>
    </div>
    <div class="box">
      <b>Buyer / Billing</b><br>
      <div class="small">${esc(buyer.company)}</div>
      <div class="small">${esc(buyer.address)}</div>
      <div class="small"><b>${esc(buyer.contact)}</b> · ${esc(buyer.title)}</div>
      <div class="small">${esc(buyer.phone)} · ${esc(buyer.email)}</div>
    </div>
  </div>

  <h2>3 — Manday & Special Conditions</h2>
  <table>
    <tr><th>Category</th><th>Male</th><th>Female</th></tr>
    ${cats
      .map(
        (c) => `
      <tr><td>${esc(c)}</td>
      <td>${Number(staffCounts?.[c]?.male || 0)}</td>
      <td>${Number(staffCounts?.[c]?.female || 0)}</td></tr>`
      )
      .join("")}
    <tr><th>Total</th><th>${totalMale}</th><th>${totalFemale}</th></tr>
  </table>

  ${
    special?.details
      ? `
  <div class="box" style="margin-top:8px;">
    <b>Special Conditions / Notes:</b>
    <div class="small">${esc(special.details)}</div>
  </div>`
      : ""
  }

  <h2>4 — Acknowledgements</h2>
  <table>
    <tr>
      <th style="width:50%">Requester</th>
      <th style="width:50%">Greenleaf</th>
    </tr>
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

  <p class="small" style="margin-top:12px;">
    © ${new Date().getFullYear()} Greenleaf Assurance · Reference <span class="mono">${esc(refId)}</span>
  </p>
  <p class="small" style="margin-top:6px;">
  Terms accepted: <b>${terms.accepted ? "YES" : "NO"}</b>
  ${terms.version ? ` · Version: ${esc(terms.version)}` : ""}
  ${terms.url ? ` · ${esc(terms.url)}` : ""}
</p>
</body></html>`;
}

function resHTML(html) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
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

export async function handler(event) {
  try {
    const refId = (event.queryStringParameters?.ref || "").trim();
    if (!refId) return resJSON(400, { error: "Missing ref" });

    const store = makeStore();
    const key = `records/${refId}.json`;
    const rec = await store.get(key, { type: "json" });
    if (!rec) return resJSON(404, { error: "Not found" });

    // Generate a crisp inline QR for the top-right badge
    const qrValue = `https://booking.greenleafassurance.com/?ref=${encodeURIComponent(refId)}`;
    const qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, scale: 4 });

    // Log a print event (best-effort)
    try {
      rec.events = Array.isArray(rec.events) ? rec.events : [];
      rec.events.push({ type: "print", ts: new Date().toISOString(), actor: "user" });
      rec.version = (rec.version || 0) + 1;
      await store.set(key, JSON.stringify(rec), { contentType: "application/json" });
    } catch { /* ignore */ }

    return resHTML(renderHTML(rec, qrDataUrl));
  } catch (e) {
    return resJSON(500, { error: e.message || "Failed to render print" });
  }
}