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

/* ---------- A4, brand-forward, print-first CSS ---------- */
const css = /* css */ `
  :root{
    --brand:#62BBC1;
    --ink:#0b0b0c;
    --muted:#5b6776;
    --line:#e5e7eb;
    --soft:#f7f8fa;
  }

  @page { size: A4; margin: 16mm 14mm; }

  html, body { background:#fff; }
  body {
    color:var(--ink);
    font: 12.5px/1.5 -apple-system, system-ui, Segoe UI, Roboto, Arial, sans-serif;
  }

  /* Header */
  .hd {
    display:flex; align-items:center; justify-content:space-between;
    padding: 0 0 10px 0;
    border-bottom: 3px solid var(--brand);
    margin-bottom: 14px;
  }
  .title { margin:0; font-size:18px; letter-spacing:.2px; }
  .subtle { color:var(--muted); font-size:11.5px; }

  .qr { display:inline-block; padding:6px; border:1px solid var(--line); border-radius:12px; background:#fff; }

  /* Section */
  .section { margin-top: 16px; }
  .section h2{
    display:flex; align-items:center; gap:8px;
    font-size:13.5px; margin:0 0 8px 0;
    padding-bottom:6px;
    border-bottom:1px solid var(--line);
  }
  .badge{
    display:inline-block; min-width:22px; text-align:center;
    padding:.5px 8px; border-radius:999px;
    background:color-mix(in srgb, var(--brand) 18%, white);
    color:#05545a; font-weight:600; font-size:11.5px;
    border:1px solid color-mix(in srgb, var(--brand) 60%, white);
  }

  /* Cards / grid */
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .card{
    border:1px solid var(--line); border-radius:12px; background:#fff;
    padding:10px 12px;
  }

  /* Tables */
  table { width:100%; border-collapse:separate; border-spacing:0; }
  th, td { font-size:12px; vertical-align:top; padding:7px 9px; border:1px solid var(--line); }
  th { background:var(--soft); text-align:left; width:32%; }
  tbody tr:nth-child(odd) td { background: #fafcff; } /* gentle zebra */
  .t-compact th, .t-compact td { padding:6px 8px; }

  /* Utilities */
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size:11.25px; color:var(--muted); }
  .sig { height:42px; object-fit:contain; }

  /* Print niceties */
  @media print {
    .no-print { display:none !important; }
  }
`;

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const ymd = (d) => (d ? d : "");

