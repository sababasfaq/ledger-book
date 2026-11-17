import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { amount, downloadBlob, ledgerNames } from "./FinanceUI";

export default function AssistantResult({ result }) {
  return (
    <div className="space-y-3 mt-3">
      {result.scope && (
        <p className="text-xs text-slate-500">
          Range: {result.scope.start} to {result.scope.end} ·{" "}
          {result.scope.ledgerTypes.map((type) => ledgerNames[type]).join(", ")}
        </p>
      )}
      {!!result.metrics?.length && (
        <div className="grid sm:grid-cols-2 gap-2">
          {result.metrics.map((metric) => (
            <div key={metric.label} className="bg-white rounded-lg border p-3">
              <div className="text-[11px] text-slate-500">{metric.label}</div>
              <div className="font-semibold mt-1">
                {metric.kind === "count" ? metric.value : "৳ " + amount(metric.value)}
              </div>
            </div>
          ))}
        </div>
      )}
      {!!result.columns?.length && (
        <div className="overflow-x-auto bg-white rounded-lg border">
          <table className="finance-table">
            <thead>
              <tr>{result.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={row.id || index}>
                  {result.columns.map((column) => (
                    <td key={column.key}>
                      {column.money ? "৳ " + amount(row[column.key]) : String(row[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
              {!result.rows.length && (
                <tr><td colSpan={result.columns.length} className="text-slate-400 text-center">No matching records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {result.reportText && (
        <button type="button" className="finance-button-secondary" onClick={() => downloadBlob(
          new Blob([result.reportText], { type: "text/plain;charset=utf-8" }), "Expense_report.txt",
        )}>
          <Download size={15} /> Download report draft
        </button>
      )}
      {result.sources?.length > 0 && (
        <p className="text-[11px] text-slate-500">Source: {result.sources.join(" · ")}</p>
      )}
      {result.operation === "help" && (
        <Link to="/general-ledger" className="text-sm text-blue-700 hover:underline">Open General Ledger</Link>
      )}
      {result.evidence && (
        <details className="rounded-lg border bg-white p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-blue-800">View source entries ({result.evidence.total})</summary>
          <p className="my-2 text-slate-600">{result.evidence.explanation}</p>
          <ul className="space-y-2">
            {result.evidence.entries.map((entry) => (
              <li key={entry.ledgerType + ":" + entry.id}>
                <Link to={entry.href} className="text-blue-700 underline">{entry.voucherNo} · {ledgerNames[entry.ledgerType]} · {entry.date}</Link>
                <span className="block text-slate-500">Deposit ৳ {amount(entry.deposit)} · Cost ৳ {amount(entry.cost)}{entry.reversalOf ? " · Reversal" : ""}</span>
              </li>
            ))}
          </ul>
          {result.evidence.total > result.evidence.entries.length && <p className="mt-2 text-slate-500">Showing the latest {result.evidence.entries.length} of {result.evidence.total} matching entries. Open the ledgers for the complete records.</p>}
          {!result.evidence.total && <p>No saved entries match this report scope.</p>}
        </details>
      )}
    </div>
  );
}
