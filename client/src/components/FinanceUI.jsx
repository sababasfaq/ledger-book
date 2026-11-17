import { cloneElement, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export const ledgerNames = {
  general: "General Ledger",
  unofficial: "Unofficial Ledger",
  association: "Student Association",
  departmental: "Department Ledger",
};
export const amount = (value) =>
  Number(value || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function defaultPeriod(periods) {
  const date = today();
  return (
    periods.find((p) => p.start_date <= date && p.end_date >= date)?.id ||
    periods[0]?.id ||
    ""
  );
}
export function Notice({ message, error = false }) {
  return message ? (
    <div
      role={error ? "alert" : "status"}
      className={`p-3 rounded-lg border text-sm ${error ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`}
    >
      {message}
    </div>
  ) : null;
}
export function Panel({ title, children, actions }) {
  return (
    <section className="bg-white border rounded-xl shadow-sm overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/70 px-5 py-4">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {actions}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
export function Field({ label, children }) {
  const generatedId = useId(),
    id = children.props.id || generatedId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function PeriodSelect({ periods, value, onChange, all = false }) {
  return (
    <Field label="Financial period">
      <select
        className="finance-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {all && <option value="">All periods</option>}
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.name}
            {period.status === "closed" ? " · Closed" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Stat({ label, value, note }) {
  return (
    <div className="rounded-xl bg-white border p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-xl font-bold mt-2">৳ {amount(value)}</div>
      {note && <div className="text-xs text-slate-500 mt-1">{note}</div>}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null),
    callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    const prior = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = ref.current;
    const focusables = () => [
      ...element.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
      ),
    ];
    (focusables()[0] || element).focus();
    const key = (e) => {
      if (e.key === "Escape") callback.current();
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      element.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/50 p-4 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <header className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="p-1 rounded hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={22} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
