import { useMemo, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";

function monthsBetween(d1, d2) {
  return (
    (d2.getFullYear() - d1.getFullYear()) * 12 +
    (d2.getMonth() - d1.getMonth())
  );
}

export default function LedgerTable({
  title,
  rows,
  loading,
  onAdd,
  onEdit,
  mode,
}) {
  const { user } = useAuth();
  const [filter, setFilter] = useState({ type: "all" });
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [lastN, setLastN] = useState(3);

  const filtered = useMemo(() => {
    const now = new Date();
    const arr = (rows || [])
      .filter((r) => {
        const d = new Date(r.date);
        if (filter.type === "year") return d.getFullYear() === Number(year);
        if (filter.type === "month")
          return (
            d.getFullYear() === Number(year) &&
            d.getMonth() + 1 === Number(month)
          );
        if (filter.type === "lastN")
          return (
            monthsBetween(d, now) >= 0 &&
            monthsBetween(d, now) < Number(lastN)
          );
        return true;
      })
      .sort((a, b) =>
        a.date < b.date
          ? -1
          : a.date > b.date
          ? 1
          : String(a.no).localeCompare(String(b.no))
      );

    return arr.map((r, i) => {
      const dep = Number(r.deposit ?? 0),
        cost = Number(r.cost ?? 0);
      const prev = i === 0 ? 0 : Number(arr[i - 1]._computedNetBalance || 0);
      return { ...r, _computedNetBalance: prev + dep - cost };
    });
  }, [rows, filter, year, month, lastN]);

  const hasCost = mode !== "association";
  const hasActions = user?.role === "super_admin";
  const colSpan = 8 + (hasCost ? 1 : 0) + (hasActions ? 1 : 0); // No, Date, Voucher, Deposit, [Cost], Desc, Sig, Added By, NetBalance, [Actions]

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <FilterControls
          {...{
            filter,
            setFilter,
            year,
            setYear,
            month,
            setMonth,
            lastN,
            setLastN,
          }}
        />
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-left">
              <Th>No</Th>
              <Th>Date</Th>
              <Th>Voucher No</Th>
              <Th>Deposit</Th>
              {hasCost && <Th>Cost</Th>}
              <Th>Description</Th>
              <Th>Signature</Th>
              <Th>Added By</Th>
              <Th>Net Balance</Th>
              {hasActions && <Th className="no-print">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  className="p-4 text-center text-slate-500"
                  colSpan={colSpan}
                >
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  className="p-4 text-center text-slate-500"
                  colSpan={colSpan}
                >
                  No data
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={`${r._src || mode}-${r.id}`}
                  className="border-b"
                >
                  <Td>{r.combinedNo || r.no}</Td>
                  <Td>{r.date}</Td>
                  <Td>{r.voucher_no || r.voucherNo}</Td>
                  <Td>{r.deposit ?? ""}</Td>
                  {hasCost && <Td>{r.cost ?? ""}</Td>}
                  <Td>{r.description}</Td>
                  <Td>{r.signature}</Td>
                  <Td>
                    {r.addedByRole === "super_admin"
                      ? "Chairman"
                      : r.addedByName || "Unknown"}
                  </Td>
                  <Td>{r._computedNetBalance}</Td>
                  {hasActions && (
                    <Td className="no-print">
                      <button
                        className="px-2 py-1 text-xs rounded bg-amber-500 text-white"
                        onClick={() => onEdit?.(r)}
                      >
                        Edit
                      </button>
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(user?.role === "official" || user?.role === "super_admin") && onAdd && (
        <AddRowForm mode={mode} onAdd={onAdd} />
      )}
    </div>
  );
}

function Th({ children, className = "" }) {
  return (
    <th className={`px-2 py-2 border-r ${className}`.trim()}>{children}</th>
  );
}
function Td({ children, className = "" }) {
  return (
    <td className={`px-2 py-2 border-r ${className}`.trim()}>{children}</td>
  );
}

function FilterControls({
  filter,
  setFilter,
  year,
  setYear,
  month,
  setMonth,
  lastN,
  setLastN,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        className="px-2 py-1 border rounded"
        value={filter.type}
        onChange={(e) => setFilter({ type: e.target.value })}
      >
        <option value="all">All</option>
        <option value="year">Year</option>
        <option value="month">Month</option>
        <option value="lastN">Last N Months</option>
      </select>
      {(filter.type === "year" || filter.type === "month") && (
        <input
          type="number"
          className="px-2 py-1 border rounded w-24"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="YYYY"
        />
      )}
      {filter.type === "month" && (
        <input
          type="number"
          className="px-2 py-1 border rounded w-20"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="MM"
        />
      )}
      {filter.type === "lastN" && (
        <input
          type="number"
          className="px-2 py-1 border rounded w-24"
          value={lastN}
          onChange={(e) => setLastN(e.target.value)}
          placeholder="3/6/9"
        />
      )}
    </div>
  );
}

function AddRowForm({ mode, onAdd }) {
  const [form, setForm] = useState({
    date: "",
    voucherNo: "",
    deposit: "",
    cost: "",
    description: "",
    signature: "",
  });

  const canSave =
    form.date &&
    form.voucherNo &&
    (form.deposit !== "" || (mode !== "association" && form.cost !== ""));

  return (
    <form
      className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onAdd({
          date: form.date,
          voucherNo: form.voucherNo,
          deposit:
            form.deposit === "" ? null : Number(form.deposit),
          cost:
            mode === "association"
              ? null
              : form.cost === ""
              ? null
              : Number(form.cost),
          description: form.description,
          signature: form.signature,
        });
        setForm({
          date: "",
          voucherNo: "",
          deposit: "",
          cost: "",
          description: "",
          signature: "",
        });
      }}
    >
      <input
        type="date"
        className="px-2 py-1 border rounded"
        value={form.date}
        onChange={(e) =>
          setForm({ ...form, date: e.target.value })
        }
      />
      <input
        className="px-2 py-1 border rounded"
        placeholder="Voucher No"
        value={form.voucherNo}
        onChange={(e) =>
          setForm({ ...form, voucherNo: e.target.value })
        }
      />
      <input
        type="number"
        className="px-2 py-1 border rounded"
        placeholder="Deposit"
        value={form.deposit}
        onChange={(e) =>
          setForm({ ...form, deposit: e.target.value })
        }
      />
      {mode !== "association" && (
        <input
          type="number"
          className="px-2 py-1 border rounded"
          placeholder="Cost"
          value={form.cost}
          onChange={(e) =>
            setForm({ ...form, cost: e.target.value })
          }
        />
      )}
      <input
        className="px-2 py-1 border rounded col-span-2"
        placeholder="Description"
        value={form.description}
        onChange={(e) =>
          setForm({ ...form, description: e.target.value })
        }
      />
      <input
        className="px-2 py-1 border rounded"
        placeholder="Signature"
        value={form.signature}
        onChange={(e) =>
          setForm({ ...form, signature: e.target.value })
        }
      />
      <button
        disabled={!canSave}
        className={`px-3 py-2 rounded text-white ${
          canSave ? "bg-slate-900" : "bg-slate-400"
        }`}
      >
        Add Row
      </button>
    </form>
  );
}
