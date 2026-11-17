import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { fileToBase64 } from "../lib/exportUtils";
import { Field, ledgerNames, Notice } from "../components/FinanceUI";
import DuplicateReview from "../components/DuplicateReview";

const paths = { general: "/general-ledger", unofficial: "/unofficial-ledger", association: "/student-association", departmental: "/department-ledger" };

export default function BatchReceiptsPage() {
  const [params] = useSearchParams();
  const [ledger, setLedger] = useState(Object.hasOwn(ledgerNames, params.get("ledger")) ? params.get("ledger") : "general");
  const [config, setConfig] = useState({ categories: [], periods: [] });
  const [taxes, setTaxes] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const running = useRef(false), stopped = useRef(false), request = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([api.getFinanceConfig(), api.getTaxes()]).then(([cfg, list]) => { if (active) { setConfig(cfg); setTaxes(list); } }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; stopped.current = true; request.current?.abort(); };
  }, []);
  const update = (key, patch, edited = false) => setDrafts((current) => current.map((item) => item.key === key
    ? { ...item, ...patch, ...(edited ? { reviewed: false, duplicateAcknowledged: false, duplicateReason: "" } : {}) } : item));
  const choose = async (event) => {
    const files = Array.from(event.target.files || []);
    setError(""); setMessage("");
    if (files.length > 10) { setError("Choose up to 10 receipt images per batch."); event.target.value = ""; return; }
    if (files.some((file) => file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      setError("Each receipt must be a PNG, JPEG or WebP image up to 2 MB."); event.target.value = ""; return;
    }
    setBusy("loading"); running.current = true;
    try {
      const items = [];
      for (const file of files) items.push({ key: crypto.randomUUID(), name: file.name, image: await fileToBase64(file),
        status: "unread", selected: false, reviewed: false, form: { date: "", voucherNo: "", cost: "", categoryId: "", taxTypeId: "", description: "" }, duplicates: [] });
      setDrafts(items);
    } catch (failure) { setError(failure.message || "Could not read images"); }
    finally { setBusy(""); running.current = false; }
  };
  const read = async () => {
    if (running.current) return;
    running.current = true; stopped.current = false; setBusy("reading"); setMessage(""); setError("");
    const cache = new Map(drafts.filter((item) => item.result).map((item) => [item.image, item.result]));
    for (const item of drafts.filter((draft) => draft.status !== "posted" && !draft.result)) {
      if (stopped.current) break;
      update(item.key, { status: "reading", error: "" });
      request.current = new AbortController();
      try {
        const result = cache.get(item.image) || await api.scanReceipt({ image: item.image, ledgerType: ledger }, request.current.signal);
        if (stopped.current) break;
        cache.set(item.image, result);
        const f = result.fields;
        update(item.key, { status: "ready", result, duplicates: result.duplicates || [], form: {
          date: f.date || "", voucherNo: f.receiptNumber || "", cost: !f.currency || f.currency === "BDT" ? f.totalAmount || "" : "",
          categoryId: String(f.categoryId || ""), taxTypeId: String(f.taxTypeId || ""), description: f.description || "",
          receiptNumber: f.receiptNumber || "", receiptMerchant: f.merchant || "",
        } });
      } catch (failure) { if (!stopped.current) update(item.key, { status: "error", error: failure.message }); }
    }
    setDrafts((current) => current.map((item) => item.status === "reading" ? { ...item, status: "unread" } : item));
    running.current = false; setBusy("");
  };
  const valid = (item) => item.result && item.form.voucherNo.trim() && Number(item.form.cost) > 0 && item.form.categoryId &&
    config.periods.some((period) => period.status === "open" && item.form.date >= period.start_date && item.form.date <= period.end_date);
  const selected = drafts.filter((item) => item.selected && item.status !== "posted");
  const post = async () => {
    if (running.current || !selected.length || selected.some((item) => !item.reviewed || !valid(item))) return;
    running.current = true; setBusy("posting"); setError(""); setMessage(""); stopped.current = false;
    let posted = 0;
    for (const item of selected) {
      if (stopped.current) break;
      update(item.key, { error: "" });
      try {
        const result = await api.addRow(ledger, { ...item.form, clientRequestId: item.key, voucherFileName: item.name, voucherFileData: item.image,
          duplicateAcknowledged: !!item.duplicateAcknowledged, duplicateReason: item.duplicateReason || "" });
        if (stopped.current) break;
        posted++;
        update(item.key, { status: "posted", selected: false, postedId: result.id });
      } catch (failure) { if (!stopped.current) update(item.key, { error: failure.message, duplicates: failure.details?.duplicates || [], reviewed: false }); }
    }
    window.dispatchEvent(new Event("finance-updated"));
    setMessage(`${posted} receipt${posted === 1 ? "" : "s"} posted. Any unsuccessful drafts remain available for correction.`);
    running.current = false; setBusy("");
  };
  return (
    <article className="space-y-5">
      <header><h1 className="text-2xl font-bold">Batch Receipts</h1><p className="mt-1 text-sm text-slate-600">Read up to 10 receipts, review each draft, and post selected expenses. Drafts stay on this page until you leave or reload.</p></header>
      <Notice error message={error} /><Notice message={message} />
      <section className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <Field label="Destination ledger"><select className="finance-input" value={ledger} disabled={!!busy || drafts.some((item) => item.status === "posted")} onChange={(event) => { setLedger(event.target.value); setDrafts((current) => current.map((item) => ({ ...item, reviewed: false }))); }}>
          {Object.entries(ledgerNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></Field>
        <Field label="Receipt images (up to 10)"><input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={!!busy} className="finance-input" onChange={choose} /></Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button className="finance-button" disabled={!!busy || !drafts.some((item) => !item.result && item.status !== "posted")} onClick={read}>{busy === "reading" ? "Reading receipts…" : "Read receipts"}</button>
          {busy === "reading" && <button className="finance-button-secondary" onClick={() => { stopped.current = true; request.current?.abort(); }}>Stop reading</button>}
          <button className="finance-button" disabled={!!busy || !selected.length || selected.some((item) => !item.reviewed || !valid(item))} onClick={post}>{busy === "posting" ? "Posting selected…" : `Post selected (${selected.length})`}</button>
          <Link className="finance-button-secondary" to={paths[ledger]}>Open ledger</Link>
        </div>
      </section>
      <div className="space-y-5">
        {drafts.map((item, index) => {
          const sameImage = drafts.findIndex((other) => other.image === item.image) !== index;
          const locked = !!busy || item.status === "posted";
          return <section key={item.key} aria-label={`Receipt draft ${index + 1}`} className="rounded-xl border bg-white p-4 space-y-4">
            <div className="flex justify-between gap-3"><h2 className="font-semibold">{index + 1}. {item.name}</h2><span className="text-xs text-slate-500">{item.status}</span></div>
            {item.status === "posted" ? <Link className="text-sm text-blue-700 underline" to={paths[ledger] + "?entry=" + item.postedId}>Open posted entry</Link> : <>
              <Notice error message={item.error} />
              {sameImage && <Notice error message="This image is repeated within this batch. Select only the intended copy; posting another copy requires duplicate review." />}
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <img src={item.image} alt={`Source receipt ${index + 1}`} className="mx-auto max-h-60 max-w-full rounded border" />
                <div className="space-y-3">
                  {item.result && <><p className="text-xs text-slate-500">OCR quality {item.result.quality}/100 · {item.result.fields.currency || "Confirm currency"}</p>
                    <ul className="list-disc pl-4 text-xs text-amber-900">{item.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[["date", "Date", "date"], ["voucherNo", "Voucher number", "text"], ["cost", "Cost (BDT)", "number"]].map(([key, label, type]) => <Field key={key} label={label}><input className="finance-input" disabled={locked} type={type} min={type === "number" ? "0.01" : undefined} step={type === "number" ? "0.01" : undefined} value={item.form[key]} onChange={(event) => update(item.key, { form: { ...item.form, [key]: event.target.value } }, true)} /></Field>)}
                    <Field label="Expense category"><select className="finance-input" disabled={locked} value={item.form.categoryId} onChange={(event) => update(item.key, { form: { ...item.form, categoryId: event.target.value } }, true)}><option value="">Choose category</option>{config.categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                    <Field label="Tax type"><select className="finance-input" disabled={locked} value={item.form.taxTypeId} onChange={(event) => update(item.key, { form: { ...item.form, taxTypeId: event.target.value } }, true)}><option value="">No tax</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} ({tax.percentage}%)</option>)}</select></Field>
                    <Field label="Description"><textarea className="finance-input" disabled={locked} maxLength={2000} value={item.form.description} onChange={(event) => update(item.key, { form: { ...item.form, description: event.target.value } }, true)} /></Field>
                  </div>
                  {item.result && <details className="text-xs"><summary>Extracted receipt text</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{item.result.ocrText}</pre></details>}
                </div>
              </div>
              <DuplicateReview matches={item.duplicates} acknowledged={item.duplicateAcknowledged} reason={item.duplicateReason} onChange={(patch) => update(item.key, patch)} />
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={locked || !valid(item) || (item.duplicates.length > 0 && (!item.duplicateAcknowledged || !item.duplicateReason?.trim()))} checked={item.reviewed} onChange={(event) => update(item.key, { reviewed: event.target.checked, selected: event.target.checked })} />I reviewed this draft against the receipt, confirmed BDT amounts, and checked the date, voucher and category.</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked || !item.reviewed} checked={item.selected} onChange={(event) => update(item.key, { selected: event.target.checked })} />Select this expense to post</label>
              {item.result && !valid(item) && <p className="text-xs text-amber-800">Complete the voucher, positive cost and category, and choose a date in an open financial period.</p>}
            </>}
          </section>;
        })}
      </div>
    </article>
  );
}
