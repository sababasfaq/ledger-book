import { useEffect, useRef, useState } from "react";
import { ScanLine, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Field, Notice } from "./FinanceUI";
import { Link } from "react-router-dom";

export default function ReceiptScanner({
  ledgerType,
  image,
  fileName,
  existingVoucherNo = "",
  onFileSelected,
  onApply,
  onBusyChange,
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [checked, setChecked] = useState(false),
    [selected, setSelected] = useState({});
  const controller = useRef(null);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
    setMessage("");
    setChecked(false);
  }, [image]);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyChange(false);
    },
    [onBusyChange],
  );
  const readable =
    typeof image === "string" &&
    /^data:image\/(?:png|jpeg|webp);base64,/.test(image);
  const scan = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setResult(null);
    setChecked(false);
    const request = new AbortController();
    controller.current = request;
    try {
      const data = await api.scanReceipt({ ledgerType, image }, request.signal);
      if (request.signal.aborted) return;
      setResult(data);
      const fields = data.fields;
      setSelected({
        date: !!fields.date,
        totalAmount:
          !!fields.totalAmount &&
          (!fields.currency || fields.currency === "BDT"),
        receiptNumber: !existingVoucherNo && !!fields.receiptNumber,
        categoryId: !!fields.categoryId,
        description: !!fields.description,
        taxTypeId: !!fields.taxTypeId,
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  const cancel = () => {
    controller.current?.abort();
    setBusy(false);
    setError("");
    setMessage(
      "Reading cancelled. You can enter the receipt details manually.",
    );
  };
  const options = result
    ? [
        ["date", "Transaction date", result.fields.date],
        [
          "receiptNumber",
          "Use receipt number as voucher reference",
          result.fields.receiptNumber,
        ],
        [
          "totalAmount",
          "Cost (BDT)",
          result.fields.currency && result.fields.currency !== "BDT"
            ? null
            : result.fields.totalAmount,
        ],
        ["categoryId", "Suggested category", result.fields.categoryName],
        ["description", "Description", result.fields.description],
        [
          "taxTypeId",
          "Suggested tax selection",
          result.fields.taxTypeId
            ? `${result.fields.taxRate}% (matching configured tax)`
            : null,
        ],
      ]
    : [];
  return (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3"
      aria-label="Local receipt scanner"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <ScanLine size={18} />
          Fill from a receipt
        </h3>
        <span className="text-xs text-slate-500 flex gap-1 items-center">
          <ShieldCheck size={14} />
          Processed on this computer
        </span>
      </div>
      <p className="text-xs text-slate-600">
        Upload a printed Bangla or English receipt. Review the extracted fields
        before applying them to this draft. Handwriting and unclear photos may
        need manual entry.
      </p>
      <Field label="Receipt image for autofill">
        <input
          disabled={busy}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="finance-input"
          onChange={onFileSelected}
        />
      </Field>
      {fileName && (
        <p className="text-xs text-slate-500">Attached: {fileName}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="finance-button-secondary"
          disabled={!readable || busy}
          onClick={scan}
        >
          <ScanLine size={16} />
          {busy ? "Reading receipt locally..." : "Read receipt"}
        </button>
        {busy && (
          <button
            type="button"
            className="finance-button-secondary"
            onClick={cancel}
          >
            Cancel reading
          </button>
        )}
      </div>
      <Notice error message={error} />
      <Notice message={message} />
      {result && (
        <div className="space-y-3 border-t border-blue-200 pt-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span>OCR quality estimate: {result.quality}/100</span>
            <span>
              ·{" "}
              {result.method === "local-ocr+model"
                ? "Local OCR + language model"
                : "Local OCR"}
            </span>
            <span>
              · Currency: {result.fields.currency || "Confirm manually"}
            </span>
          </div>
          <img
            src={image}
            alt="Receipt being reviewed"
            className="max-h-56 max-w-full mx-auto border rounded bg-white"
          />
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-600">
            Selected fields replace the corresponding draft values. A receipt
            number may differ from your department’s voucher number.
          </p>
          {result.duplicates?.length > 0 && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
            <p className="font-semibold">Review possible duplicates</p>
            {result.duplicates.map((match) => <p key={match.ledgerType + ":" + match.id}><Link className="text-blue-800 underline" to={match.href} target="_blank" rel="noopener noreferrer">{match.voucherNo} · {match.date}</Link><span className="block text-amber-900">{match.reasons.join(" · ")}</span></p>)}
          </div>}
          <div className="rounded-lg border bg-white divide-y">
            {options.map(([key, label, value]) => (
              <label key={key} className="flex gap-3 items-start p-3 text-sm">
                <input
                  type="checkbox"
                  disabled={!value}
                  checked={!!selected[key] && !!value}
                  onChange={(e) =>
                    setSelected({ ...selected, [key]: e.target.checked })
                  }
                />
                <span>
                  <span className="block text-xs text-slate-500">{label}</span>
                  <span className="block whitespace-pre-wrap">
                    {value || "Not filled — enter manually"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-600">
              Show extracted source text
            </summary>
            <pre className="whitespace-pre-wrap break-words rounded border bg-white p-3 mt-2 max-h-48 overflow-auto">
              {result.ocrText}
            </pre>
          </details>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I checked the selected fields against the receipt and confirmed BDT
            amounts.
          </label>
          <button
            type="button"
            disabled={!checked || !Object.values(selected).some(Boolean)}
            className="finance-button"
            onClick={() => {
              const fields = result.fields,
                patch = { receiptNumber: fields.receiptNumber || "", receiptMerchant: fields.merchant || "" };
              if (selected.date && fields.date) patch.date = fields.date;
              if (selected.receiptNumber && fields.receiptNumber)
                patch.voucherNo = fields.receiptNumber;
              if (
                selected.totalAmount &&
                fields.totalAmount &&
                (!fields.currency || fields.currency === "BDT")
              )
                patch.cost = fields.totalAmount;
              if (selected.categoryId && fields.categoryId)
                patch.categoryId = String(fields.categoryId);
              if (selected.taxTypeId && fields.taxTypeId)
                patch.taxTypeId = String(fields.taxTypeId);
              if (selected.description && fields.description)
                patch.description = fields.description;
              onApply(patch);
              setResult(null);
              setChecked(false);
              setMessage(
                "Receipt values filled into the draft. Review the form, then post the entry when ready.",
              );
            }}
          >
            Apply reviewed fields
          </button>
        </div>
      )}
    </section>
  );
}