function renderHTML(rec, qrDataUrl) {
  const { refId, form = {}, ts, locked } = rec;
  const { terms = {} } = rec;
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
  const totalMale = sum("male");
  const totalFemale = sum("female");

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Booking ${esc(refId)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
</head>
<body onload="setTimeout(()=>window.print(), 50)">
  <!-- Header -->
  <div class="hd">
    <div>
      <h1 class="title">Greenleaf — Service Booking</h1>
      <div class="subtle">EFNET‑QMS 005 · v3.0 · Generated ${esc(new Date().toLocaleString())}</div>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR" width="110" height="110">
    </div>
  </div>

  <!-- Top meta -->
  <div class="card" style="margin-bottom:10px;">
    <div class="small">
      <b>Reference:</b> <span class="mono">${esc(refId)}</span>
      &nbsp;·&nbsp;<b>Created:</b> ${esc(ts || "")}
      &nbsp;·&nbsp;<b>Locked:</b> ${locked ? "YES" : "NO"}
    </div>
  </div>

  <!-- 1 -->
  <section class="section">
    <h2><span class="badge">1</span> Audit Information & Platform Data</h2>
    <table class="t-compact">
      <tr><th>Service Type</th><td>${esc(meta.auditType)}${meta.auditType === "Other" ? ` — ${esc(meta.auditTypeOther)}` : ""}</td></tr>
      <tr><th>Fulfillment</th><td>${esc(meta.fulfillment)}${meta.fulfillment === "Fixed" ? ` — ${esc(meta.auditDate)}` : ` — ${esc(meta.windowStart)} → ${esc(meta.windowEnd)}`}</td></tr>
      <tr><th>Requested Services</th><td>${esc((meta.services || []).join(", "))}</td></tr>
      <tr><th>Clients expected</th><td>${esc(meta.clientsExpected)}</td></tr>
      <tr><th>Platform Ref / Site</th><td>${esc(meta.platformRef)} · ${esc(meta.platformSite)}</td></tr>
      <tr><th>Factory / Requester ID</th><td>${esc(meta.factoryOrRequesterId)}</td></tr>
    </table>
  </section>

  <!-- 2 -->
  <section class="section">
    <h2><span class="badge">2</span> Parties & Contacts</h2>
    <div class="grid2">
      <div class="card">
        <b>Requester (Lead Account)</b><br>
        <div class="small">${esc(requester.company)}</div>
        <div class="small">${esc(requester.address)}</div>
        <div class="small"><b>${esc(requester.contact)}</b> · ${esc(requester.title)}</div>
        <div class="small">${esc(requester.phone)} · ${esc(requester.email)}</div>
        ${requester.gps ? `<div class="small">GPS: ${esc(requester.gps)}</div>` : ""}
      </div>
      <div class="card">
        <b>Supplier / Factory</b><br>
        <div class="small">${esc(supplier.company)}</div>
        <div class="small">${esc(supplier.address)}</div>
        <div class="small"><b>${esc(supplier.contact)}</b> · ${esc(supplier.title)}</div>
        <div class="small">${esc(supplier.phone)} · ${esc(supplier.email)}</div>
        ${supplier.gps ? `<div class="small">GPS: ${esc(supplier.gps)}</div>` : ""}
      </div>
    </div>
    <div class="grid2" style="margin-top:12px;">
      <div class="card">
        <b>Vendor / Trading</b><br>
        <div class="small">${esc(vendor.company)}</div>
        <div class="small">${esc(vendor.address)}</div>
        <div class="small"><b>${esc(vendor.contact)}</b> · ${esc(vendor.title)}</div>
        <div class="small">${esc(vendor.phone)} · ${esc(vendor.email)}</div>
      </div>
      <div class="card">
        <b>Buyer / Billing</b><br>
        <div class="small">${esc(buyer.company)}</div>
        <div class="small">${esc(buyer.address)}</div>
        <div class="small"><b>${esc(buyer.contact)}</b> · ${esc(buyer.title)}</div>
        <div class="small">${esc(buyer.phone)} · ${esc(buyer.email)}</div>
      </div>
    </div>
  </section>

  <!-- 3 -->
  <section class="section">
    <h2><span class="badge">3</span> Manday & Special Conditions</h2>
    <table>
      <thead>
        <tr><th style="width:40%">Category</th><th>Male</th><th>Female</th></tr>
      </thead>
      <tbody>
        ${["production","permanent","temporary","migrant","contractors","homeworkers","management"].map(c => `
          <tr><td>${esc(c)}</td>
          <td>${Number(staffCounts?.[c]?.male || 0)}</td>
          <td>${Number(staffCounts?.[c]?.female || 0)}</td></tr>`).join("")}
        <tr><th>Total</th><th>${totalMale}</th><th>${totalFemale}</th></tr>
      </tbody>
    </table>

    ${special?.details ? `
      <div class="card" style="margin-top:10px;">
        <b>Special Conditions / Notes</b>
        <div class="small" style="margin-top:4px;">${esc(special.details)}</div>
      </div>
    ` : ""}
  </section>

  <!-- 4 -->
  <section class="section">
    <h2><span class="badge">4</span> Acknowledgements</h2>
    <table class="t-compact">
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
  </section>

  <!-- Terms first, then copyright -->
  <p class="small" style="margin-top:10px;">
    Terms accepted: <b>${terms.accepted ? "YES" : "NO"}</b>
    ${terms.version ? ` · Version: ${esc(terms.version)}` : ""}
    ${terms.url ? ` · ${esc(terms.url)}` : ""}
  </p>
  <p class="small" style="margin-top:6px;">
    © ${new Date().getFullYear()} Greenleaf Assurance · Reference <span class="mono">${esc(refId)}</span>
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

    // Branded, crisp inline QR for top-right
    const qrValue = `https://booking.greenleafassurance.com/?ref=${encodeURIComponent(refId)}`;
    const qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, scale: 4 });

    // Best‑effort print event
    try {
      rec.events = Array.isArray(rec.events) ? rec.events : [];
      rec.events.push({ type: "print", ts: new Date().toISOString(), actor: "user" });
      rec.version = (rec.version || 0) + 1;
      await store.set(key, JSON.stringify(rec), { contentType: "application/json" });
    } catch {}

    return resHTML(renderHTML(rec, qrDataUrl));
  } catch (e) {
    return resJSON(500, { error: e.message || "Failed to render print" });
  }
}