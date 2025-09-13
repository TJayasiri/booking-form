// BookingFormApp.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Logo from "./assets/greenleaf-logo.svg";

/** ---------- Shared constants ---------- */
const STAGES = [
  ["APPLICATION_SUBMITTED", "Application submitted"],
  ["ACCEPTED_INITIATED", "Accepted & initiated (locked)"],
  ["ESTIMATE_INVOICE_ISSUED", "Estimate/Invoice issued"],
  ["AGREEMENT_GENERATED", "Agreement generated"],
  ["SCHEDULE_RELEASED", "Schedule released"],
  ["REPORT_ACTION_TAKEN", "Report / Action taken"],
  ["FOLLOW_UP", "Follow-up (if applicable)"],
  ["COMPLETED", "Job completed"],
];

/** ---------- Status Ribbon (React) ---------- */
function StatusRibbon({ refId }) {
  const [job, setJob] = useState(null);        // { current_stage, due_at, ... }
  const [history, setHistory] = useState([]);  // [{ stage, at }, ...]
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!refId) return;
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`/api/job?ref=${encodeURIComponent(refId)}`);
        if (!r.ok) return;
        const data = await r.json();
        if (abort) return;
        setJob(data.job || null);
        setHistory(Array.isArray(data.history) ? data.history : []);
      } catch {
        /* silent */
      }
    })();
    return () => { abort = true; };
  }, [refId]);

  const content = useMemo(() => {
    if (!job) return null;
    const idx = Math.max(
      0,
      STAGES.findIndex(([key]) => key === (job.current_stage || "APPLICATION_SUBMITTED"))
    );
    const dateMap = new Map(history.map((h) => [h.stage, new Date(h.at)]));
    const target = job.due_at ? new Date(job.due_at).getTime() : Date.now() + 10 * 24 * 3600 * 1000;
    const ms = Math.max(0, target - now);
    const hh = Math.floor(ms / 3600000);
    const mm = Math.floor((ms % 3600000) / 60000);
    const ss = Math.floor((ms % 60000) / 1000);
    const countdown = ms === 0 ? "Due now" : `Time remaining: ${hh}h ${mm}m ${ss}s`;
    return { idx, dateMap, countdown };
  }, [job, history, now]);

  if (!job || !content) return null;

  return (
    <div className="sticky top-0 z-50 border-b-4 border-[#62BBC1] bg-[#0b0b0c] text-white">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="mr-2">Status • {refId}</strong>
          {STAGES.map(([key, label], i) => {
            const done = i <= content.idx;
            const isLockedStage = key === "ACCEPTED_INITIATED" && i === content.idx;
            const dot = isLockedStage ? "#0ea5e9" : "#62BBC1";
            const dt = content.dateMap.get(key);
            return (
              <div key={key} className="flex items-center gap-2" title={label}>
                <span
                  className="inline-block rounded-full border"
                  style={{
                    width: 10,
                    height: 10,
                    background: done ? dot : "#374151",
                    borderColor: done ? dot : "#64748b",
                  }}
                />
                <div>
                  <div className="text-[12px] font-bold leading-4">{label}</div>
                  {dt && <div className="text-[11px] text-slate-300 leading-4">{dt.toLocaleString()}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="font-bold [font-variant-numeric:tabular-nums]">{content.countdown}</div>
      </div>
    </div>
  );
}

/** ---------- Main App ---------- */
export default function BookingFormApp() {
  // Helpers
  const genRef = () => {
    const y = new Date().getFullYear().toString().slice(-2);
    const stamp = Date.now().toString().slice(-6);
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GLB-${y}-${stamp}-${rand}`;
  };

  // Required-field UI state
  const [touched, setTouched] = useState({});
  const mark = (name) => setTouched((t) => ({ ...t, [name]: true }));

  // App state
  const [step, setStep] = useState(1);
  const [locked, setLocked] = useState(false);
  const [refId, setRefId] = useState(genRef());
  const [showQR, setShowQR] = useState(false);
  const [ackTnC, setAckTnC] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Core form state
  const [form, setForm] = useState(() => ({
    meta: {
      auditType: "ETI",
      auditTypeOther: "",
      fulfillment: "Fixed",
      auditDate: "",
      windowStart: "",
      windowEnd: "",
      services: [],
      clientsExpected: "",
      platformRef: "",
      platformSite: "",
      factoryOrRequesterId: "",
      // NEW
      status: "active", // "active" | "cancelled"
      cancel: { reason: "", at: "" }, // ISO datetime + reason
    },
    requester: { company: "", address: "", contact: "", title: "", phone: "", email: "", other: "", gps: "" },
    supplier:  { sameAsRequester: false, company: "", address: "", contact: "", title: "", phone: "", email: "", other: "", gps: "" },
    vendor:    { sameAsSupplier: false, company: "", address: "", contact: "", title: "", phone: "", email: "", other: "" },
    buyer:     { differentData: false, company: "", address: "", contact: "", title: "", phone: "", email: "", other: "" },
    staffCounts: {
      production: { male: 0, female: 0 },
      permanent: { male: 0, female: 0 },
      temporary: { male: 0, female: 0 },
      migrant: { male: 0, female: 0 },
      contractors: { male: 0, female: 0 },
      homeworkers: { male: 0, female: 0 },
      management: { male: 0, female: 0 },
      migrantNationalities: "",
    },
    special: { details: "" },
    ack: {
      requesterName: "", requesterTitle: "", requesterDate: "", requesterSignatureUrl: "",
      glaName: "", glaDate: "", glaSignatureUrl: "",
    },
  }));

  // ---- Cancel / Undo handlers (must live inside component so they can call setForm)
  const markCancelled = (reason) => {
    setForm(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        status: "cancelled",
        cancel: { reason: reason || "Cancelled by requester", at: new Date().toISOString() }
      }
    }));
  };
  const undoCancelled = () => {
    setForm(prev => ({
      ...prev,
      meta: { ...prev.meta, status: "active", cancel: { reason: "", at: "" } }
    }));
  };

  // Copy supplier from requester
  useEffect(() => {
    if (!form.supplier.sameAsRequester) return;
    const src = form.requester, dst = form.supplier;
    const needsUpdate = ["company","address","contact","title","phone","email","other","gps"]
      .some(k => (src[k] || "") !== (dst[k] || ""));
    if (needsUpdate) {
      setForm(prev => ({
        ...prev,
        supplier: {
          ...prev.supplier,
          company: src.company, address: src.address, contact: src.contact, title: src.title,
          phone: src.phone, email: src.email, other: src.other, gps: src.gps,
        },
      }));
    }
  }, [form.supplier.sameAsRequester, form.requester]);

  // Copy vendor from supplier
  useEffect(() => {
    if (!form.vendor.sameAsSupplier) return;
    const src = form.supplier, dst = form.vendor;
    const needsUpdate = ["company","address","contact","title","phone","email","other"]
      .some(k => (src[k] || "") !== (dst[k] || ""));
    if (needsUpdate) {
      setForm(prev => ({
        ...prev,
        vendor: {
          ...prev.vendor,
          company: src.company, address: src.address, contact: src.contact, title: src.title,
          phone: src.phone, email: src.email, other: src.other,
        },
      }));
    }
  }, [form.vendor.sameAsSupplier, form.supplier]);

  // Totals
  function sumMaleFemale(counts, key) {
    const keys = ["production", "permanent", "temporary", "migrant", "contractors", "homeworkers", "management"];
    return keys.reduce((acc, k) => acc + (Number(counts[k]?.[key] || 0)), 0);
  }
  const totalMale = useMemo(() => sumMaleFemale(form.staffCounts, "male"), [form.staffCounts]);
  const totalFemale = useMemo(() => sumMaleFemale(form.staffCounts, "female"), [form.staffCounts]);
  const totalAll = totalMale + totalFemale;

  // Validation
  const basicValid = useMemo(() => {
    const m = form.meta; const r = form.requester; const s = form.supplier;
    return r.company && r.contact && r.email &&
           s.company && s.contact && s.email &&
           (m.auditDate || (m.windowStart && m.windowEnd)) &&
           ackTnC;
  }, [form, ackTnC]);

  // Persistence (local JSON)
  const fileInputRef = useRef(null);
  const saveJson = async () => {
    try {
      setSaving(true);
      const payload = {
        refId,
        form,
        ts: new Date().toISOString(),
        terms: {
          accepted: true,
          version: "2024-12-06",
          url: "https://greenleafassurance.com/legal/terms",
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${refId}_booking.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };
  const loadJson = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.refId) setRefId(data.refId);
        if (data.form) setForm(data.form);
      } catch { alert("Invalid JSON file."); }
    };
    reader.readAsText(file);
  };

  // Submit
  const onSubmit = async () => {
    [
      "requester.company", "requester.contact", "requester.email",
      "supplier.company", "supplier.contact", "supplier.email",
      "meta.dateOrWindow",
    ].forEach(mark);

    if (!basicValid) { alert("Please complete required fields and accept Terms."); return; }
    if (locked) { alert("This booking is locked by Greenleaf and can no longer be edited."); return; }

    const payload = {
      refId,
      form,
      ts: new Date().toISOString(),
      terms: {
        accepted: true, // or ackTnC
        version: "2025-08-17",
        url: "https://greenleafassurance.com/policies/terms-of-service",
      },
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/save-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 423) {
          alert("This booking is locked by Greenleaf and can no longer be edited.");
        } else {
          const txt = await res.text().catch(() => "");
          alert(`Could not save booking. ${txt || "Please try again."}`);
        }
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("ref", refId);
      window.history.replaceState(null, "", url.toString());

      setShowQR(true);
      setStep(4);
      setSaveMsg(`Saved ✓ Reference ${refId}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSaveMsg(""), 8000);
    } catch (err) {
      alert(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Load via ?ref=
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    (async () => {
      try {
        const res = await fetch("/api/get-booking?ref=" + encodeURIComponent(ref));
        if (!res.ok) return;
        const data = await res.json();
        if (data.refId) setRefId(data.refId);
        if (data.form) setForm(data.form);
        if (typeof data.locked === "boolean") setLocked(data.locked);
        setShowQR(true);
        setStep(4);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QR text
  const qrValue = `https://booking.greenleafassurance.com/?ref=${encodeURIComponent(refId)}`;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Ribbon */}
      <StatusRibbon refId={refId} />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={Logo} alt="Greenleaf Assurance" className="h-8 md:h-9 select-none" />
          <div className="flex-1">
            <h1 className="text-lg md:text-xl font-semibold leading-tight">Greenleaf – Service Booking Form</h1>
            <p className="text-xs md:text-sm text-neutral-500">
              EFNET-QMS 005 · v3.0 · Reference <span className="font-mono">{refId}</span>
            </p>

            {/* subtle cancelled badge under the title when cancelled */}
            {form.meta.status === "cancelled" && (
              <div className="mt-1 inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs text-red-700 border-red-300 bg-red-50">
                Order Cancelled{form.meta.cancel?.reason ? ` — ${form.meta.cancel.reason}` : ""}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => { setRefId(genRef()); setShowQR(false); }}
              className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm"
            >
              New Ref
            </button>
            <button
              onClick={saveJson}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm"
            >
              Load Draft
            </button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={loadJson} />
            <button
              onClick={() => window.print()}
              className="px-3 py-2 rounded-xl border border-brand text-brand hover:bg-brand/10 text-sm"
            >
              Print
            </button>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-6xl mx-auto px-4 mt-4 print:hidden">
        <Stepper step={step} setStep={setStep} />
      </div>

      {/* Save banner */}
      {saveMsg && (
        <div className="max-w-6xl mx-auto px-4 mt-3 print:hidden">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>{saveMsg}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                className="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-100"
                title="Copy link to this booking"
              >
                Copy link
              </button>
              <a
                href={`/api/booking-print?ref=${encodeURIComponent(refId)}`}
                target="_blank" rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                title="Open precise A4 layout and print"
              >
                Precise Print (A4)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {step === 1 && (
          <SectionCard title="1 — Service Information & Platform Data (if any)">
            <ReadOnlyCurtain locked={locked}>
              <AuditMeta form={form} setForm={setForm} touched={touched} mark={mark} />
            </ReadOnlyCurtain>
          </SectionCard>
        )}

        {step === 2 && (
          <SectionCard title="2 — Parties & Contacts">
            <ReadOnlyCurtain locked={locked}>
              <Parties form={form} setForm={setForm} />
            </ReadOnlyCurtain>
          </SectionCard>
        )}

        {step === 3 && (
          <SectionCard title="3 — Manday Calculation & Special Conditions">
            <ReadOnlyCurtain locked={locked}>
              <Manday form={form} setForm={setForm} totals={{ totalMale, totalFemale, totalAll }} />
            </ReadOnlyCurtain>
          </SectionCard>
        )}

        {step === 4 && (
          <SectionCard title="4 — Review, Acknowledgement & QR">
            {/* Cancel / Undo control appears here */}
            <div className="mb-3 flex items-center justify-between">
              {form.meta.status !== "cancelled" ? (
                <button
                  type="button"
                  className="px-3 py-2 rounded-md border text-sm bg-white hover:bg-neutral-50"
                  onClick={() => {
                    const r = prompt("Add a short reason for cancelling (optional):", "");
                    markCancelled(r || "");
                  }}
                >
                  Mark as Cancelled
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs text-red-700 border-red-300 bg-red-50">
                    Cancelled{form.meta.cancel?.reason ? ` — ${form.meta.cancel.reason}` : ""}
                    {form.meta.cancel?.at ? ` • ${new Date(form.meta.cancel.at).toLocaleString()}` : ""}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-md border text-sm bg-white hover:bg-neutral-50"
                    onClick={undoCancelled}
                  >
                    Undo Cancel
                  </button>
                </div>
              )}
            </div>

            <Review
              form={form}
              setForm={setForm}
              refId={refId}
              ackTnC={ackTnC}
              setAckTnC={setAckTnC}
              showQR={showQR}
              qrValue={qrValue}
            />
          </SectionCard>
        )}

        {/* Footer Controls */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-neutral-200 bg-gradient-to-t from-white to-white/80 px-0 py-4 backdrop-blur print:hidden">
          <div className="text-xs text-neutral-500">
            {locked
              ? "This booking is locked by Greenleaf and cannot be edited."
              : <>Tip: Use <span className="font-semibold">Save Draft</span> to download a JSON you can load later.</>}
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={step <= 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 disabled:opacity-60"
            >
              Back
            </button>

            {step < 4 && (
              <button
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="px-4 py-2 rounded-xl bg-brand text-white"
              >
                Next
              </button>
            )}

            {step === 4 && (
              <a
                href={`/api/booking-print?ref=${encodeURIComponent(refId)}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50"
                title="Open precise A4 layout and print"
              >
                Precise Print (A4)
              </a>
            )}

            {step === 4 && !locked && (
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-brand-dark text-white disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Generate QR & Submit"}
              </button>
            )}

            {step === 4 && locked && (
              <span className="px-3 py-2 rounded-xl bg-neutral-200 text-neutral-600">Locked</span>
            )}
          </div>
        </div>

        {/* Branded footer */}
        <footer className="max-w-6xl mx-auto px-4 mt-4">
          <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-xs text-neutral-500">
            <span>© {new Date().getFullYear()} Greenleaf Assurance. All rights reserved.</span>
            <a className="text-brand hover:underline" href="mailto:info@greenleafassurance.com">info@greenleafassurance.com</a>
          </div>
        </footer>
      </main>

      {/* Print QR badge */}
      {showQR && (
        <div className="print:block hidden absolute right-4 top-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-2 text-center">
            <QRCodeSVG value={qrValue} size={96} />
            <div className="mt-1 text-[10px] font-mono">{refId}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------- UI Components ----------------------- */

function SectionCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <h2 className="text-base md:text-lg font-semibold">{title}</h2>
        <span className="text-xs text-neutral-400">QR replaces barcodes · Printable</span>
      </div>
      <div className="space-y-6 p-5 md:p-6">{children}</div>
    </section>
  );
}

function Stepper({ step, setStep }) {
  const steps = [
    { id: 1, label: "Service Info" },
    { id: 2, label: "Parties" },
    { id: 3, label: "Manday" },
    { id: 4, label: "Review & QR" },
  ];
  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <li key={s.id} className="group select-none cursor-pointer" onClick={() => setStep(s.id)}>
          <div
            className={`flex items-center gap-2 rounded-xl border p-2 text-sm ${
              step === s.id
                ? "border-brand/50 bg-brand/10 text-brand-dark"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-lg font-semibold ${
                step === s.id ? "bg-brand text-white" : "bg-neutral-100"
              }`}
            >
              {i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, required = false, children, note }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {required && <span className="text-xs text-rose-600">*</span>}
        {note && <span className="text-[11px] text-neutral-500">{note}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/40 ${className}`}
    />
  );
}
function Textarea({ className = "", ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/40 ${className}`}
    />
  );
}
function Checkbox({ className = "", ...props }) {
  return (
    <input
      type="checkbox"
      {...props}
      className={`h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand/40 ${className}`}
    />
  );
}
function NumberInput(props) { return <Input type="number" min={0} step={1} {...props} />; }

/* ----------------------- Sections ----------------------- */

function AuditMeta({ form, setForm, touched, mark }) {
  const m = form.meta;
  const set = (patch) => setForm((prev) => ({ ...prev, meta: { ...prev.meta, ...patch } }));

  const dateMissing = m.fulfillment === "Window"
    ? !(m.windowStart && m.windowEnd)
    : !(m.auditDate);

  const SERVICE_CHOICES = [
    "ETI",
    "Quality Inspection",
    "Social Audit Risk Assessment",
    "Training",
    "VAP-Consulting",
    "Other Standards",
  ];
  const toggleService = (name) => {
    const next = new Set(m.services || []);
    next.has(name) ? next.delete(name) : next.add(name);
    set({ services: Array.from(next) });
  };

  return (
    <div className="space-y-6">
      {/* Service Type & Fulfillment */}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Service Type" required>
          <div className="flex flex-wrap items-center gap-3">
            {["ETI", "Inspection", "Training", "VAP-Consulting", "Other Standards"].map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="serviceType"
                  value={t}
                  checked={m.auditType === t}
                  onChange={(e) => set({ auditType: e.target.value })}
                />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
        </Field>

        {m.auditType === "Other" && (
          <Field label="If Other, specify">
            <Input
              value={m.auditTypeOther || ""}
              onChange={(e) => set({ auditTypeOther: e.target.value })}
              placeholder="e.g., Special follow-up"
            />
          </Field>
        )}

        <Field label="Fulfillment" required>
          <div className="flex items-center gap-4">
            {["Fixed", "Window"].map((f) => (
              <label key={f} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="fulfillment"
                  value={f}
                  checked={(m.fulfillment || "Fixed") === f}
                  onChange={(e) => set({ fulfillment: e.target.value })}
                  onBlur={() => mark("meta.dateOrWindow")}
                />
                <span className="text-sm">{f}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>

      {/* Dates */}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={m.fulfillment === "Window" ? "Fixed Date (disabled)" : "Fixed Date"}>
          <Input
            type="date"
            disabled={m.fulfillment === "Window"}
            value={m.auditDate || ""}
            onChange={(e) => set({ auditDate: e.target.value })}
            onBlur={() => mark("meta.dateOrWindow")}
            className={touched["meta.dateOrWindow"] && dateMissing && m.fulfillment !== "Window" ? "input-invalid" : ""}
          />
        </Field>
        <Field label="Window Start" note={m.fulfillment === "Fixed" ? "(optional)" : "(required)"}>
          <Input
            type="date"
            value={m.windowStart || ""}
            onChange={(e) => set({ windowStart: e.target.value })}
            onBlur={() => mark("meta.dateOrWindow")}
            className={touched["meta.dateOrWindow"] && dateMissing && m.fulfillment === "Window" ? "input-invalid" : ""}
          />
        </Field>
        <Field label="Window End" note={m.fulfillment === "Fixed" ? "(optional)" : "(required)"}>
          <Input
            type="date"
            value={m.windowEnd || ""}
            onChange={(e) => set({ windowEnd: e.target.value })}
            onBlur={() => mark("meta.dateOrWindow")}
            className={touched["meta.dateOrWindow"] && dateMissing && m.fulfillment === "Window" ? "input-invalid" : ""}
          />
        </Field>
      </div>

      {/* Services offered */}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Requested Services">
          <div className="flex flex-wrap gap-2">
            {SERVICE_CHOICES.map((s) => {
              const active = (m.services || []).includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleService(s)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    active ? "border-brand bg-brand text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
        {(m.services || []).includes("Other") && (
          <Field label="If Other, describe">
            <Input
              value={m.auditTypeOther || ""}
              onChange={(e) => set({ auditTypeOther: e.target.value })}
              placeholder="e.g., Custom assessment"
            />
          </Field>
        )}
      </div>

      {/* Platform / references */}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Clients expected to receive this report">
          <Textarea
            rows={3}
            value={m.clientsExpected || ""}
            onChange={(e) => set({ clientsExpected: e.target.value })}
            placeholder="List buyer/brand names"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Platform / Program Reference #">
            <Input value={m.platformRef || ""} onChange={(e) => set({ platformRef: e.target.value })} placeholder="e.g., Sedex ZC-xxxx" />
          </Field>
          <Field label="Platform Site # / Facility ID">
            <Input value={m.platformSite || ""} onChange={(e) => set({ platformSite: e.target.value })} placeholder="e.g., ZS-xxxx" />
          </Field>
          <Field label="Factory / Requester Internal ID">
            <Input value={m.factoryOrRequesterId || ""} onChange={(e) => set({ factoryOrRequesterId: e.target.value })} placeholder="Internal code if any" />
          </Field>
        </div>
      </div>

      {/* Requester & Supplier */}
      <div className="grid gap-4 md:grid-cols-2">
        <ContactBlock
          title="Requester (Lead Account)"
          data={form.requester}
          onChange={(patch) => setForm((prev) => ({ ...prev, requester: { ...prev.requester, ...patch } }))}
          required
          prefix="requester"
          touched={touched}
          mark={mark}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-700">Supplier / Factory</div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!form.supplier.sameAsRequester}
                onChange={(e) =>
                  setForm((p) => ({ ...p, supplier: { ...p.supplier, sameAsRequester: e.target.checked } }))
                }
              />
              <span>Same as Requester</span>
            </label>
          </div>
          <ContactBlock
            data={form.supplier}
            onChange={(patch) => setForm((prev) => ({ ...prev, supplier: { ...prev.supplier, ...patch } }))}
            required
            prefix="supplier"
            touched={touched}
            mark={mark}
          />
        </div>
      </div>
    </div>
  );
}

function Parties({ form, setForm }) {
  const v = form.vendor; const b = form.buyer;
  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Vendor / Trading Company</h3>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={v.sameAsSupplier}
                onChange={(e) => setForm((p) => ({ ...p, vendor: { ...p.vendor, sameAsSupplier: e.target.checked } }))}
              />
              <span>Same as Supplier</span>
            </label>
          </div>
          <ContactBlock
            data={v}
            onChange={(patch) => setForm((prev) => ({ ...prev, vendor: { ...prev.vendor, ...patch } }))}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Buyer / Other Party (Billing)</h3>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={b.differentData}
                onChange={(e) => setForm((p) => ({ ...p, buyer: { ...p.buyer, differentData: e.target.checked } }))}
              />
              <span>Different Billing Data</span>
            </label>
          </div>
          {b.differentData ? (
            <ContactBlock data={b} onChange={(patch) => setForm((prev) => ({ ...prev, buyer: { ...prev.buyer, ...patch } }))} />
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-neutral-500">
              If unchecked, billing will follow <span className="font-medium">Requester</span> details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactBlock({ title, data, onChange, required = false, prefix = "", touched = {}, mark = () => {} }) {
  const set = (patch) => onChange(patch);
  const req = (k) => (touched[`${prefix}.${k}`] && !data[k]) ? "input-invalid" : "";

  return (
    <div className="grid grid-cols-1 gap-3">
      {title && <div className="text-sm font-medium text-neutral-700">{title}</div>}
      <Field label="Company Name" required={required}>
        <Input value={data.company || ""} onChange={(e) => set({ company: e.target.value })} onBlur={() => mark(`${prefix}.company`)} className={req("company")} />
      </Field>
      <Field label="Address">
        <Textarea rows={2} value={data.address || ""} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Contact Person" required={required}>
          <Input value={data.contact || ""} onChange={(e) => set({ contact: e.target.value })} onBlur={() => mark(`${prefix}.contact`)} className={req("contact")} />
        </Field>
        <Field label="Job Title">
          <Input value={data.title || ""} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Phone">
          <Input value={data.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email" required={required}>
          <Input type="email" value={data.email || ""} onChange={(e) => set({ email: e.target.value })} onBlur={() => mark(`${prefix}.email`)} className={req("email")} />
        </Field>
        {"gps" in data && (
          <Field label="GPS">
            <Input placeholder="Latitude, Longitude" value={data.gps || ""} onChange={(e) => set({ gps: e.target.value })} />
          </Field>
        )}
      </div>
      <Field label="Other">
        <Input value={data.other || ""} onChange={(e) => set({ other: e.target.value })} />
      </Field>
    </div>
  );
}

function Manday({ form, setForm, totals }) {
  const c = form.staffCounts;
  const setCounts = (patch) => setForm((prev) => ({ ...prev, staffCounts: { ...prev.staffCounts, ...patch } }));

  const Row = ({ name, keyName }) => (
    <div className="grid grid-cols-3 items-center gap-3">
      <div className="text-sm">{name}</div>
      <NumberInput
        value={c[keyName].male}
        onChange={(e) => setCounts({ [keyName]: { ...c[keyName], male: Number(e.target.value || 0) } })}
      />
      <NumberInput
        value={c[keyName].female}
        onChange={(e) => setCounts({ [keyName]: { ...c[keyName], female: Number(e.target.value || 0) } })}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="font-medium">3.1 — Total Employees</div>
          <div className="text-sm text-neutral-500">Auto-total on the right</div>
        </div>
        <div className="grid gap-6 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs font-medium text-neutral-500">
              <div>Category</div><div>Male</div><div>Female</div>
            </div>
            <Row name="Production workers" keyName="production" />
            <Row name="Permanent workers" keyName="permanent" />
            <Row name="Temporary workers" keyName="temporary" />
            <Row name="Migrant workers" keyName="migrant" />
            <Row name="On-site contractors" keyName="contractors" />
            <Row name="Homeworkers" keyName="homeworkers" />
            <Row name="Management (non-production)" keyName="management" />
          </div>
          <div className="space-y-3">
            <Field label="Nationality(ies) of migrants (if any)">
              <Textarea
                rows={6}
                value={c.migrantNationalities}
                onChange={(e) => setCounts({ migrantNationalities: e.target.value })}
                placeholder="e.g., VN, KH, BD"
              />
            </Field>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-2 text-sm font-medium">Live Totals</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border bg-white p-2">
                  Male<br /><span className="font-mono text-base">{totals.totalMale}</span>
                </div>
                <div className="rounded-lg border bg-white p-2">
                  Female<br /><span className="font-mono text-base">{totals.totalFemale}</span>
                </div>
                <div className="rounded-lg border bg-white p-2">
                  Total<br /><span className="font-mono text-base">{totals.totalAll}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="3.2 — Other details or Special Conditions">
          <Textarea
            rows={4}
            value={form.special.details}
            onChange={(e) => setForm((p) => ({ ...p, special: { ...p.special, details: e.target.value } }))}
            placeholder="Travel constraints, language requirements, site access, etc."
          />
        </Field>
      </div>
    </div>
  );
}

function Review({ form, setForm, refId, ackTnC, setAckTnC, showQR, qrValue }) {
  const patchAck = (patch, side) => {
    const updates = side === "requester"
      ? { requesterName: patch.name, requesterTitle: patch.title, requesterDate: patch.date, requesterSignatureUrl: patch.signatureUrl }
      : { glaName: patch.name, glaDate: patch.date, glaSignatureUrl: patch.signatureUrl };
    setForm(prev => ({ ...prev, ack: { ...prev.ack, ...updates } }));
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="font-medium">3.3 — Terms & Conditions</div>
          <a
            href="https://greenleafassurance.com/policies/terms-of-service"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand hover:underline print:hidden"
          >
            Open Terms of Service
          </a>
        </div>
        <div className="p-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input id="ack" type="checkbox" className="h-4 w-4" checked={ackTnC} onChange={(e) => setAckTnC(e.target.checked)} />
            <span>I have read and accept the Terms & Conditions.</span>
          </label>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <AckCard title="3.4 — Service Requester Acknowledgement" data={form.ack} side="requester" onChange={(patch) => patchAck(patch, "requester")} />
        <AckCard title="Greenleaf Assurance Team" data={form.ack} side="gla" onChange={(patch) => patchAck(patch, "gla")} />
      </div>

      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-neutral-200 p-4 md:flex-row">
        <div>
          <div className="text-sm text-neutral-500">Reference</div>
          <div className="font-mono text-xl font-semibold">{refId}</div>
          <div className="text-xs text-neutral-500">Use this reference in all communications.</div>
        </div>
        <div className="flex items-center gap-4">
          {showQR ? (
            <div className="rounded-xl border bg-white p-3 text-center">
              <QRCodeSVG value={qrValue} size={140} />
              <div className="mt-1 text-[10px] font-mono">{qrValue.replace(/^https?:\/\//, "")}</div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">QR will appear here after submission.</div>
          )}
        </div>
      </div>

      <SmallPrint />
    </div>
  );
}

function AckCard({ title, data, side, onChange }) {
  const [name, setName] = useState("");
  const [titleRole, setTitleRole] = useState("");
  const [date, setDate] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");

  useEffect(() => {
    if (side === "requester") {
      setName(data.requesterName || "");
      setTitleRole(data.requesterTitle || "");
      setDate(data.requesterDate || "");
      setSignatureUrl(data.requesterSignatureUrl || "");
    } else {
      setName(data.glaName || "");
      setTitleRole("");
      setDate(data.glaDate || "");
      setSignatureUrl(data.glaSignatureUrl || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange({ name, title: titleRole, date, signatureUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, titleRole, date, signatureUrl]);

  const onSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSignatureUrl(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200">
      <div className="border-b border-neutral-200 px-4 py-3 font-medium">{title}</div>
      <div className="grid items-end gap-4 p-4 md:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {side === "requester" && (
          <Field label="Title / Role"><Input value={titleRole} onChange={(e) => setTitleRole(e.target.value)} /></Field>
        )}
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="space-y-2">
          <Field label="Signature (upload image)">
            <input type="file" accept="image/*" onChange={onSignatureUpload} />
          </Field>
          {signatureUrl && (
            <div className="rounded-xl border bg-white p-2">
              <img src={signatureUrl} alt="signature" className="h-16 object-contain" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallPrint() {
  return (
    <div className="text-[11px] leading-5 text-neutral-500">
      Greenleaf Assurance is a Business Support Services Company that is committed to improving the operations of manufacturers, inspection/auditing companies, vendors, and end users. We aim to assist in the advancement of your business to the next level. We kindly request that all customers complete our booking form in order to obtain a valid quotation/estimate. To guarantee precision, please provide detailed and accurate information.
    </div>
  );
}

function ReadOnlyCurtain({ locked, children }) {
  if (!locked) return children;
  return (
    <div className="relative">
      <div className="absolute inset-0 z-10 cursor-not-allowed rounded-2xl bg-white/50" />
      {children}
    </div>
  );
}
