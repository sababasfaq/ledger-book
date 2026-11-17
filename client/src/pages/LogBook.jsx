import { useEffect, useState } from "react";
import { api } from "../api";
import { Field, Modal, Notice, Panel } from "../components/FinanceUI";

const actions = [
  "ADD",
  "EDIT",
  "IMPORT",
  "REVERSE",
  "CLOSE",
  "APPROVE",
  "DELETE",
  "BACKUP",
  "DOWNLOAD",
  "RESTORE",
  "PASSWORD_CHANGE",
  "RECEIPT_SCAN",
  "ASK_AI",
];
const areas = [
  "general_ledger",
  "unofficial_ledger",
  "association_ledger",
  "departmental_ledger",
  "expense_categories",
  "category_budgets",
  "financial_periods",
  "ledger_openings",
  "tax_types",
  "tax_return_challans",
  "users",
  "instructions",
  "instruction_submissions",
  "backups",
  "backup_settings",
  "ai_receipts",
  "ai_assistant",
];
const empty = { search: "", action: "", table: "", from: "", to: "" };
const display = (value) =>
  value == null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);
export default function LogBook() {
  const [filters, setFilters] = useState(empty),
    [query, setQuery] = useState(empty),
    [page, setPage] = useState(1);
  const [data, setData] = useState({ events: [], total: 0, pageSize: 50 }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [event, setEvent] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .getAudit({ ...query, page })
      .then((result) => {
        if (active) setData(result);
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
  }, [query, page]);
  const keys = event
    ? [
        ...new Set([
          ...Object.keys(event.before || {}),
          ...Object.keys(event.after || {}),
        ]),
      ].filter(
        (key) =>
          JSON.stringify(event.before?.[key]) !==
          JSON.stringify(event.after?.[key]),
      )
    : [];
  return (
    <article className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Audit History</h1>
        <p className="text-sm text-slate-500 mt-1">
          Append-only history with before and after values, reasons and linked
          corrections.
        </p>
      </header>
      <Notice message={error} error />
      <form
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-white border rounded-xl p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery({ ...filters });
        }}
      >
        <Field label="Person or reason">
          <input
            className="finance-input"
            placeholder="Search audit history"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </Field>
        <Field label="Action">
          <select
            className="finance-input"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action}>{action}</option>
            ))}
          </select>
        </Field>
        <Field label="Area">
          <select
            className="finance-input"
            value={filters.table}
            onChange={(e) => setFilters({ ...filters, table: e.target.value })}
          >
            <option value="">All areas</option>
            {areas.map((area) => (
              <option key={area}>{area}</option>
            ))}
          </select>
        </Field>
        <Field label="From date">
          <input
            type="date"
            className="finance-input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </Field>
        <Field label="To date">
          <input
            type="date"
            className="finance-input"
            min={filters.from}
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </Field>
        <div className="flex items-end gap-2">
          <button className="finance-button">Apply filters</button>
          <button
            type="button"
            className="finance-button-secondary"
            onClick={() => {
              setFilters(empty);
              setQuery(empty);
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      </form>
      <Panel title={`${data.total} audit events`}>
        <div className="overflow-x-auto">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Person</th>
                <th>Area / record</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-xs">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td>
                    {row.user_name}
                    <div className="text-xs text-slate-400">
                      {row.role === "super_admin" ? "Chairman" : row.role}
                    </div>
                  </td>
                  <td className="text-xs">
                    {row.table_name}
                    {row.row_id ? ` #${row.row_id}` : ""}
                  </td>
                  <td>
                    <span className="finance-badge bg-slate-100 text-slate-700">
                      {row.action}
                    </span>
                  </td>
                  <td className="max-w-sm whitespace-pre-wrap">
                    {row.reason || "—"}
                  </td>
                  <td>
                    <button
                      className="finance-button-secondary"
                      onClick={() => setEvent(row)}
                    >
                      View changes
                    </button>
                  </td>
                </tr>
              ))}
              {!data.events.length && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    {loading ? "Loading history..." : "No matching events."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav
          aria-label="Audit pagination"
          className="flex justify-between items-center pt-4 text-sm"
        >
          <span>
            Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}
          </span>
          <div className="flex gap-2">
            <button
              className="finance-button-secondary"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <button
              className="finance-button-secondary"
              disabled={page * data.pageSize >= data.total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      </Panel>
      {event && (
        <Modal
          title={`${event.action} · ${event.table_name}${event.row_id ? " #" + event.row_id : ""}`}
          onClose={() => setEvent(null)}
        >
          <p className="text-sm mb-2">
            {event.user_name} · {new Date(event.created_at).toLocaleString()}
          </p>
          {event.reason && (
            <p className="text-sm bg-slate-50 border rounded p-3 mb-4 whitespace-pre-wrap">
              {event.reason}
            </p>
          )}
          {keys.length ? (
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key}>
                      <td className="text-xs font-medium">
                        {key.replaceAll("_", " ")}
                      </td>
                      <td>
                        <pre className="text-xs whitespace-pre-wrap break-all max-w-xs">
                          {display(event.before?.[key])}
                        </pre>
                      </td>
                      <td>
                        <pre className="text-xs whitespace-pre-wrap break-all max-w-xs">
                          {display(event.after?.[key])}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {event.legacy_log_id
                ? "This event predates detailed auditing. Its original timestamp and actor have been retained."
                : "This event has no field changes."}
            </p>
          )}
        </Modal>
      )}
    </article>
  );
}
