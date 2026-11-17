import { useEffect } from "react";
import { Bot, ShieldCheck } from "lucide-react";
import { useAssistant } from "../state/AssistantContext";
import AssistantChat from "../components/AssistantChat";
import { Field, ledgerNames, Panel, PeriodSelect } from "../components/FinanceUI";

const quickReports = [
  ["overview", "Period overview"],
  ["budgets", "Budget alerts"],
  ["instructions", "Pending instructions"],
  ["missing_receipts", "Missing receipts"],
  ["report", "Draft expense report"],
];

export default function AssistantPage() {
  const { status, periods, periodId, setPeriodId, ledgerType, setLedgerType, busy, prepare, refresh, ask } = useAssistant();
  useEffect(() => { prepare(); }, [prepare]);

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot size={25} /> AI Assistant</h1>
          <p className="mt-1 text-sm text-slate-500">Chat, learn, write, or ask about your department in Bangla or English.</p>
        </div>
        <span className="finance-badge inline-flex items-center gap-1 bg-emerald-50 text-emerald-800"><ShieldCheck size={14} /> Local processing · No cloud API</span>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <aside className="space-y-4">
          <Panel title="Report context">
            <div className="space-y-4">
              <PeriodSelect periods={periods} value={periodId} onChange={setPeriodId} />
              <Field label="Ledger scope">
                <select className="finance-input" value={ledgerType} onChange={(event) => setLedgerType(event.target.value)}>
                  <option value="all">All ledgers</option>
                  {Object.entries(ledgerNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Field>
              <p className="text-xs text-slate-500">Financial questions use this context. Each report shows its actual date range. Category budgets cover all ledgers. General chat does not need a financial period.</p>
            </div>
          </Panel>
          <Panel title="Quick reports">
            <div className="flex flex-col gap-2">
              {quickReports.map(([key, label]) => (
                <button key={key} disabled={busy || !periodId} className="finance-button-secondary justify-start" onClick={() => ask(label, key)}>{label}</button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Calculated from saved records. These reports work even when the language model is offline.</p>
          </Panel>
          <Panel title="Local AI status">
            <div className="space-y-3 text-sm">
              <p>Assistant: <strong className={status?.model.ready ? "text-emerald-700" : "text-amber-700"}>{!status ? "Checking…" : status.model.ready ? "Ready" : status.model.runtimeAvailable ? "Model not installed" : "Runtime not running"}</strong></p>
              <p>Receipt reading: <strong className={status?.ocr.ready ? "text-emerald-700" : "text-amber-700"}>{!status ? "Checking…" : status.ocr.ready ? "Ready · Bangla + English" : "Needs language files"}</strong></p>
              <button className="finance-button-secondary" onClick={refresh}>Refresh status</button>
              {status && !status.model.ready && <p className="text-xs text-amber-800">{status.model.reason}</p>}
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer">Local AI setup</summary>
                <p className="mt-2">In the server terminal, run:</p>
                <code className="my-2 block rounded bg-slate-100 p-2">npm run ai:setup</code>
                <p>This installs the local model and Bangla/English receipt tools once. After restarting your computer, use <code>npm run ai:start</code>.</p>
                <p className="mt-2">Model: {status?.model.model || "qwen3:1.7b"}. General answers come from the local model without live web access.</p>
              </details>
            </div>
          </Panel>
        </aside>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm lg:col-span-2">
          <AssistantChat />
        </div>
      </div>
    </article>
  );
}
