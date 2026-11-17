import { useState } from "react";
import { Copy, Download, Printer } from "lucide-react";
import { downloadBlob, Notice } from "./FinanceUI";
import { useAssistant } from "../state/AssistantContext";

function printableDocument(title, content) {
  const escape = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  return `<!doctype html><html lang="${/[\u0980-\u09ff]/.test(content) ? "bn" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>@page{size:A4;margin:22mm}body{max-width:760px;margin:40px auto;padding:0 20px;color:#111;font:15px/1.7 'Nirmala UI','Segoe UI',sans-serif}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;padding:0}}</style></head><body><pre>${escape(content)}</pre></body></html>`;
}

export default function DocumentDraft({ doc, index }) {
  const { busy, ask, editDocument } = useAssistant();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const content = doc.content;
  const filename = (doc.title || "Document_draft").replace(/[^a-zA-Z0-9_-]/g, "_");
  const revise = (request, patch = {}) => ask(request, null, { document: { ...doc, ...patch, previousDraft: content } });
  return <section aria-label={doc.title + " draft"} className="space-y-3">
    <div><h3 className="font-semibold text-slate-900">{doc.title}</h3><p className="mt-1 text-xs text-slate-500">Editable draft · {doc.language === "bn" ? "Bangla" : doc.language === "en" ? "English" : "Requested language"}</p></div>
    {doc.notice && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{doc.notice}</p>}
    <label className="sr-only" htmlFor={`document-editor-${index}`}>Edit {doc.title}</label>
    <textarea id={`document-editor-${index}`} value={content} maxLength={16000} rows={12} disabled={busy}
      className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      onChange={(event) => editDocument(index, event.target.value)} />
    <div className="flex flex-wrap gap-2">
      <button type="button" className="finance-button-secondary" disabled={!content} onClick={async () => {
        try { await navigator.clipboard.writeText(content); setMessage("Draft copied"); setError(""); }
        catch { setError("Copy was unavailable. Select the text in the editor and copy it manually."); }
      }}><Copy size={14} /> Copy draft</button>
      <button type="button" className="finance-button-secondary" disabled={!content} onClick={() => downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), filename + ".txt")}><Download size={14} /> Download text</button>
      <button type="button" className="finance-button-secondary" disabled={!content} onClick={() => downloadBlob(new Blob([printableDocument(doc.title, content)], { type: "text/html;charset=utf-8" }), filename + ".html")}><Download size={14} /> Download document</button>
      <button type="button" className="finance-button-secondary" disabled={!content} onClick={() => {
        const url = URL.createObjectURL(new Blob([printableDocument(doc.title, content)], { type: "text/html;charset=utf-8" }));
        const page = window.open(url, "_blank");
        if (page) { page.opener = null; page.addEventListener("load", () => page.print(), { once: true }); }
        else setError("Allow the print window, or download the document and print it from your browser.");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }}><Printer size={14} /> Print / PDF</button>
    </div>
    <div className="flex flex-wrap gap-2 border-t pt-3">
      <button type="button" disabled={busy || !content} className="rounded-full border bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-40" onClick={() => revise("Rewrite this complete draft more formally while preserving all supplied facts.", { tone: "formal" })}>Make formal</button>
      <button type="button" disabled={busy || !content} className="rounded-full border bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-40" onClick={() => revise("Make this complete draft shorter while preserving the important facts.", { length: "short" })}>Shorten</button>
      <button type="button" disabled={busy || !content} className="rounded-full border bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-40" onClick={() => revise("Translate this complete draft into Bangla, preserving names, references and amounts.", { language: "bn" })}>Translate to Bangla</button>
      <button type="button" disabled={busy || !content} className="rounded-full border bg-white px-3 py-1.5 text-xs text-indigo-700 disabled:opacity-40" onClick={() => revise("Translate this complete draft into English, preserving names, references and amounts.", { language: "en" })}>Translate to English</button>
    </div>
    <Notice message={message} /><Notice error message={error} />
  </section>;
}
