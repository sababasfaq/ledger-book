import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";
import { Search, Calendar, X, Download, Paperclip, FileText, Eye } from "lucide-react";
import { exportToPDF, exportToExcel, fileToBase64 } from "../lib/exportUtils";

const emptyForm = {
  date: "",
  voucherNo: "",
  deposit: "",
  cost: "",
  taxTypeId: "",
  description: "",
  signature: "",
  voucherFileName: "",
  voucherFileData: "",
};

export default function DepartmentLedger() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const canAdd = isAdmin || user?.role === "official";

  const [rows, setRows] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewVoucher, setViewVoucher] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tableRef = useRef(null);

  const load = async () => {
    const [data, taxList] = await Promise.all([
      api.getLedger("departmental"),
      api.getTaxes(),
    ]);
    setRows(data || []);
    setTaxes(taxList || []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let res = [...rows];
    
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(r => 
        (r.description || "").toLowerCase().includes(s) ||
        (r.voucher_no || r.voucherNo || "").toLowerCase().includes(s) ||
        (r.signature || "").toLowerCase().includes(s)
      );
    }

    if (fromDate) {
      res = res.filter(r => r.date >= fromDate);
    }
    if (toDate) {
      res = res.filter(r => r.date <= toDate);
    }

    return res;
  }, [rows, searchTerm, fromDate, toDate]);

  const withBalance = useMemo(() => calcBalance(filtered), [filtered]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return withBalance.slice(start, start + pageSize);
  }, [withBalance, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(withBalance.length / pageSize));
  const startIndex = withBalance.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = withBalance.length === 0 ? 0 : Math.min(page * pageSize, withBalance.length);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("File size limit: 2MB");
      e.target.value = "";
      return;
    }
    const base64 = await fileToBase64(file);
    setForm({ ...form, voucherFileName: file.name, voucherFileData: base64 });
  };

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

      await api.addRow("departmental", {
        ...form,
        deposit: toNumber(form.deposit),
        cost: toNumber(form.cost),
        taxTypeId: form.taxTypeId === "" ? null : Number(form.taxTypeId),
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
      voucherFileName: r.voucherFileName || "",
      voucherFileData: r.voucherFileData || "",
    });
  };

  const onSave = async () => {
    try {
      if (!editForm.date || !editForm.voucherNo) {
        alert("Date and Voucher No are required");
        return;
      }
      const patch = {
        ...editForm,
        deposit: editForm.deposit === "" ? null : Number(editForm.deposit),
        cost: editForm.cost === "" ? null : Number(editForm.cost),
        taxTypeId: editForm.taxTypeId === "" ? null : Number(editForm.taxTypeId),
      };
      await api.updateRow("departmental", editingId, patch);
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e.message || "Failed to update");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this row?")) return;
    try {
      await api.deleteRow("departmental", id);
      await load();
    } catch (e) {
      alert(e.message || "Failed to delete row");
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Departmental Ledger</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => exportToPDF("Departmental Ledger", withBalance)}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 transition"
          >
            <Download size={14} /> PDF
          </button>
          <button 
            onClick={() => exportToExcel("Departmental Ledger", withBalance)}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 transition"
          >
            <Download size={14} /> Excel
          </button>
          {canAdd && (
            <button
              className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
              onClick={() => {
                setForm(emptyForm);
                setMsg("");
                setShowAddModal(true);
              }}
            >
              Add Row
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-50 p-3 rounded-lg border mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Description, voucher, signature..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded bg-white outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <input 
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 text-sm border rounded bg-white outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <input 
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 text-sm border rounded bg-white outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <button 
            onClick={clearFilters}
            className="px-3 py-2 text-sm border border-slate-300 rounded bg-white hover:bg-slate-50 transition"
          >
            Clear Filters
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {filtered.length} results found
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Departmental Ledger Entry</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input type="date" className="border rounded px-3 py-2 w-full" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Voucher No</label>
                <input className="border rounded px-3 py-2 w-full" placeholder="Voucher No" value={form.voucherNo} onChange={(e) => setForm({ ...form, voucherNo: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Deposit</label>
                <input className="border rounded px-3 py-2 w-full" placeholder="0.00" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cost</label>
                <input className="border rounded px-3 py-2 w-full" placeholder="0.00" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tax</label>
                <select className="border rounded px-3 py-2 w-full" value={form.taxTypeId} onChange={(e) => setForm({ ...form, taxTypeId: e.target.value })}>
                  <option value="">No Tax</option>
                  {taxes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Attach Voucher (Optional)</label>
                <input type="file" className="text-sm w-full border rounded px-2 py-1.5" onChange={handleFileChange} accept="image/*,.pdf" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Description</label>
                <input className="border rounded px-3 py-2 w-full" placeholder="Entry description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Signature</label>
                <input className="border rounded px-3 py-2 w-full" placeholder="Signature" value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} />
              </div>
            </div>

            {msg && <p className="px-4 text-sm text-red-600">{msg}</p>}

            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
              <button className="px-4 py-2 rounded border bg-white" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="px-4 py-2 rounded bg-slate-900 text-white" onClick={handleAddRow}>Save Entry</button>
            </div>
          </div>
        </div>
      )}

      {viewVoucher && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">{viewVoucher.name}</h3>
              <button onClick={() => setViewVoucher(null)}><X size={24} /></button>
            </div>
            <div className="p-4 flex justify-center bg-slate-100 min-h-[300px] items-center">
              {viewVoucher.data.startsWith("data:application/pdf") ? (
                <div className="text-center">
                  <FileText size={64} className="mx-auto text-slate-400 mb-4" />
                  <p className="mb-4 text-slate-600">This is a PDF document.</p>
                  <a href={viewVoucher.data} download={viewVoucher.name} className="px-6 py-2 bg-slate-900 text-white rounded">Download PDF</a>
                </div>
              ) : (
                <img src={viewVoucher.data} alt="Voucher" className="max-h-[70vh] object-contain shadow-md" />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white border rounded shadow-sm">
        <table ref={tableRef} className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <Th>No</Th>
              <Th>Date</Th>
              <Th>Voucher No</Th>
              <Th>Deposit</Th>
              <Th>Cost</Th>
              <Th>Tax</Th>
              <Th>Description</Th>
              <Th>Signature</Th>
              <Th>Balance</Th>
              <Th className="no-print">Files</Th>
              {isAdmin && <Th className="no-print">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={r.id || i} className="border-t hover:bg-slate-50 transition">
                {editingId === r.id ? (
                  <>
                    <Td>{r.no}</Td>
                    <Td><input type="date" className="border rounded px-2 py-1 w-32" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} /></Td>
                    <Td><input className="border rounded px-2 py-1 w-32" value={editForm.voucherNo} onChange={e => setEditForm({...editForm, voucherNo: e.target.value})} /></Td>
                    <Td><input className="border rounded px-2 py-1 w-24" value={editForm.deposit} onChange={e => setEditForm({...editForm, deposit: e.target.value})} /></Td>
                    <Td><input className="border rounded px-2 py-1 w-24" value={editForm.cost} onChange={e => setEditForm({...editForm, cost: e.target.value})} /></Td>
                    <Td>
                      <select className="border rounded px-2 py-1 w-32" value={editForm.taxTypeId} onChange={e => setEditForm({...editForm, taxTypeId: e.target.value})}>
                        <option value="">No Tax</option>
                        {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Td>
                    <Td><input className="border rounded px-2 py-1 w-48" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} /></Td>
                    <Td><input className="border rounded px-2 py-1 w-32" value={editForm.signature} onChange={e => setEditForm({...editForm, signature: e.target.value})} /></Td>
                    <Td className={r.netBalance >= 0 ? "text-green-700 font-medium" : "text-red-700 font-medium"}>{fmt(r.netBalance)}</Td>
                    <Td className="no-print">-</Td>
                    {isAdmin && (
                      <Td className="no-print">
                        <div className="flex gap-1">
                          <button className="px-2 py-1 text-white bg-emerald-600 rounded" onClick={onSave}>Save</button>
                          <button className="px-2 py-1 bg-slate-200 rounded" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </Td>
                    )}
                  </>
                ) : (
                  <>
                    <Td>{r.no}</Td>
                    <Td className="whitespace-nowrap">{r.date}</Td>
                    <Td>{r.voucher_no ?? r.voucherNo ?? ""}</Td>
                    <Td className="text-green-600 font-medium">{fmt(r.deposit)}</Td>
                    <Td className="text-red-600 font-medium">{fmt(r.cost)}</Td>
                    <Td>{r.taxTypeName ?? ""}</Td>
                    <Td>{r.description ?? ""}</Td>
                    <Td>{r.signature ?? ""}</Td>
                    <Td className={r.netBalance >= 0 ? "text-green-700 font-bold" : "text-red-700 font-bold"}>{fmt(r.netBalance)}</Td>
                    <Td className="no-print text-center">
                      {r.voucherFileData && (
                        <button 
                          onClick={() => setViewVoucher({ name: r.voucherFileName, data: r.voucherFileData })}
                          className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 rounded-full transition"
                          title="View Voucher"
                        >
                          <Paperclip size={16} />
                        </button>
                      )}
                    </Td>
                    {isAdmin && (
                      <Td className="no-print">
                        <div className="flex gap-1">
                          <button className="p-1.5 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition" onClick={() => onEdit(r)} title="Edit"><Eye size={16} /></button>
                          <button className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition" onClick={() => onDelete(r.id)} title="Delete"><X size={16} /></button>
                        </div>
                      </Td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={isAdmin ? 11 : 10} className="p-8 text-center text-slate-400">No entries found matching filters.</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t text-sm">
          <div className="text-slate-500">
            Showing {startIndex}-{endIndex} of {withBalance.length}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Rows:</span>
              <select className="border rounded px-1 py-1 bg-white outline-none" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button className="px-3 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
              <span className="px-3 py-1">Page {page} of {totalPages}</span>
              <button className="px-3 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-50" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children, className = "" }) => <th className={`text-left px-4 py-3 font-semibold text-slate-700 ${className}`}>{children}</th>;
const Td = ({ children, className = "" }) => <td className={`px-4 py-3 text-slate-600 ${className}`}>{children}</td>;

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function fmt(v) { return v == null || v === "" ? "" : Number(v).toLocaleString(); }
function calcBalance(rows) {
  let bal = 0;
  return rows.map((r) => {
    const dep = Number(r.deposit || 0);
    const cost = Number(r.cost || 0);
    bal += dep - cost;
    return { ...r, netBalance: bal };
  });
}