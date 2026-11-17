import { Link } from "react-router-dom";
import { Field, ledgerNames } from "./FinanceUI";

export default function DuplicateReview({ matches = [], acknowledged, reason, onChange }) {
  if (!matches.length) return null;
  return (
    <section aria-label="Possible duplicates" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <h3 className="font-semibold text-amber-900">Possible duplicate entries</h3>
      <ul className="space-y-2">
        {matches.map((match) => (
          <li key={match.ledgerType + ":" + match.id}>
            <Link to={match.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-800 underline">
              {match.voucherNo} · {ledgerNames[match.ledgerType]} · {match.date}
            </Link>
            <p className="text-xs text-amber-900">{match.reasons.join(" · ")}</p>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2"><input type="checkbox" checked={!!acknowledged} onChange={(event) => onChange({ duplicateAcknowledged: event.target.checked })} />I reviewed the matches and this is a separate, valid transaction.</label>
      <Field label="Reason for continuing despite duplicate warning">
        <textarea className="finance-input" maxLength={1000} value={reason || ""} onChange={(event) => onChange({ duplicateReason: event.target.value })} />
      </Field>
    </section>
  );
}
