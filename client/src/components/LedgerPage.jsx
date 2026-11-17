import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Download,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { api } from "../api";
import ReceiptScanner from "./ReceiptScanner";
import DuplicateReview from "./DuplicateReview";
import { useAuth } from "../state/AuthContext";
import { exportToPDF, exportToExcel, fileToBase64 } from "../lib/exportUtils";
import { balanceRows } from "../lib/ledgerMath";
import { amount, Field, Modal, Notice, PeriodSelect, today } from "./FinanceUI";

const blank = () => ({
  clientRequestId: crypto.randomUUID(),
  date: today(),
  voucherNo: "",
  deposit: "",
  cost: "",
  categoryId: "",
  taxTypeId: "",
  description: "",
  signature: "",
  voucherFileName: "",
  voucherFileData: "",
});
export default function LedgerPage({ type, title }) {
  const [params, setParams] = useSearchParams();
  const entryId = Number(params.get("entry")) || null;
  const [duplicates, setDuplicates] = useState([]);
  const [attachment, setAttachment] = useState(null);
  const { user } = useAuth(),
    isAdmin = user?.role === "super_admin";
  const [scanning, setScanning] = useState(false);
  const uploadSequence = useRef(0);
  const [rows, setRows] = useState([]),
    [taxes, setTaxes] = useState([]),
    [config, setConfig] = useState({
      categories: [],
      periods: [],
      openingBalances: {},
    });
  const [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [periodId, setPeriodId] = useState(""),
    [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState(null),
    [edit, setEdit] = useState(null),
    [reverse, setReverse] = useState(null),
    [voucher, setVoucher] = useState(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const duplicateKey = form ? JSON.stringify([form.date, form.voucherNo, form.deposit, form.cost, form.voucherFileData, form.receiptNumber]) : "";
  useEffect(() => {
    setDuplicates([]);
    setForm((current) => current ? { ...current, duplicateAcknowledged: false, duplicateReason: "" } : current);
  }, [duplicateKey]);
  const load = async () => {
    const [entries, cfg, taxList] = await Promise.all([
      api.getLedger(type),
      api.getFinanceConfig(),
      api.getTaxes(),
    ]);
    setRows(entries);
    setConfig(cfg);
    setTaxes(taxList);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.getLedger(type), api.getFinanceConfig(), api.getTaxes()])
      .then(([entries, cfg, taxList]) => {
        if (active) {
          setRows(entries);
          setConfig(cfg);
          setTaxes(taxList);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type]);
  useEffect(
    () => setPage(1),
    [search, from, to, periodId, categoryId, pageSize],
  );
  const balanced = useMemo(
    () => balanceRows(rows, config.openingBalances[type] || 0),
    [rows, config.openingBalances, type],
  );
  const period = config.periods.find((p) => p.id === Number(periodId));
  const filtered = useMemo(
    () =>
      balanced
        .filter((row) => {
          if (entryId) return row.id === entryId;
          if (
            period &&
            (row.date < period.start_date || row.date > period.end_date)
          )
            return false;
          if ((from && row.date < from) || (to && row.date > to)) return false;
          if (categoryId === "none" && row.categoryId) return false;
          if (
            categoryId &&
            categoryId !== "none" &&
            row.categoryId !== Number(categoryId)
          )
            return false;
          const needle = search.toLowerCase();
          return (
            !needle ||
            [
              row.description,
              row.voucher_no,
              row.signature,
              row.categoryName,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(needle),
            )
          );
        })
        .reverse(),
    [balanced, period, from, to, categoryId, search, entryId],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safePage = Math.min(page, totalPages),
    pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = from || period?.start_date;
  const opening = rangeStart
    ? (balanced.filter((row) => row.date < rangeStart).at(-1)?.netBalance ??
      config.openingBalances[type] ??
      0)
    : config.openingBalances[type] || 0;
  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
      window.dispatchEvent(new Event("finance-updated"));
      setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const exportRows = async (format) => {
    try {
      if (format === "pdf") await exportToPDF(title, filtered);
      else await exportToExcel(title, filtered);
    } catch (e) {
      setError(e.message || "Export failed");
    }
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Voucher files must be 2 MB or less");
      e.target.value = "";
      return;
    }
    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "application/pdf",
      ].includes(file.type)
    ) {
      setError("Choose a PNG, JPEG, WebP, GIF or PDF");
      return;
    }
    try {
      const sequence = ++uploadSequence.current;
      setForm((current) => ({
        ...current,
        voucherFileName: file.name,
        voucherFileData: "",
        receiptNumber: "",
        receiptMerchant: "",
      }));
      const data = await fileToBase64(file);
      if (sequence !== uploadSequence.current) return;
      setForm((current) =>
        current ? { ...current, voucherFileData: data } : current,
      );
    } catch {
      setError("The voucher could not be read");
    }
  };
  const postingPeriod = form
    ? config.periods.find(
        (p) => p.start_date <= form.date && p.end_date >= form.date,
      )
    : null;
  return (
    <article className="space-y-5">
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Posted entries retain their financial history. Corrections use
            linked reversals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="finance-button-secondary"
            onClick={() => exportRows("pdf")}
          >
            <Download size={15} />
            PDF
          </button>
          <button
            className="finance-button-secondary"
            onClick={() => exportRows("excel")}
          >
            <Download size={15} />
            Excel
          </button>
          <Link
            className="finance-button-secondary"
            to={`/data-tools?ledger=${type}`}
          >
            <Upload size={15} />
            Import
          </Link>
          <Link className="finance-button-secondary" to={`/receipt-batch?ledger=${type}`}>Batch receipts</Link>
          <button
            className="finance-button"
            onClick={() => {
              setError("");
              uploadSequence.current += 1;
              setForm(blank());
            }}
          >
            <Plus size={16} />
            Add entry
          </button>
        </div>
      </header>
      <Notice message={error} error />
      <Notice message={message} />
      {entryId && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">Showing source entry #{entryId}. <button className="text-blue-800 underline" onClick={() => setParams({})}>Show all entries</button></div>}
      <section
        aria-label="Ledger filters"
        className="p-4 bg-white border rounded-xl space-y-3"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Search">
            <input
              className="finance-input"
              placeholder="Voucher, description or signature"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <PeriodSelect
            periods={config.periods}
            value={periodId}
            onChange={setPeriodId}
            all
          />
          <Field label="Category">
            <select
              className="finance-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              <option value="none">Uncategorized</option>
              {config.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              className="finance-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              className="finance-input"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <button
              className="finance-button-secondary"
              onClick={() => {
                setSearch("");
                setFrom("");
                setTo("");
                setCategoryId("");
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-500 flex flex-wrap justify-between gap-2">
          <span aria-live="polite">
            {filtered.length} entries · newest first
            {period?.status === "closed" ? " · Closed period" : ""}
          </span>
          <span>
            Opening before {rangeStart || "all records"}:{" "}
            <strong>৳ {amount(opening)}</strong>. Balances include earlier
            entries, even when filtered.
          </span>
        </div>
      </section>
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="finance-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Date</th>
                <th>Voucher</th>
                <th>Category</th>
                <th>Deposit</th>
                <th>Cost</th>
                <th>Balance</th>
                <th>Description</th>
                <th>Tax</th>
                <th>Signature</th>
                <th>Files</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className={row.reversalOf ? "bg-amber-50/40" : ""}
                >
                  <td>
                    {row.no}
                    <div className="text-[10px] text-slate-400">
                      {row.reversalOf
                        ? `Reverses #${row.reversalOf}`
                        : row.reversedBy
                          ? `Reversed by #${row.reversedBy}`
                          : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {row.date}
                    <div className="text-[10px] text-slate-400">
                      {row.periodName}
                      {row.periodStatus === "closed" ? " · Locked" : ""}
                    </div>
                  </td>
                  <td>{row.voucher_no}</td>
                  <td>
                    {row.categoryName || (
                      <span className="text-slate-400">Uncategorized</span>
                    )}
                  </td>
                  <td className="text-emerald-700 whitespace-nowrap">
                    {row.deposit == null ? "" : amount(row.deposit)}
                  </td>
                  <td className="text-red-700 whitespace-nowrap">
                    {row.cost == null ? "" : amount(row.cost)}
                  </td>
                  <td
                    className={`font-semibold whitespace-nowrap ${row.netBalance < 0 ? "text-red-700" : ""}`}
                  >
                    {amount(row.netBalance)}
                  </td>
                  <td className="min-w-[180px] max-w-xs">
                    <div className="whitespace-pre-wrap">{row.description}</div>
                    {row.correction_reason && (
                      <span className="text-xs text-amber-800">
                        {row.correction_reason}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.taxTypeName}
                    {row.taxPercentage != null
                      ? ` (${row.taxPercentage}%)`
                      : ""}
                  </td>
                  <td>{row.signature}</td>
                  <td>
                    {!row.voucherFileData && !row.reversalOf && (isAdmin || row.created_by === user?.id) && (
                      <button className="text-xs text-blue-700 underline" aria-label={`Attach receipt for ${row.voucher_no}`}
                        onClick={() => { setError(""); setAttachment({ id: row.id, voucherFileName: "", voucherFileData: "", reason: "", duplicates: [] }); }}>Attach receipt</button>
                    )}
                    {row.voucherFileData && (
                      <button
                        aria-label={`View voucher ${row.voucher_no}`}
                        className="p-2 rounded hover:bg-slate-100"
                        onClick={() =>
                          setVoucher({
                            name: row.voucherFileName,
                            data: row.voucherFileData,
                          })
                        }
                      >
                        <Paperclip size={16} />
                      </button>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="flex gap-1">
                        {row.periodStatus !== "closed" && (
                          <button
                            className="p-2 rounded hover:bg-slate-100"
                            aria-label={`Edit details for ${row.voucher_no}`}
                            onClick={() => {
                              setError("");
                              setEdit({
                                id: row.id,
                                description: row.description || "",
                                signature: row.signature || "",
                                categoryId: row.categoryId || "",
                                reason: "",
                              });
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {!row.reversalOf && !row.reversedBy && (
                          <button
                            className="p-2 rounded text-amber-800 hover:bg-amber-50"
                            aria-label={`Reverse ${row.voucher_no}`}
                            onClick={() => {
                              setError("");
                              setReverse({ row, date: today(), reason: "" });
                            }}
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td
                    colSpan={isAdmin ? 12 : 11}
                    className="text-center py-10 text-slate-400"
                  >
                    {loading
                      ? "Loading ledger..."
                      : "No entries match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav
          aria-label="Ledger pagination"
          className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3 text-sm border-t"
        >
          <span>
            {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–
            {Math.min(safePage * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2">
              Rows
              <select
                className="border rounded p-1"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              className="finance-button-secondary"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Prev
            </button>
            <span>
              {safePage}/{totalPages}
            </span>
            <button
              className="finance-button-secondary"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      </div>
      {form && (
        <Modal
          title={`Add ${title} entry`}
          onClose={() => {
            if (!busy) {
              uploadSequence.current += 1;
              setForm(null);
            }
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                try { await api.addRow(type, form); }
                catch (failure) { setDuplicates(failure.details?.duplicates || []); throw failure; }
                setForm(null);
              }, "Entry posted");
            }}
          >
            <Notice message={error} error />
            <ReceiptScanner
              ledgerType={type}
              image={form.voucherFileData}
              fileName={form.voucherFileName}
              existingVoucherNo={form.voucherNo}
              onFileSelected={upload}
              onApply={(patch) =>
                setForm((current) => ({ ...current, ...patch }))
              }
              onBusyChange={setScanning}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Date">
                <input
                  required
                  type="date"
                  className="finance-input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Voucher number">
                <input
                  required
                  maxLength={120}
                  className="finance-input"
                  value={form.voucherNo}
                  onChange={(e) =>
                    setForm({ ...form, voucherNo: e.target.value })
                  }
                />
              </Field>
              <Field label="Deposit (BDT)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="finance-input"
                  value={form.deposit}
                  onChange={(e) =>
                    setForm({ ...form, deposit: e.target.value })
                  }
                />
              </Field>
              <Field label="Cost (BDT)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="finance-input"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </Field>
              <Field label="Expense category">
                <select
                  className="finance-input"
                  required={Number(form.cost) > 0}
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm({ ...form, categoryId: e.target.value })
                  }
                >
                  <option value="">Choose category</option>
                  {config.categories
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Tax type">
                <select
                  className="finance-input"
                  value={form.taxTypeId}
                  onChange={(e) =>
                    setForm({ ...form, taxTypeId: e.target.value })
                  }
                >
                  <option value="">No tax</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.percentage}%)
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p
              className={`text-sm ${postingPeriod?.status === "open" ? "text-emerald-700" : "text-red-700"}`}
            >
              {postingPeriod
                ? `${postingPeriod.name} · ${postingPeriod.status}`
                : "No financial period covers this date."}
            </p>
            <Field label="Description">
              <textarea
                maxLength={2000}
                className="finance-input"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            <Field label="Signature">
              <input
                maxLength={200}
                className="finance-input"
                value={form.signature}
                onChange={(e) =>
                  setForm({ ...form, signature: e.target.value })
                }
              />
            </Field>
            <Field label="Voucher attachment (optional, up to 2 MB)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,.pdf"
                className="finance-input"
                onChange={upload}
              />
            </Field>
            <DuplicateReview matches={duplicates} acknowledged={form.duplicateAcknowledged} reason={form.duplicateReason}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <button
              disabled={
                busy ||
                scanning ||
                (duplicates.length > 0 && (!form.duplicateAcknowledged || !form.duplicateReason?.trim())) ||
                postingPeriod?.status !== "open" ||
                (!!form.voucherFileName && !form.voucherFileData)
              }
              className="finance-button"
            >
              {busy ? "Posting..." : "Post entry"}
            </button>
          </form>
        </Modal>
      )}
      {attachment && (
        <Modal title="Attach missing receipt" onClose={() => { if (!busy) setAttachment(null); }}>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              try { await api.attachReceipt(type, attachment.id, attachment); }
              catch (failure) { setAttachment((current) => ({ ...current, duplicates: failure.details?.duplicates || [] })); throw failure; }
              setAttachment(null);
            }, "Receipt attached and recorded in audit history");
          }}>
            <Notice error message={error} />
            <p className="text-sm text-slate-600">Add supporting documentation to this entry, including an entry in a closed period. Its financial values stay fixed.</p>
            <Field label="Receipt attachment">
              <input type="file" required accept="image/png,image/jpeg,image/webp,image/gif,.pdf" className="finance-input" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { setError("Receipt must be 2 MB or less"); event.target.value = ""; return; }
                const id = attachment.id;
                try { const data = await fileToBase64(file); setAttachment((current) => current?.id === id ? { ...current, voucherFileName: file.name, voucherFileData: data, duplicates: [], duplicateAcknowledged: false } : current); }
                catch { setError("Could not read receipt"); }
              }} />
            </Field>
            <Field label="Reason for adding this receipt"><textarea required maxLength={1000} className="finance-input" value={attachment.reason} onChange={(event) => setAttachment({ ...attachment, reason: event.target.value })} /></Field>
            <DuplicateReview matches={attachment.duplicates} acknowledged={attachment.duplicateAcknowledged} reason={attachment.duplicateReason}
              onChange={(patch) => setAttachment({ ...attachment, ...patch })} />
            <button className="finance-button" disabled={busy || !attachment.voucherFileData || (attachment.duplicates.length > 0 && (!attachment.duplicateAcknowledged || !attachment.duplicateReason?.trim()))}>Attach receipt</button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal
          title="Edit entry details"
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.updateRow(type, edit.id, {
                  description: edit.description,
                  signature: edit.signature,
                  categoryId: edit.categoryId || null,
                  reason: edit.reason,
                });
                setEdit(null);
              }, "Details updated and recorded in the audit trail");
            }}
          >
            <Notice message={error} error />
            <p className="text-sm text-slate-500">
              Amounts, dates and voucher numbers are fixed after posting.
              Reverse the entry to correct those fields.
            </p>
            <Field label="Category">
              <select
                className="finance-input"
                value={edit.categoryId}
                onChange={(e) =>
                  setEdit({ ...edit, categoryId: e.target.value })
                }
              >
                <option value="">Uncategorized</option>
                {config.categories
                  .filter((c) => c.active || c.id === Number(edit.categoryId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                maxLength={2000}
                className="finance-input"
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </Field>
            <Field label="Signature">
              <input
                maxLength={200}
                className="finance-input"
                value={edit.signature}
                onChange={(e) =>
                  setEdit({ ...edit, signature: e.target.value })
                }
              />
            </Field>
            <Field label="Reason for change">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={edit.reason}
                onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
              />
            </Field>
            <button className="finance-button" disabled={busy}>
              {busy ? "Saving..." : "Save details"}
            </button>
          </form>
        </Modal>
      )}
      {reverse && (
        <Modal
          title={`Reverse voucher ${reverse.row.voucher_no}`}
          onClose={() => {
            if (!busy) setReverse(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.reverseRow(type, reverse.row.id, {
                  date: reverse.date,
                  reason: reverse.reason,
                });
                setReverse(null);
              }, "Reversal posted. The original entry remains in the ledger.");
            }}
          >
            <Notice message={error} error />
            <p className="text-sm bg-amber-50 text-amber-900 border rounded-lg p-3">
              This adds an opposite entry: deposit ৳ {amount(reverse.row.cost)},
              cost ৳ {amount(reverse.row.deposit)}. It preserves the original
              and adjusts the budget in the reversal’s period.
            </p>
            <Field label="Correction date in an open period">
              <input
                required
                type="date"
                min={reverse.row.date}
                className="finance-input"
                value={reverse.date}
                onChange={(e) =>
                  setReverse({ ...reverse, date: e.target.value })
                }
              />
            </Field>
            <Field label="Correction reason">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={reverse.reason}
                onChange={(e) =>
                  setReverse({ ...reverse, reason: e.target.value })
                }
              />
            </Field>
            <button className="finance-button-danger" disabled={busy}>
              {busy ? "Posting..." : "Post reversal"}
            </button>
          </form>
        </Modal>
      )}
      {voucher && (
        <Modal
          title={voucher.name || "Voucher"}
          onClose={() => setVoucher(null)}
        >
          <div className="space-y-4">
            {voucher.data.startsWith("data:image/") && (
              <img
                src={voucher.data}
                alt={voucher.name || "Voucher"}
                className="max-h-[60vh] mx-auto"
              />
            )}
            <a
              className="finance-button"
              href={voucher.data}
              download={voucher.name || "voucher"}
            >
              Download voucher
            </a>
          </div>
        </Modal>
      )}
    </article>
  );
}
