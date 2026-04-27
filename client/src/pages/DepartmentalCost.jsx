import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";

export default function DepartmentalCost() {
  useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [include, setInclude] = useState({
    general: true,
    unofficial: true,
    association: true,
    departmental: true,
  });

  const [range, setRange] = useState("all");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [filterDate, setFilterDate] = useState("");

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

  const filtered = useMemo(
    () => filterRows(rows, range, year, month, filterDate),
    [rows, range, year, month, filterDate]
  );

  const withBalance = useMemo(() => {
    let bal = 0;
    return filtered.map((r) => {
      const dep = num(r.deposit);
      const cost = num(r.cost);
      bal += dep - cost;
      return { ...r, netBalance: bal };
    });
  }, [filtered]);

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

  const handlePrint = () => {
    if (!tableRef.current) return;

    const printContents = tableRef.current.outerHTML;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title></title>
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
      state: {
        selectedRows,
      },
    });
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Departmental Cost (Combined)</h1>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={include.general}
            onChange={(e) =>
              setInclude((s) => ({ ...s, general: e.target.checked }))
            }
          />
          General
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={include.unofficial}
            onChange={(e) =>
              setInclude((s) => ({ ...s, unofficial: e.target.checked }))
            }
          />
          Unofficial
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={include.association}
            onChange={(e) =>
              setInclude((s) => ({ ...s, association: e.target.checked }))
            }
          />
          Student Association
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={include.departmental}
            onChange={(e) =>
              setInclude((s) => ({ ...s, departmental: e.target.checked }))
            }
          />
          Department Ledger
        </label>
      </div>

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
        onTaxReturn={goToTaxReturn}
        selectedCount={selectedRows.length}
      />

      <div className="overflow-x-auto bg-white border rounded">
        <table ref={tableRef} className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <Th className="no-print">
                <input
                  type="checkbox"
                  checked={pageRows.length > 0 && pageRows.every((r) => isSelected(r))}
                  onChange={toggleSelectAllCurrentPage}
                />
              </Th>
              <Th>No</Th>
              <Th>Date</Th>
              <Th>Voucher No</Th>
              <Th>Deposit</Th>
              <Th>Cost</Th>
              <Th>Tax</Th>
              <Th>Description</Th>
              <Th>Signature</Th>
              <Th>NetBalance</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={`${r._src}-${r.id}`} className="border-t">
                <Td className="no-print">
                  <input
                    type="checkbox"
                    checked={isSelected(r)}
                    onChange={() => toggleRow(r)}
                  />
                </Td>
                <Td>{r.combinedNo}</Td>
                <Td>{r.date}</Td>
                <Td>{r.voucherNo ?? r.voucher_no ?? ""}</Td>
                <Td>{fmt(r.deposit)}</Td>
                <Td>{fmt(r.cost)}</Td>
                <Td>{r.taxTypeName ?? ""}</Td>
                <Td>{r.description ?? ""}</Td>
                <Td>{r.signature ?? ""}</Td>
                <Td
                  className={
                    num(r.netBalance) >= 0 ? "text-green-700" : "text-red-700"
                  }
                >
                  {fmt(r.netBalance)}
                </Td>
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
  onTaxReturn,
  selectedCount,
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

      <div className="flex gap-2 items-center">
        <span className="text-sm text-slate-600">
          Selected: {selectedCount}
        </span>
        <button
          className="px-3 py-1 rounded bg-emerald-600 text-white"
          onClick={onTaxReturn}
        >
          Tax Return
        </button>
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

function num(v) {
  return v == null ? 0 : Number(v);
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