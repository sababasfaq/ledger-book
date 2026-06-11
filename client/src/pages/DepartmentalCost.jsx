import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { 
  Search, 
  Calendar, 
  X, 
  Printer, 
  FileText, 
  CheckSquare, 
  Square,
  ArrowUpDown
} from "lucide-react";

export default function DepartmentalCost() {
  const navigate = useNavigate();
  useAuth();

  const [rows, setRows] = useState([]);
  const [include, setInclude] = useState({
    general: true,
    unofficial: true,
    association: true,
    departmental: true,
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedRows, setSelectedRows] = useState([]);

  const tableRef = useRef(null);

  const load = async () => {
    const data = await api.getDepartmental(include);
    setRows(data || []);
  };

  useEffect(() => {
    load();
  }, [
    include.general,
    include.unofficial,
    include.association,
    include.departmental,
  ]);

  const filtered = useMemo(() => {
    let res = [...rows];
    
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(r => 
        (r.description || "").toLowerCase().includes(s) ||
        (r.voucherNo || r.voucher_no || "").toLowerCase().includes(s) ||
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

  // Calculate balance from OLDEST to NEWEST, then reverse for display
  const displayRows = useMemo(() => {
    // 1. Ensure sorted by date ASC for balance calculation
    const sortedAsc = [...filtered].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.id || 0) - (b.id || 0);
    });

    let bal = 0;
    const withBal = sortedAsc.map((r) => {
      const dep = num(r.deposit);
      const cost = num(r.cost);
      bal += dep - cost;
      return { ...r, netBalance: bal };
    });

    // 2. Reverse for "latest to old" display
    return withBal.reverse();
  }, [filtered]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const startIndex = displayRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = displayRows.length === 0 ? 0 : Math.min(page * pageSize, displayRows.length);

  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.outerHTML;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Departmental Cost Report</title>
          <style>
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
            thead { background: #f8fafc; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <h2 style="text-align: center;">Departmental Cost (Combined)</h2>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>
          ${printContents}
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  const rowKey = (r) => `${r._src}-${r.id}`;

  const toggleRow = (row) => {
    const key = rowKey(row);
    setSelectedRows((prev) =>
      prev.some((r) => rowKey(r) === key)
        ? prev.filter((r) => rowKey(r) !== key)
        : [...prev, row]
    );
  };

  const isSelected = (row) =>
    selectedRows.some((r) => rowKey(r) === rowKey(row));

  const toggleSelectAllCurrentPage = () => {
    const allSelected = pageRows.every((r) => isSelected(r));
    if (allSelected) {
      setSelectedRows((prev) =>
        prev.filter(
          (selected) => !pageRows.some((r) => rowKey(r) === rowKey(selected))
        )
      );
    } else {
      setSelectedRows((prev) => {
        const merged = [...prev];
        pageRows.forEach((r) => {
          if (!merged.some((m) => rowKey(m) === rowKey(r))) merged.push(r);
        });
        return merged;
      });
    }
  };

  const goToTaxReturn = () => {
    if (selectedRows.length === 0) {
      alert("Please select at least one row for Tax Return.");
      return;
    }
    navigate("/tax-return-challan", {
      state: { selectedRows },
    });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFromDate("");
    setToDate("");
  };

  return (
    <article aria-labelledby="dept-cost-title" className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 id="dept-cost-title" className="text-2xl font-bold">Departmental Cost (Combined)</h1>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm font-semibold"
            onClick={goToTaxReturn}
            aria-label={`Go to Tax Return for ${selectedRows.length} selected rows`}
          >
            <FileText size={18} aria-hidden="true" />
            Tax Return ({selectedRows.length})
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-sm font-semibold"
            onClick={handlePrint}
            aria-label="Print ledger"
          >
            <Printer size={18} aria-hidden="true" />
            Print
          </button>
        </div>
      </header>

      {/* Ledgers Selection */}
      <section aria-label="Ledger selection" className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-500 mb-2">
          <CheckSquare size={18} aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">Include Ledgers</span>
        </div>
        <div className="flex flex-wrap gap-6">
          <Checkbox label="General" checked={include.general} onChange={v => setInclude(s => ({...s, general: v}))} />
          <Checkbox label="Unofficial" checked={include.unofficial} onChange={v => setInclude(s => ({...s, unofficial: v}))} />
          <Checkbox label="Student Association" checked={include.association} onChange={v => setInclude(s => ({...s, association: v}))} />
          <Checkbox label="Department Ledger" checked={include.departmental} onChange={v => setInclude(s => ({...s, departmental: v}))} />
        </div>
      </section>

      {/* Filter Bar */}
      <section aria-label="Filters" className="bg-slate-50 p-4 rounded-xl border shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px] space-y-1.5">
            <label htmlFor="dept-cost-search" className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Search</label>
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input 
                id="dept-cost-search"
                type="text"
                placeholder="Description, voucher, signature..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-slate-100 outline-none transition"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dept-cost-from" className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">From Date</label>
            <input 
              id="dept-cost-from"
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-slate-100 outline-none transition"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dept-cost-to" className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">To Date</label>
            <input 
              id="dept-cost-to"
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-slate-100 outline-none transition"
            />
          </div>
          <button 
            onClick={clearFilters}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
            aria-label="Clear all filters"
          >
            <X size={18} aria-hidden="true" />
            Clear
          </button>
        </div>
        <div className="mt-3 px-1 text-xs text-slate-400 font-medium italic" aria-live="polite">
          {displayRows.length} results found • Sorted newest to oldest
        </div>
      </section>

      <section aria-label="Combined costs table" className="overflow-x-auto bg-white border rounded-xl shadow-sm overflow-hidden">
        <table ref={tableRef} className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th scope="col" className="no-print px-4 py-4">
                <input
                  type="checkbox"
                  aria-label="Select all rows on current page"
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={pageRows.length > 0 && pageRows.every((r) => isSelected(r))}
                  onChange={toggleSelectAllCurrentPage}
                />
              </th>
              <Th scope="col">No</Th>
              <Th scope="col">Date</Th>
              <Th scope="col">Voucher No</Th>
              <Th scope="col">Deposit</Th>
              <Th scope="col">Cost</Th>
              <Th scope="col">Tax</Th>
              <Th scope="col">Description</Th>
              <Th scope="col">Signature</Th>
              <Th scope="col">Balance</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageRows.map((r) => (
              <tr key={`${r._src}-${r.id}`} className="hover:bg-slate-50 transition duration-150">
                <td className="no-print px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label={`Select row ${r.combinedNo}`}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    checked={isSelected(r)}
                    onChange={() => toggleRow(r)}
                  />
                </td>
                <Td className="font-medium text-slate-400">{r.combinedNo}</Td>
                <Td className="whitespace-nowrap font-semibold">{r.date}</Td>
                <Td>{r.voucherNo ?? r.voucher_no ?? ""}</Td>
                <Td className="text-green-600 font-bold">{fmt(r.deposit)}</Td>
                <Td className="text-red-600 font-bold">{fmt(r.cost)}</Td>
                <Td><span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 rounded-full">{r.taxTypeName ?? ""}</span></Td>
                <Td className="max-w-xs truncate">{r.description ?? ""}</Td>
                <Td className="italic text-slate-500">{r.signature ?? ""}</Td>
                <td className={`px-4 py-4 border-slate-100 font-bold ${num(r.netBalance) >= 0 ? "text-slate-900" : "text-red-700"}`}>
                  {fmt(r.netBalance)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan="10" className="p-12 text-center text-slate-400">
                  <FileText size={48} className="mx-auto mb-4 opacity-10" aria-hidden="true" />
                  No entries found matching filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <nav aria-label="Table pagination" className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t text-sm font-medium">
          <div className="text-slate-500">
            Showing {startIndex}-{endIndex} of {displayRows.length}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label htmlFor="dept-cost-rows" className="text-slate-400 text-xs uppercase tracking-widest font-bold">Rows:</label>
              <select 
                id="dept-cost-rows"
                className="border rounded-lg px-2 py-1 bg-white outline-none focus:ring-4 focus:ring-slate-100" 
                value={pageSize} 
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button 
                className="px-4 py-1.5 border rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 transition" 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page <= 1}
                aria-label="Previous page"
              >
                Prev
              </button>
              <div className="px-4">Page {page} of {totalPages}</div>
              <button 
                className="px-4 py-1.5 border rounded-xl bg-white hover:bg-slate-100 disabled:opacity-30 transition" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page >= totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </nav>
      </section>
    </article>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div className={`transition ${checked ? 'text-slate-900' : 'text-slate-300 group-hover:text-slate-400'}`}>
        {checked ? <CheckSquare size={20} aria-hidden="true" /> : <Square size={20} aria-hidden="true" />}
      </div>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

const Th = ({ children, className = "", ...props }) => (
  <th className={`text-left px-4 py-4 font-bold text-slate-500 uppercase tracking-widest text-[10px] ${className}`} {...props}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-4 py-4 text-slate-600 border-slate-100 ${className}`}>{children}</td>
);

function num(v) { return v == null ? 0 : Number(v); }
function fmt(v) { return v == null || v === "" || isNaN(v) ? "" : Number(v).toLocaleString(); }