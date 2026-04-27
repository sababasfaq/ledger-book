import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";

const emptyForm = {
  date: "",
  voucherNo: "",
  deposit: "",
  cost: "",
  taxTypeId: "",
  description: "",
  signature: "",
};

export default function GeneralLedger() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const canAdd = isAdmin || user?.role === "official";

  const [rows, setRows] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [range, setRange] = useState("all");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [msg, setMsg] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [showAddModal, setShowAddModal] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tableRef = useRef(null);

  const load = async () => {
    const [data, taxList] = await Promise.all([
      api.getLedger("general"),
      api.getTaxes(),
    ]);
    setRows(data || []);
    setTaxes(taxList || []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => filterRows(rows, range, year, month, filterDate),
    [rows, range, year, month, filterDate]
  );
  const withBalance = useMemo(() => calcBalance(filtered), [filtered]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(withBalance.length / pageSize));
    if (page > totalPages) setPage(1);
  }, [withBalance.length, pageSize, page]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return withBalance.slice(start, start + pageSize);
  }, [withBalance, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(withBalance.length / pageSize));
  const startIndex = withBalance.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex =
    withBalance.length === 0
      ? 0
      : Math.min(page * pageSize, withBalance.length);

  const handleAddRow = async () => {
    try {
      setMsg("");
      if (!form.date || !form.voucherNo) {
        alert("Date and Voucher No are required");
        return;
      }
      if (!form.deposit && !form.cost) {
        alert("Either Deposit or Cost is required");
        return;
      }

      await api.addRow("general", {
        date: form.date,
        voucherNo: form.voucherNo,
        deposit: toNumber(form.deposit),
        cost: toNumber(form.cost),
        taxTypeId: form.taxTypeId === "" ? null : Number(form.taxTypeId),
        description: form.description,
        signature: form.signature,
      });

      setForm(emptyForm);
      setShowAddModal(false);
      await load();
    } catch (e) {
      const m = e.message || "Failed to add row";
      setMsg(m);
      alert(m);
    }
  };

  const onEdit = (r) => {
    setEditingId(r.id);
    setEditForm({
      date: r.date ?? "",
      voucherNo: r.voucher_no ?? r.voucherNo ?? "",
      deposit: r.deposit ?? "",
      cost: r.cost ?? "",
      taxTypeId: r.taxTypeId ?? "",
      description: r.description ?? "",
      signature: r.signature ?? "",
    });
  };

  const onSave = async () => {
    try {
      if (!editForm.date || !editForm.voucherNo) {
        alert("Date and Voucher No are required");
        return;
      }
      const patch = {
        date: editForm.date,
        voucherNo: editForm.voucherNo,
        deposit:
          editForm.deposit === "" || editForm.deposit == null
            ? null
            : Number(editForm.deposit),
        cost:
          editForm.cost === "" || editForm.cost == null
            ? null
            : Number(editForm.cost),
        taxTypeId:
          editForm.taxTypeId === "" || editForm.taxTypeId == null
            ? null
            : Number(editForm.taxTypeId),
        description: editForm.description,
        signature: editForm.signature,
      };
      await api.updateRow("general", editingId, patch);
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e.message || "Failed to update");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this row?")) return;
    try {
      await api.deleteRow("general", id);
      await load();
    } catch (e) {
      alert(e.message || "Failed to delete row");
    }
  };

  const handlePrint = () => {
    if (!tableRef.current) return;

    const printContents = tableRef.current.outerHTML;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title> </title>
          <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 4px; font-size: 12px; text-align: left; }
            thead { background: #f1f5f9; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">General Ledger</h1>

      <Filters
        range={range}
        setRange={setRange}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        onPrint={handlePrint}
        onAdd={
          canAdd
            ? () => {
                setForm(emptyForm);
                setMsg("");
                setShowAddModal(true);
              }
            : undefined
        }
      />

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Add General Ledger Entry</h2>
              <button
                className="text-slate-500 hover:text-slate-800 text-xl leading-none"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Date</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Voucher No</label>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Voucher No"
                  value={form.voucherNo}
                  onChange={(e) =>
                    setForm({ ...form, voucherNo: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Deposit</label>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Deposit"
                  value={form.deposit}
                  onChange={(e) =>
                    setForm({ ...form, deposit: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Cost</label>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Cost"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Tax</label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={form.taxTypeId}
                  onChange={(e) =>
                    setForm({ ...form, taxTypeId: e.target.value })
                  }
                >
                  <option value="">No Tax</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.percentage}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm mb-1">Description</label>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Signature</label>
                <input
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Signature"
                  value={form.signature}
                  onChange={(e) =>
                    setForm({ ...form, signature: e.target.value })
                  }
                />
              </div>
            </div>

            {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded border border-slate-300"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-slate-900 text-white"
                onClick={handleAddRow}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white border rounded">
        <table ref={tableRef} className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <Th>No</Th>
              <Th>Date</Th>
              <Th>Voucher No</Th>
              <Th>Deposit</Th>
              <Th>Cost</Th>
              <Th>Tax</Th>
              <Th>Description</Th>
              <Th>Signature</Th>
              <Th>NetBalance</Th>
              {isAdmin && <Th className="no-print">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id || `${r.no}-${r.date}`} className="border-t">
                {editingId === r.id ? (
                  <>
                    <Td>{r.no}</Td>
                    <Td>
                      <input
                        type="date"
                        className="border rounded px-2 py-1 w-36"
                        value={editForm.date}
                        onChange={(e) =>
                          setEditForm({ ...editForm, date: e.target.value })
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className="border rounded px-2 py-1 w-40"
                        value={editForm.voucherNo}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            voucherNo: e.target.value,
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className="border rounded px-2 py-1 w-28"
                        value={editForm.deposit}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            deposit: e.target.value,
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className="border rounded px-2 py-1 w-28"
                        value={editForm.cost}
                        onChange={(e) =>
                          setEditForm({ ...editForm, cost: e.target.value })
                        }
                      />
                    </Td>
                    <Td>
                      <select
                        className="border rounded px-2 py-1 w-40"
                        value={editForm.taxTypeId}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            taxTypeId: e.target.value,
                          })
                        }
                      >
                        <option value="">No Tax</option>
                        {taxes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.percentage}%)
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <input
                        className="border rounded px-2 py-1 w-56"
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <input
                        className="border rounded px-2 py-1 w-36"
                        value={editForm.signature}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            signature: e.target.value,
                          })
                        }
                      />
                    </Td>
                    <Td
                      className={
                        Number(r.netBalance) >= 0
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {fmt(r.netBalance)}
                    </Td>
                    {isAdmin && (
                      <Td className="no-print">
                        <button
                          className="px-2 py-1 text-white bg-emerald-600 rounded mr-2"
                          onClick={onSave}
                        >
                          Save
                        </button>
                        <button
                          className="px-2 py-1 bg-slate-100 rounded mr-2"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                        >
                          Delete
                        </button>
                      </Td>
                    )}
                  </>
                ) : (
                  <>
                    <Td>{r.no}</Td>
                    <Td>{r.date}</Td>
                    <Td>{r.voucher_no ?? r.voucherNo ?? ""}</Td>
                    <Td>{fmt(r.deposit)}</Td>
                    <Td>{fmt(r.cost)}</Td>
                    <Td>{r.taxTypeName ?? ""}</Td>
                    <Td>{r.description ?? ""}</Td>
                    <Td>{r.signature ?? ""}</Td>
                    <Td
                      className={
                        Number(r.netBalance) >= 0
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {fmt(r.netBalance)}
                    </Td>
                    {isAdmin && (
                      <Td className="no-print">
                        <button
                          className="px-2 py-1 bg-slate-900 text-white rounded mr-2"
                          onClick={() => onEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                        >
                          Delete
                        </button>
                      </Td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            Showing {startIndex}-{endIndex} of {withBalance.length}
          </div>
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              className="border rounded px-1 py-0.5"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Filters({
  range,
  setRange,
  year,
  setYear,
  month,
  setMonth,
  filterDate,
  setFilterDate,
  onPrint,
  onAdd,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div className="flex flex-wrap gap-2">
        <select
          className="border rounded px-2 py-1"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="all">All</option>
          <option value="y">Year</option>
          <option value="m">Month</option>
          <option value="d">Date</option>
          <option value="3m">Last 3 months</option>
          <option value="6m">Last 6 months</option>
          <option value="9m">Last 9 months</option>
        </select>
        {range === "y" && (
          <input
            className="border rounded px-2 py-1"
            placeholder="YYYY"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        )}
        {range === "m" && (
          <>
            <input
              className="border rounded px-2 py-1"
              placeholder="YYYY"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <input
              className="border rounded px-2 py-1"
              placeholder="MM"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </>
        )}
        {range === "d" && (
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        )}
      </div>

      <div className="flex gap-2">
        {onAdd && (
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white"
            onClick={onAdd}
          >
            Add Row
          </button>
        )}
        <button
          className="px-3 py-1 rounded bg-slate-900 text-white"
          onClick={onPrint}
        >
          Print
        </button>
      </div>
    </div>
  );
}

const Th = ({ children, className = "" }) => (
  <th className={`text-left px-3 py-2 ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-3 py-2 ${className}`}>{children}</td>
);

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v) {
  return v == null || v === "" ? "" : Number(v).toLocaleString();
}

function filterRows(rows, range, year, month, filterDate) {
  if (range === "all") return rows;
  const now = new Date();
  if (["3m", "6m", "9m"].includes(range)) {
    const months = Number(range.replace("m", ""));
    const cutoff = new Date(now);
    cutoff.setMonth(now.getMonth() - months);
    return rows.filter((r) => new Date(r.date) >= cutoff);
  }
  if (range === "y") {
    return rows.filter(
      (r) => String(r.date).slice(0, 4) === String(year || "")
    );
  }
  if (range === "m") {
    const ym = `${year || ""}-${String(month || "").padStart(2, "0")}`;
    return rows.filter((r) => String(r.date).slice(0, 7) === ym);
  }
  if (range === "d") {
    if (!filterDate) return rows;
    return rows.filter((r) => String(r.date) === String(filterDate));
  }
  return rows;
}

function calcBalance(rows) {
  let bal = 0;
  return rows.map((r) => {
    const dep = Number(r.deposit || 0);
    const cost = Number(r.cost || 0);
    bal += dep - cost;
    return { ...r, netBalance: bal };
  });
}