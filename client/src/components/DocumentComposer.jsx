import { useState } from "react";
import { createPortal } from "react-dom";
import { FilePenLine } from "lucide-react";
import { Field, Modal, today } from "./FinanceUI";
import { useAssistant } from "../state/AssistantContext";

export const writingTypes = {
  email: "Email", bank_draft: "Bank draft application", bank_letter: "Bank letter",
  application: "Formal application", letter: "Official letter", memo: "Office memo / notice",
  proposal: "Proposal", minutes: "Meeting minutes", report: "General report", custom: "Custom document",
};

export default function DocumentComposer({ compact = false }) {
  const { ask, busy } = useAssistant();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("email");
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState("formal");
  const [length, setLength] = useState("standard");
  const [fields, setFields] = useState({ date: today(), currency: "BDT", purpose: "" });
  const [instructions, setInstructions] = useState("");
  const bank = type === "bank_draft" || type === "bank_letter";
  const input = (key, label, maxLength = 400) => <Field key={key} label={label}>
    <input type={key === "date" ? "date" : "text"} maxLength={maxLength} className="finance-input" value={fields[key] || ""} onChange={(event) => setFields({ ...fields, [key]: event.target.value })} />
  </Field>;
  return <>
    <button type="button" disabled={busy} className={compact ? "inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 disabled:opacity-40" : "finance-button-secondary"} onClick={() => setOpen(true)}>
      <FilePenLine size={compact ? 14 : 16} /> Write a document
    </button>
    {open && createPortal(<Modal title="Writing workspace" onClose={() => setOpen(false)}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const document = { type, fields, language, tone, length, instructions };
        ask("Write a " + writingTypes[type].toLowerCase() + " using the supplied details." + (instructions.trim() ? " " + instructions.trim() : ""), null, { document });
        setOpen(false);
      }}>
        <p className="text-sm text-slate-600">Add the facts to include. Missing details become editable placeholders. You can revise, translate, copy or download the result.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Document type"><select className="finance-input" value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(writingTypes).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></Field>
          <Field label="Draft language"><select className="finance-input" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="bn">Bangla</option><option value="auto">Match my request</option></select></Field>
          <Field label="Writing tone"><select className="finance-input" value={tone} onChange={(event) => setTone(event.target.value)}><option value="formal">Formal</option><option value="friendly">Friendly</option><option value="concise">Concise</option></select></Field>
          <Field label="Draft length"><select className="finance-input" value={length} onChange={(event) => setLength(event.target.value)}><option value="short">Short</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></Field>
        </div>
        {type === "bank_draft" && <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">Prepare an application requesting a bank draft or pay order from your bank.</p>}
        <Field label="Purpose / facts to include"><textarea required maxLength={4000} rows={4} className="finance-input" placeholder="Describe the request, reason, dates, decisions, or other facts the document should include." value={fields.purpose} onChange={(event) => setFields({ ...fields, purpose: event.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("subject", "Subject / title")}
          {input("date", "Document date", 10)}
          {input("recipient", "Recipient / role")}
          {input("sender", "Sender / applicant")}
          {input("organization", "Organization / address")}
          {input("reference", "Reference (optional)", 200)}
          {bank && input("bank", "Bank name", 300)}
          {bank && input("branch", "Bank branch", 300)}
          {bank && input("accountReference", "Account / reference (optional)", 200)}
          {type === "bank_draft" && input("payee", "Payee / beneficiary")}
          {type === "bank_draft" && input("amount", "Amount in figures", 80)}
          {type === "bank_draft" && input("currency", "Currency", 20)}
          {type === "bank_draft" && input("amountWords", "Amount in words (optional)")}
        </div>
        <Field label="Additional instructions (optional)"><textarea maxLength={3000} rows={2} className="finance-input" placeholder="For example: use a respectful tone, request a response by the supplied date, or include a list of attachments." value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Field>
        <button className="finance-button" disabled={busy || !fields.purpose.trim()}>Create draft</button>
      </form>
    </Modal>, document.body)}
  </>;
}
