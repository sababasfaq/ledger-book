import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext";
import {
  amount,
  defaultPeriod,
  Field,
  Modal,
  Notice,
  Panel,
  PeriodSelect,
  Stat,
} from "../components/FinanceUI";
import { Pencil, Plus, Tag } from "lucide-react";

const emptyBudget = {
  categoryId: "",
  amount: "",
  alertPercent: 80,
  reason: "",
};
export default function BudgetsPage() {
  const { user } = useAuth(),
    isAdmin = user?.role === "super_admin";
  const [config, setConfig] = useState({ periods: [], categories: [] }),
    [periodId, setPeriodId] = useState("");
  const [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(null),
    [category, setCategory] = useState(null);
  useEffect(() => {
    api
      .getFinanceConfig()
      .then((data) => {
        setConfig(data);
        setPeriodId(defaultPeriod(data.periods));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!periodId) return;
    let active = true;
    setReport(null);
    setError("");
    api
      .getBudgets(periodId)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [periodId]);
  const refresh = async () => {
    const [cfg, data] = await Promise.all([
      api.getFinanceConfig(),
      api.getBudgets(periodId),
    ]);
    setConfig(cfg);
    setReport(data);
  };
  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const selected = config.periods.find((p) => p.id === Number(periodId));
  const locked = selected?.status === "closed";
  const alerts =
    report?.categories.filter((c) =>
      ["warning", "over-budget", "unbudgeted"].includes(c.status),
    ) || [];
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Budgets & Categories</h1>
          <p className="text-sm text-slate-500 mt-1">
            Plan spending across all four ledgers and track it against each
            category.
          </p>
        </div>
        <PeriodSelect
          periods={config.periods}
          value={periodId}
          onChange={setPeriodId}
        />
      </header>
      <Notice message={error} error />
      <Notice message={message} />
      {locked && (
        <div className="p-3 rounded-lg border bg-amber-50 text-sm text-amber-900">
          This period is closed. Its allocations are locked; the closing report
          preserves the figures recorded at closing.
        </div>
      )}
      {report ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Allocated" value={report.totalAllocated} />
            <Stat
              label="Net category spending"
              value={report.totalSpent}
              note="Expenses less expense reversals"
            />
            <Stat
              label="Remaining overall"
              value={report.totalAllocated - report.totalSpent}
            />
            <Stat
              label="Uncategorized spending"
              value={report.uncategorizedSpent}
              note="Includes legacy records without a category"
            />
          </div>
          {alerts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>{alerts.length} categories need attention.</strong>{" "}
              {alerts
                .map((c) => `${c.name}: ${c.status.replaceAll("-", " ")}`)
                .join(" · ")}
            </div>
          )}
          <Panel
            title="Category allocations"
            actions={
              isAdmin &&
              !locked && (
                <button
                  className="finance-button"
                  onClick={() => setBudget({ ...emptyBudget })}
                >
                  <Plus size={16} />
                  Set budget
                </button>
              )
            }
          >
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budget</th>
                    <th>Spent</th>
                    <th>Remaining</th>
                    <th>Usage</th>
                    <th>Status</th>
                    {isAdmin && !locked && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.categories
                    .filter((c) => c.active || c.spent || c.allocated)
                    .map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium">
                          {c.name}
                          {!c.active && (
                            <span className="ml-2 text-xs text-slate-400">
                              Archived
                            </span>
                          )}
                        </td>
                        <td>৳ {amount(c.allocated)}</td>
                        <td>৳ {amount(c.spent)}</td>
                        <td
                          className={
                            c.remaining < 0 ? "text-red-700 font-semibold" : ""
                          }
                        >
                          ৳ {amount(c.remaining)}
                        </td>
                        <td className="min-w-[130px]">
                          <div className="flex justify-between text-xs mb-1">
                            <span>
                              {c.utilization === null
                                ? "No allocation"
                                : `${c.utilization}%`}
                            </span>
                            <span className="text-slate-400">
                              Alert {c.alertPercent}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded overflow-hidden">
                            <div
                              className={`h-full ${c.status === "over-budget" ? "bg-red-500" : c.status === "warning" ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{
                                width:
                                  Math.max(
                                    0,
                                    Math.min(100, c.utilization || 0),
                                  ) + "%",
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <span
                            className={`finance-badge ${["over-budget", "unbudgeted"].includes(c.status) ? "bg-red-50 text-red-700" : c.status === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}
                          >
                            {c.status.replaceAll("-", " ")}
                          </span>
                        </td>
                        {isAdmin && !locked && (
                          <td>
                            {!!c.active && (
                              <button
                                className="finance-button-secondary"
                                aria-label={`Adjust budget for ${c.name}`}
                                onClick={() =>
                                  setBudget({
                                    categoryId: String(c.id),
                                    amount: String(c.allocated),
                                    alertPercent: c.alertPercent,
                                    reason: "",
                                  })
                                }
                              >
                                <Pencil size={14} />
                                Adjust
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <p role="status" className="text-slate-500">
          Loading budgets...
        </p>
      )}
      <Panel
        title="Expense categories"
        actions={
          isAdmin && (
            <button
              className="finance-button-secondary"
              onClick={() =>
                setCategory({ name: "", active: true, reason: "" })
              }
            >
              <Tag size={16} />
              New category
            </button>
          )
        }
      >
        <p className="text-sm text-slate-500 mb-4">
          Archiving hides a category from new entries while retaining its
          transactions and budget history.
        </p>
        <div className="flex flex-wrap gap-3">
          {config.categories.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${c.active ? "bg-white" : "bg-slate-50 text-slate-400"}`}
            >
              <span className="text-sm">
                {c.name}
                {!c.active ? " · Archived" : ""}
              </span>
              {isAdmin && (
                <button
                  aria-label={`Edit category ${c.name}`}
                  onClick={() =>
                    setCategory({ ...c, active: !!c.active, reason: "" })
                  }
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
      {budget && (
        <Modal
          title="Set category budget"
          onClose={() => {
            if (!busy) setBudget(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.saveBudget({
                  ...budget,
                  periodId: Number(periodId),
                  categoryId: Number(budget.categoryId),
                });
                setBudget(null);
              }, "Budget saved");
            }}
          >
            <Notice message={error} error />
            <Field label="Category">
              <select
                required
                className="finance-input"
                value={budget.categoryId}
                onChange={(e) =>
                  setBudget({ ...budget, categoryId: e.target.value })
                }
              >
                <option value="">Choose category</option>
                {config.categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Allocation (BDT)">
              <input
                required
                className="finance-input"
                type="number"
                min="0"
                step="0.01"
                value={budget.amount}
                onChange={(e) =>
                  setBudget({ ...budget, amount: e.target.value })
                }
              />
            </Field>
            <Field label="Alert when spending reaches (%)">
              <input
                required
                className="finance-input"
                type="number"
                min="1"
                max="100"
                value={budget.alertPercent}
                onChange={(e) =>
                  setBudget({ ...budget, alertPercent: e.target.value })
                }
              />
            </Field>
            <Field label="Reason for allocation or adjustment">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={budget.reason}
                onChange={(e) =>
                  setBudget({ ...budget, reason: e.target.value })
                }
              />
            </Field>
            <button disabled={busy} className="finance-button">
              {busy ? "Saving..." : "Save budget"}
            </button>
          </form>
        </Modal>
      )}
      {category && (
        <Modal
          title={category.id ? "Edit category" : "New category"}
          onClose={() => {
            if (!busy) setCategory(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                if (category.id)
                  await api.updateCategory(category.id, category);
                else await api.addCategory(category);
                setCategory(null);
              }, "Category saved");
            }}
          >
            <Notice message={error} error />
            <Field label="Category name">
              <input
                required
                maxLength={80}
                className="finance-input"
                value={category.name}
                onChange={(e) =>
                  setCategory({ ...category, name: e.target.value })
                }
              />
            </Field>
            {category.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={category.active}
                  onChange={(e) =>
                    setCategory({ ...category, active: e.target.checked })
                  }
                />
                Available for new entries
              </label>
            )}
            <Field label="Reason or note">
              <textarea
                maxLength={1000}
                className="finance-input"
                value={category.reason}
                onChange={(e) =>
                  setCategory({ ...category, reason: e.target.value })
                }
              />
            </Field>
            <button disabled={busy} className="finance-button">
              {busy ? "Saving..." : "Save category"}
            </button>
          </form>
        </Modal>
      )}
    </article>
  );
}
