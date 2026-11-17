import { useEffect, useId, useRef } from "react";
import { Bot, Send, Square, Trash2 } from "lucide-react";
import { useAssistant } from "../state/AssistantContext";
import { Notice } from "./FinanceUI";
import AssistantResult from "./AssistantResult";
import DocumentComposer from "./DocumentComposer";
import DocumentDraft from "./DocumentDraft";

const suggestions = [
  ["Add an expense", "How do I add an expense?"],
  ["Draft an email", "Help me draft a professional email requesting department supplies."],
  ["Bank draft application", "Write an application to a bank manager requesting issuance of a bank draft. Use placeholders for details I have not supplied."],
  ["Explain a topic", "Can you help me understand a study topic?"],
];

export default function AssistantChat({ compact = false }) {
  const { status, messages, draft, setDraft, busy, stage, error, prepare, refresh, ask, cancel, clear } = useAssistant();
  const inputId = useId();
  const scroll = useRef(null);
  useEffect(() => { prepare(); }, [prepare]);
  useEffect(() => {
    const area = scroll.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages, busy]);

  const send = () => {
    if (!busy && status && draft.trim()) ask(draft);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white" aria-label="Assistant conversation">
      <header className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-600">
          {status?.model.ready ? "Local AI · Bangla & English" : status ? "Local AI is offline" : "Checking local AI…"}
        </p>
        <button type="button" disabled={!messages.length && !draft} onClick={clear}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-40">
          <Trash2 size={13} /> Clear conversation
        </button>
      </header>
      <div ref={scroll} className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 ${compact ? "" : "min-h-[320px] max-h-[60vh]"}`}>
        <Notice error message={error} />
        {status && !status.model.ready && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>Common financial questions and app instructions still work. Start local AI for general chat and more complex questions.</p>
            <p className="mt-2 text-xs">In the server terminal, run <code>npm run ai:start</code>.</p>
            <button type="button" className="mt-2 text-xs font-semibold underline" onClick={refresh}>Check connection</button>
          </div>
        )}
        {!messages.length && (
          <div className="py-4">
            <div className="mb-3 inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-600"><Bot size={26} /></div>
            <h2 className="text-lg font-semibold">How can I help?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Ask about expenses, budgets or using the app. I can also explain topics, help with code, translate, and draft emails or documents.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map(([label, question]) => (
                <button key={label} type="button" className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                  onClick={() => setDraft(question)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" className="space-y-4">
          {messages.filter((message) => !message.streaming || message.text).map((message) => {
            const index = messages.indexOf(message);
            return (
            <div key={index} className={`rounded-2xl p-3 ${message.role === "user" ? "ml-6 bg-indigo-600 text-white" : message.error ? "border border-red-100 bg-red-50 text-red-800" : "mr-3 border border-slate-200 bg-slate-50 text-slate-800"}`}>
              <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${message.role === "user" ? "text-indigo-100" : "text-slate-500"}`}>
                {message.role === "user" ? "You" : message.result?.mode === "quick-report" ? "Computed report" : "Local assistant"}
              </p>
              {message.result?.document ? <DocumentDraft doc={message.result.document} index={index} /> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>}
              {message.result?.generation?.truncated && <p className="mt-2 text-xs text-amber-800">This reply reached its length limit. Ask me to continue or request a shorter version.</p>}
              {message.result && <AssistantResult result={message.result} />}
            </div>
          ); })}
        </div>
        {busy && <p role="status" className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />{stage || "Writing locally…"} You can minimize chat while I work.</p>}
      </div>
      <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <label htmlFor={inputId} className="sr-only">Ask the local assistant</label>
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <textarea id={inputId} maxLength={6000} rows={compact ? 2 : 3} value={draft} disabled={busy}
            placeholder="Ask anything in Bangla or English…"
            className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-60"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); send();
              }
            }} />
          {busy ? (
            <button type="button" aria-label="Cancel request" onClick={cancel} className="rounded-lg bg-slate-100 p-2.5 text-slate-700 hover:bg-slate-200"><Square size={17} /></button>
          ) : (
            <button type="submit" aria-label="Ask assistant" disabled={!draft.trim() || !status}
              className="rounded-lg bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"><Send size={17} /></button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><DocumentComposer compact /><p className="text-[10px] text-slate-500">Enter to send · Shift + Enter for a new line</p></div>
        <p className="text-[10px] text-slate-500">Review generated drafts and financial details before using them.</p>
      </form>
    </section>
  );
}
