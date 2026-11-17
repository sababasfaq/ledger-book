import { useEffect, useState } from "react";
import { Download, LockKeyhole, Pencil, Plus } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext";
import {
  amount,
  defaultPeriod,
  Field,
  ledgerNames,
  Modal,
  Notice,
  Panel,
  PeriodSelect,
  Stat,
} from "../components/FinanceUI";

async function exportReport(report) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Financial Period Report", 14, 20);
  doc.setFontSize(10);
  doc.text(
    `${report.period.name} | ${report.period.start_date} to ${report.period.end_date}`,
    14,
    28,
  );
  doc.text(
    `Status: ${report.period.status}${report.period.closed_at ? " | Closed: " + report.period.closed_at : ""}`,
    14,
    34,
  );
  autoTable(doc, {
    startY: 42,
    head: [["Ledger", "Opening (BDT)", "Deposits", "Costs", "Closing"]],
    body: report.ledgers.map((row) => [
      ledgerNames[row.type],
      amount(row.opening),
      amount(row.deposits),
      amount(row.costs),
      amount(row.closing),
    ]),
  });
  if (report.budgets?.categories.length)
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [["Category", "Budget (BDT)", "Net spent", "Remaining"]],
      body: report.budgets.categories.map((row) => [
        row.name,
        amount(row.allocated),
        amount(row.spent),
        amount(row.remaining),
      ]),
    });
  doc.save("Financial_period_" + report.period.start_date + ".pdf");
}
export default function PeriodsPage() {
  const { user } = useAuth(),
    isAdmin = user?.role === "super_admin";
  const [periods, setPeriods] = useState([]),
    [periodId, setPeriodId] = useState(""),
    [summary, setSummary] = useState(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null),
    [openings, setOpenings] = useState(null),
    [closing, setClosing] = useState(null);
  useEffect(() => {
    api
      .getPeriods()
      .then((data) => {
        setPeriods(data);
        setPeriodId(defaultPeriod(data));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!periodId) return;
    let active = true;
    setSummary(null);
    setError("");
    api
      .getPeriodSummary(periodId)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [periodId]);
  const refresh = async (id = periodId) => {
    const list = await api.getPeriods();
    setPeriods(list);
    if (id) setSummary(await api.getPeriodSummary(id));
  };
  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const period = summary?.period;
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Financial Periods</h1>
          <p className="text-sm text-slate-500 mt-1">
            Opening balances, carry forwards and closing reports for every
            ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodSelect
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
          />
          {isAdmin && (
            <button
              className="finance-button"
              onClick={() =>
                setForm({ name: "", startDate: "", endDate: "", reason: "" })
              }
            >
              <Plus size={16} />
              New period
            </button>
          )}
        </div>
      </header>
      <Notice message={error} error />
      <Notice message={message} />
      {summary ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Opening balance" value={summary.totalOpening} />
            <Stat label="Period deposits" value={summary.totalDeposits} />
            <Stat label="Period costs" value={summary.totalCosts} />
            <Stat label="Closing balance" value={summary.totalClosing} />
          </div>
          <Panel
            title={`${period.name} · ${period.start_date} to ${period.end_date}`}
            actions={
              <span
                className={`finance-badge ${period.status === "closed" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}
              >
                {period.status === "closed"
                  ? "Closed and locked"
                  : "Open for posting"}
              </span>
            }
          >
            <p className="text-sm text-slate-500 mb-4">
              {period.status === "closed"
                ? "Transactions and budgets in this period are locked. Corrections can be posted as reversals in a later open period."
                : "Balances carry forward automatically from earlier periods. Close periods in chronological order."}
            </p>
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Ledger</th>
                    <th>Opening</th>
                    <th>Deposits</th>
                    <th>Costs</th>
                    <th>Closing</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.ledgers.map((row) => (
                    <tr key={row.type}>
                      <td className="font-medium">{ledgerNames[row.type]}</td>
                      <td>৳ {amount(row.opening)}</td>
                      <td>৳ {amount(row.deposits)}</td>
                      <td>৳ {amount(row.costs)}</td>
                      <td className="font-semibold">৳ {amount(row.closing)}</td>
                      <td>{row.entryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="finance-button-secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    async () =>
                      exportReport(await api.getPeriodReport(periodId)),
                    "Report downloaded",
                  )
                }
              >
                <Download size={16} />
                Download {period.status === "closed"
                  ? "closing"
                  : "period"}{" "}
                report
              </button>
              {isAdmin && period.status === "open" && (
                <>
                  <button
                    className="finance-button-secondary"
                    onClick={() =>
                      setForm({
                        id: period.id,
                        name: period.name,
                        startDate: period.start_date,
                        endDate: period.end_date,
                        reason: "",
                      })
                    }
                  >
                    <Pencil size={16} />
                    Edit period
                  </button>
                  {summary.canEditOpening && (
                    <button
                      className="finance-button-secondary"
                      onClick={() =>
                        setOpenings({
                          balances: Object.fromEntries(
                            summary.ledgers.map((row) => [
                              row.type,
                              String(row.opening),
                            ]),
                          ),
                          reason: "",
                        })
                      }
                    >
                      Set opening balances
                    </button>
                  )}
                  <button
                    className="finance-button-danger"
                    onClick={() => setClosing({ reason: "", confirmed: false })}
                  >
                    <LockKeyhole size={16} />
                    Close period
                  </button>
                </>
              )}
            </div>
            {period.closed_at && (
              <p className="text-xs text-slate-400 mt-4">
                Closed {new Date(period.closed_at).toLocaleString()}
              </p>
            )}
          </Panel>
        </>
      ) : (
        <p role="status" className="text-slate-500">
          Loading period...
        </p>
      )}
      <Panel title="How periods work">
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
          <li>
            Each transaction date must fall inside an open financial period.
          </li>
          <li>
            The first period can have initial opening balances. Later periods
            carry earlier balances forward automatically.
          </li>
          <li>
            Closed periods keep a saved closing report and cannot be edited or
            reopened through the app.
          </li>
          <li>
            Migration creates calendar-year periods for existing records. Empty
            periods can be edited, and new periods can use your institution’s
            financial-year dates.
          </li>
        </ul>
      </Panel>
      {form && (
        <Modal
          title={form.id ? "Edit financial period" : "New financial period"}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const saved = form.id
                  ? await api.updatePeriod(form.id, form)
                  : await api.createPeriod(form);
                setForm(null);
                setPeriodId(String(saved.id));
                await refresh(saved.id);
              }, "Financial period saved");
            }}
          >
            <Notice message={error} error />
            <Field label="Period name">
              <input
                className="finance-input"
                required
                maxLength={80}
                placeholder="e.g. FY 2027–28"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start date">
                <input
                  type="date"
                  className="finance-input"
                  required
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  className="finance-input"
                  required
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Reason or note">
              <textarea
                className="finance-input"
                maxLength={1000}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </Field>
            <button disabled={busy} className="finance-button">
              {busy ? "Saving..." : "Save period"}
            </button>
          </form>
        </Modal>
      )}
      {openings && (
        <Modal
          title="Initial opening balances"
          onClose={() => {
            if (!busy) setOpenings(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.setOpeningBalances(periodId, openings);
                setOpenings(null);
                await refresh();
              }, "Opening balances saved");
            }}
          >
            <Notice message={error} error />
            <p className="text-sm text-slate-500">
              Enter the funds held before the first period begins. Negative
              balances are allowed. The change is recorded in the audit trail.
            </p>
            {Object.keys(ledgerNames).map((type) => (
              <Field key={type} label={`${ledgerNames[type]} (BDT)`}>
                <input
                  className="finance-input"
                  type="number"
                  step="0.01"
                  required
                  value={openings.balances[type]}
                  onChange={(e) =>
                    setOpenings({
                      ...openings,
                      balances: {
                        ...openings.balances,
                        [type]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Reason">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={openings.reason}
                onChange={(e) =>
                  setOpenings({ ...openings, reason: e.target.value })
                }
              />
            </Field>
            <button disabled={busy} className="finance-button">
              {busy ? "Saving..." : "Save opening balances"}
            </button>
          </form>
        </Modal>
      )}
      {closing && (
        <Modal
          title={`Close ${period?.name}`}
          onClose={() => {
            if (!busy) setClosing(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.closePeriod(periodId, closing.reason);
                setClosing(null);
                await refresh();
              }, "Period closed. Its closing report has been saved.");
            }}
          >
            <Notice message={error} error />
            <p className="text-sm text-amber-900 bg-amber-50 border rounded-lg p-3">
              Closing permanently locks this period’s transactions and budgets.
              Verify the figures before continuing.
            </p>
            <Field label="Closing note">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={closing.reason}
                onChange={(e) =>
                  setClosing({ ...closing, reason: e.target.value })
                }
              />
            </Field>
            <label className="flex gap-2 items-center text-sm">
              <input
                required
                type="checkbox"
                checked={closing.confirmed}
                onChange={(e) =>
                  setClosing({ ...closing, confirmed: e.target.checked })
                }
              />
              I have reviewed the closing balances.
            </label>
            <button
              disabled={busy || !closing.confirmed}
              className="finance-button-danger"
            >
              {busy ? "Closing..." : "Close and lock period"}
            </button>
          </form>
        </Modal>
      )}
    </article>
  );
}
