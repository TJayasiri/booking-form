// at top
import Logo from './assets/greenleaf-logo.svg';

// in the header JSX, replace the small GL box:
{/* <div className="w-10 h-10 rounded-2xl bg-emerald-600 ...">GL</div> */}
<img src={Logo} alt="Greenleaf Assurance" className="h-8 md:h-9 select-none" />
import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * Greenleaf — Online Service Booking Form (v3, QR-ready)
 * - Clean, modern, mobile-friendly, printable
 * - Multi-step wizard with validation
 * - Auto-generate Reference ID + QR code (replaces barcode)
 * - Copy "Same as above" data between sections
 * - Save/Load as JSON (for drafts), Print-friendly layout
 * - Minimal dependencies (Tailwind + qrcode.react)
 *
 * Notes:
 * - Wire this to your backend by replacing onSubmit() to POST to your API.
 * - QR encodes a deep-link `https://greenleafassurance.com/booking/<ref>` by default.
 */

export default function BookingFormApp() {
  // ----- Helpers
  const genRef = () => {
    const y = new Date().getFullYear().toString().slice(-2);
    const stamp = Date.now().toString().slice(-6);
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GLB-${y}-${stamp}-${rand}`;
  };

  const [step, setStep] = useState(1);
  const [refId, setRefId] = useState(genRef());
  const [showQR, setShowQR] = useState(false);
  const [ackTnC, setAckTnC] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----- Core form state
  const [form, setForm] = useState(() => ({
    meta: {
      auditType: "Initial", // Initial | Annual | Re-Audit | Other
      auditTypeOther: "",
      auditDate: "", // single date if applicable
      windowStart: "",
      windowEnd: "",
      clientsExpected: "",
      platformRef: "",
      platformSite: "",
      factoryOrRequesterId: "",
    },
    requester: {
      company: "",
      address: "",
      contact: "",
      title: "",
      phone: "",
      email: "",
      other: "",
      gps: "",
    },
    supplier: {
      company: "",
      address: "",
      contact: "",
      title: "",
      phone: "",
      email: "",
      other: "",
      gps: "",
    },
    vendor: {
      sameAsSupplier: false,
      company: "",
      address: "",
      contact: "",
      title: "",
      phone: "",
      email: "",
      other: "",
    },
    buyer: {
      differentData: false,
      company: "",
      address: "",
      contact: "",
      title: "",
      phone: "",
      email: "",
      other: "",
    },
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
      requesterName: "",
      requesterTitle: "",
      requesterDate: "",
      requesterSignatureUrl: "",
      glaName: "",
      glaDate: "",
      glaSignatureUrl: "",
    },
  }));

  // Copy vendor from supplier when toggled
  useEffect(() => {
    if (form.vendor.sameAsSupplier) {
      setForm((prev) => ({
        ...prev,
        vendor: {
          ...prev.vendor,
          company: prev.supplier.company,
          address: prev.supplier.address,
          contact: prev.supplier.contact,
          title: prev.supplier.title,
          phone: prev.supplier.phone,
          email: prev.supplier.email,
          other: prev.supplier.other,
        },
      }));
    }
  }, [form.vendor.sameAsSupplier, form.supplier]);

  const totalMale = useMemo(
    () => sumMaleFemale(form.staffCounts, "male"),
    [form.staffCounts]
  );
  const totalFemale = useMemo(
    () => sumMaleFemale(form.staffCounts, "female"),
    [form.staffCounts]
  );
  const totalAll = totalMale + totalFemale;

  function sumMaleFemale(counts, key) {
    const keys = [
      "production",
      "permanent",
      "temporary",
      "migrant",
      "contractors",
      "homeworkers",
      "management",
    ];
    return keys.reduce((acc, k) => acc + (Number(counts[k]?.[key] || 0)), 0);
  }

  // ----- Validation (minimal, extend as needed)
  const basicValid = useMemo(() => {
    const m = form.meta; const r = form.requester; const s = form.supplier;
    return (
      r.company && r.contact && r.email &&
      s.company && s.contact && s.email &&
      (m.auditDate || (m.windowStart && m.windowEnd)) &&
      ackTnC
    );
  }, [form, ackTnC]);

  // ----- Persistence helpers (JSON)
  const fileInputRef = useRef(null);
  const saveJson = async () => {
    try {
      setSaving(true);
      const payload = { refId, form, ts: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${refId}_booking.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };

  const loadJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.refId) setRefId(data.refId);
        if (data.form) setForm(data.form);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const printPage = () => window.print();

  // ----- Submit (replace with API integration)
  const onSubmit = () => {
    if (!basicValid) {
      alert("Please complete required fields and accept Terms.");
      return;
    }
    setShowQR(true);
    setStep(4);
  };

  const qrValue = `https://greenleafassurance.com/booking/${encodeURIComponent(refId)}`;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white grid place-items-center font-bold">GL</div>
          <div className="flex-1">
            <h1 className="text-lg md:text-xl font-semibold leading-tight">Greenleaf – Service Booking Form</h1>
            <p className="text-xs md:text-sm text-neutral-500">EFNET-QMS 005 · v3.0 · Reference <span className="font-mono">{refId}</span></p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => { setRefId(genRef()); setShowQR(false); }} className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm">New Ref</button>
            <button onClick={saveJson} disabled={saving} className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm">Save Draft</button>
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm">Load Draft</button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={loadJson} />
            <button onClick={printPage} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm">Print</button>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-6xl mx-auto px-4 mt-4 print:hidden">
        <Stepper step={step} setStep={setStep} />
      </div>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {step === 1 && (
          <SectionCard title="1 — Audit Information & Platform Data">
            <AuditMeta form={form} setForm={setForm} />
          </SectionCard>
        )}
        {step === 2 && (
          <SectionCard title="2 — Parties & Contacts">
            <Parties form={form} setForm={setForm} />
          </SectionCard>
        )}
        {step === 3 && (
          <SectionCard title="3 — Manday Calculation & Special Conditions">
            <Manday form={form} setForm={setForm} totals={{ totalMale, totalFemale, totalAll }} />
          </SectionCard>
        )}
        {step === 4 && (
          <SectionCard title="4 — Review, Acknowledgement & QR">
            <Review form={form} setForm={setForm} refId={refId} ackTnC={ackTnC} setAckTnC={setAckTnC} showQR={showQR} qrValue={qrValue} />
          </SectionCard>
        )}

        {/* Footer Controls */}
        <div className="flex items-center justify-between gap-3 sticky bottom-0 py-4 bg-gradient-to-t from-white to-white/80 backdrop-blur border-t border-neutral-200 print:hidden">
          <div className="text-xs text-neutral-500">Tip: Use <span className="font-semibold">Save Draft</span> to download a JSON you can load later.</div>
          <div className="flex items-center gap-2">
            <button disabled={step<=1} onClick={() => setStep((s) => Math.max(1, s-1))} className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200">Back</button>
            {step < 4 && (
              <button onClick={() => setStep((s) => Math.min(4, s+1))} className="px-4 py-2 rounded-xl bg-emerald-600 text-white">Next</button>
            )}
            {step === 4 && (
              <button onClick={onSubmit} className="px-4 py-2 rounded-xl bg-emerald-700 text-white">Generate QR & Submit</button>
            )}
          </div>
        </div>
      </main>

      {/* Print QR badge at top of print */}
      {showQR && (
        <div className="hidden print:block absolute top-4 right-4">
          <div className="bg-white border border-neutral-200 rounded-xl p-2 text-center">
            <QRCodeSVG value={qrValue} size={96} />
            <div className="text-[10px] mt-1 font-mono">{refId}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <h2 className="text-base md:text-lg font-semibold">{title}</h2>
        <span className="text-xs text-neutral-400">QR replaces barcodes · Printable</span>
      </div>
      <div className="p-5 md:p-6 space-y-6">{children}</div>
    </section>
  );
}

function Stepper({ step, setStep }) {
  const steps = [
    { id: 1, label: "Audit Info" },
    { id: 2, label: "Parties" },
    { id: 3, label: "Manday" },
    { id: 4, label: "Review & QR" },
  ];
  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <li key={s.id} className={`group cursor-pointer select-none`} onClick={() => setStep(s.id)}>
          <div className={`flex items-center gap-2 p-2 rounded-xl border text-sm ${step === s.id ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>
            <span className={`w-6 h-6 grid place-items-center rounded-lg font-semibold ${step === s.id ? "bg-emerald-600 text-white" : "bg-neutral-100"}`}>{i+1}</span>
            <span className="truncate">{s.label}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, required=false, children, note }) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-medium">{label}</span>
        {required && <span className="text-xs text-rose-600">*</span>}
        {note && <span className="text-[11px] text-neutral-500">{note}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ className = "", ...props }) {
  return <input {...props} className={`w-full px-3 py-2 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 ${className}`} />
}
function Textarea({ className = "", ...props }) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 ${className}`} />
}
function Checkbox({ className = "", ...props }) {
  return (
    <input type="checkbox" {...props} className={`w-4 h-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-300 ${className}`} />
  );
}
function NumberInput(props){
  return <Input type="number" min={0} step={1} {...props} />
}

function AuditMeta({ form, setForm }) {
  const m = form.meta;
  const set = (patch) => setForm((prev) => ({ ...prev, meta: { ...prev.meta, ...patch } }));

  return (
    <div className="space-y-6">
      {/* Audit Type */}
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Audit Type" required>
          <div className="flex flex-wrap items-center gap-3">
            {['Initial','Annual','Re-Audit','Other'].map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="radio" name="auditType" value={t} checked={m.auditType===t} onChange={(e)=> set({ auditType: e.target.value })} />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
        </Field>
        {m.auditType === 'Other' && (
          <Field label="If Other, specify">
            <Input value={m.auditTypeOther} onChange={(e)=> set({ auditTypeOther: e.target.value })} placeholder="e.g., Special Follow-up" />
          </Field>
        )}
      </div>

      {/* Dates */}
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Audit Date">
          <Input type="date" value={m.auditDate} onChange={(e)=> set({ auditDate: e.target.value })} />
        </Field>
        <Field label="Window Start" note="(optional if Audit Date given)">
          <Input type="date" value={m.windowStart} onChange={(e)=> set({ windowStart: e.target.value })} />
        </Field>
        <Field label="Window End">
          <Input type="date" value={m.windowEnd} onChange={(e)=> set({ windowEnd: e.target.value })} />
        </Field>
      </div>

      {/* Platform Data */}
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Clients expected to receive this report">
          <Textarea rows={3} value={m.clientsExpected} onChange={(e)=> set({ clientsExpected: e.target.value })} placeholder="List buyer/brand names" />
        </Field>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Audit Platform Reference #">
            <Input value={m.platformRef} onChange={(e)=> set({ platformRef: e.target.value })} placeholder="e.g., Sedex ZC-xxxx" />
          </Field>
          <Field label="Audit Platform Site #">
            <Input value={m.platformSite} onChange={(e)=> set({ platformSite: e.target.value })} placeholder="e.g., ZS-xxxx" />
          </Field>
          <Field label="Factory / Requester ID">
            <Input value={m.factoryOrRequesterId} onChange={(e)=> set({ factoryOrRequesterId: e.target.value })} placeholder="Internal code if any" />
          </Field>
        </div>
      </div>

      {/* Requester (lead account) */}
      <div className="grid md:grid-cols-2 gap-4">
        <ContactBlock
          title="Requester (Lead Account)"
          data={form.requester}
          onChange={(patch) => setForm((prev)=> ({ ...prev, requester: { ...prev.requester, ...patch } }))}
          required
        />
        <ContactBlock
          title="Supplier / Factory"
          data={form.supplier}
          onChange={(patch) => setForm((prev)=> ({ ...prev, supplier: { ...prev.supplier, ...patch } }))}
          required
        />
      </div>
    </div>
  );
}

function Parties({ form, setForm }) {
  const v = form.vendor; const b = form.buyer;

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Vendor / Trading Company</h3>
            <label className="text-sm flex items-center gap-2">
              <Checkbox checked={v.sameAsSupplier} onChange={(e)=> setForm((p)=> ({...p, vendor: { ...p.vendor, sameAsSupplier: e.target.checked }}))} />
              <span>Same as Supplier</span>
            </label>
          </div>
          <ContactBlock
            data={v}
            onChange={(patch) => setForm((prev)=> ({ ...prev, vendor: { ...prev.vendor, ...patch } }))}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Buyer / Other Party (Billing)</h3>
            <label className="text-sm flex items-center gap-2">
              <Checkbox checked={b.differentData} onChange={(e)=> setForm((p)=> ({...p, buyer: { ...p.buyer, differentData: e.target.checked }}))} />
              <span>Different Billing Data</span>
            </label>
          </div>
          {b.differentData ? (
            <ContactBlock
              data={b}
              onChange={(patch) => setForm((prev)=> ({ ...prev, buyer: { ...prev.buyer, ...patch } }))}
            />
          ) : (
            <div className="text-sm text-neutral-500 border border-dashed rounded-xl p-4">If unchecked, billing will follow <span className="font-medium">Requester</span> details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactBlock({ title, data, onChange, required=false }) {
  const set = (patch) => onChange(patch);
  return (
    <div className="grid grid-cols-1 gap-3">
      {title && <div className="text-sm font-medium text-neutral-700">{title}</div>}
      <Field label="Company Name" required={required}><Input value={data.company || ''} onChange={(e)=> set({ company: e.target.value })} /></Field>
      <Field label="Address"><Textarea rows={2} value={data.address || ''} onChange={(e)=> set({ address: e.target.value })} /></Field>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Contact Person" required={required}><Input value={data.contact || ''} onChange={(e)=> set({ contact: e.target.value })} /></Field>
        <Field label="Job Title"><Input value={data.title || ''} onChange={(e)=> set({ title: e.target.value })} /></Field>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Field label="Phone"><Input value={data.phone || ''} onChange={(e)=> set({ phone: e.target.value })} /></Field>
        <Field label="Email" required={required}><Input type="email" value={data.email || ''} onChange={(e)=> set({ email: e.target.value })} /></Field>
        {"gps" in data && (
          <Field label="GPS"><Input placeholder="Latitude, Longitude" value={data.gps || ''} onChange={(e)=> set({ gps: e.target.value })} /></Field>
        )}
      </div>
      <Field label="Other"><Input value={data.other || ''} onChange={(e)=> set({ other: e.target.value })} /></Field>
    </div>
  );
}

function Manday({ form, setForm, totals }) {
  const c = form.staffCounts;
  const setCounts = (patch) => setForm((prev)=> ({ ...prev, staffCounts: { ...prev.staffCounts, ...patch } }));

  const Row = ({ name, keyName }) => (
    <div className="grid grid-cols-3 gap-3 items-center">
      <div className="text-sm">{name}</div>
      <NumberInput value={c[keyName].male} onChange={(e)=> setCounts({ [keyName]: { ...c[keyName], male: Number(e.target.value||0) } })} />
      <NumberInput value={c[keyName].female} onChange={(e)=> setCounts({ [keyName]: { ...c[keyName], female: Number(e.target.value||0) } })} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <div className="font-medium">3.1 — Total Employees</div>
          <div className="text-sm text-neutral-500">Auto-total on the right</div>
        </div>
        <div className="p-4 grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs font-medium text-neutral-500">
              <div>Category</div>
              <div>Male</div>
              <div>Female</div>
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
              <Textarea rows={6} value={c.migrantNationalities} onChange={(e)=> setCounts({ migrantNationalities: e.target.value })} placeholder="e.g., VN, KH, BD" />
            </Field>
            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
              <div className="text-sm font-medium mb-2">Live Totals</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="p-2 rounded-lg bg-white border">Male<br/><span className="font-mono text-base">{totals.totalMale}</span></div>
                <div className="p-2 rounded-lg bg-white border">Female<br/><span className="font-mono text-base">{totals.totalFemale}</span></div>
                <div className="p-2 rounded-lg bg-white border">Total<br/><span className="font-mono text-base">{totals.totalAll}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="3.2 — Other details or Special Conditions">
          <Textarea rows={4} value={form.special.details} onChange={(e)=> setForm((p)=> ({...p, special: { ...p.special, details: e.target.value }}))} placeholder="Travel constraints, language requirements, site access, etc." />
        </Field>
      </div>
    </div>
  );
}

function Review({ form, setForm, refId, ackTnC, setAckTnC, showQR, qrValue }) {
  const patchAck = (patch, side) => {
    const updates = side === 'requester'
      ? {
          requesterName: patch.name,
          requesterTitle: patch.title,
          requesterDate: patch.date,
          requesterSignatureUrl: patch.signatureUrl,
        }
      : {
          glaName: patch.name,
          glaDate: patch.date,
          glaSignatureUrl: patch.signatureUrl,
        };
    setForm(prev => ({ ...prev, ack: { ...prev.ack, ...updates }}));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <div className="font-medium">3.3 — General Terms & Conditions</div>
          <span className="text-xs text-neutral-500">Service execution windows & reporting timelines</span>
        </div>
        <div className="p-4 text-sm leading-6 space-y-1">
          <p>• All services executed per contract; where absent, Greenleaf standard Terms apply.</p>
          <p>• Services scheduled within <b>14 business days</b> of receiving a <b>completed Booking Form</b>.</p>
          <p>• Reports delivered within <b>3 business days</b> after onsite completion.</p>
          <p>• Factory to review and confirm: <i>Services Agreement</i>, <i>Code of Ethics</i>, and <i>Non-Disclosure</i> prior to execution.</p>
          <p>• Full access to all factory areas (incl. dormitories and canteens) and documents per Document Request List.</p>
          <p>• Confidential interview space must be provided.</p>
          <p>• Observations can be discussed during on-site CAP review; factual elements may not be altered.</p>
          <p>• Cancellations within <b>72 hours</b> of service start will be billed in full incl. non-refundable travel costs.</p>
          <p>• By submitting, you agree to our Terms of Service and policies.</p>
          <div className="mt-2 flex items-center gap-2">
            <input id="ack" type="checkbox" className="w-4 h-4" checked={ackTnC} onChange={(e)=> setAckTnC(e.target.checked)} />
            <label htmlFor="ack" className="text-sm">I acknowledge and accept the terms and conditions.</label>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <AckCard title="3.4 — Service Requester Acknowledgement" data={form.ack} side="requester" onChange={(patch)=> patchAck(patch, 'requester')} />
        <AckCard title="Greenleaf Assurance Team" data={form.ack} side="gla" onChange={(patch)=> patchAck(patch, 'gla')} />
      </div>

      <div className="rounded-2xl border border-neutral-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">Reference</div>
          <div className="text-xl font-semibold font-mono">{refId}</div>
          <div className="text-xs text-neutral-500">Use this reference in all communications.</div>
        </div>
        <div className="flex items-center gap-4">
          {showQR ? (
            <div className="bg-white rounded-xl border p-3 text-center">
              <QRCodeSVG value={qrValue} size={140} />
              <div className="text-[10px] font-mono mt-1">{qrValue.replace(/^https?:\/\//, '')}</div>
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

function AckCard({ title, data, side, onChange }){
  const [name, setName] = useState("");
  const [titleRole, setTitleRole] = useState("");
  const [date, setDate] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");

  useEffect(() => {
    if (side === 'requester'){
      setName(data.requesterName||'');
      setTitleRole(data.requesterTitle||'');
      setDate(data.requesterDate||'');
      setSignatureUrl(data.requesterSignatureUrl||'');
    } else {
      setName(data.glaName||'');
      setTitleRole('');
      setDate(data.glaDate||'');
      setSignatureUrl(data.glaSignatureUrl||'');
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
    <div className="rounded-2xl border border-neutral-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 font-medium">{title}</div>
      <div className="p-4 grid md:grid-cols-2 gap-4 items-end">
        <Field label="Name"><Input value={name} onChange={(e)=> setName(e.target.value)} /></Field>
        {side === 'requester' && (
          <Field label="Title / Role"><Input value={titleRole} onChange={(e)=> setTitleRole(e.target.value)} /></Field>
        )}
        <Field label="Date"><Input type="date" value={date} onChange={(e)=> setDate(e.target.value)} /></Field>
        <div className="space-y-2">
          <Field label="Signature (upload image)">
            <input type="file" accept="image/*" onChange={onSignatureUpload} />
          </Field>
          {signatureUrl && (
            <div className="border rounded-xl p-2 bg-white">
              <img src={signatureUrl} alt="signature" className="h-16 object-contain" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallPrint(){
  return (
    <div className="text-[11px] text-neutral-500 leading-5">
      Greenleaf Assurance is a Business Support Services Company that is committed to improving the operations of manufacturers, inspection/auditing companies, vendors, and end users. We aim to assist in the advancement of your business to the next level. We kindly request that all customers complete our booking form in order to obtain a valid quotation/estimate. To guarantee precision, please provide detailed and accurate information.
    </div>
  );
}
