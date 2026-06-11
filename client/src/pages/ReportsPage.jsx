import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Download, ChevronDown, CheckSquare, Square } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function ReportsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedLedgers, setSelectedLedgers] = useState({
    general: true,
    unofficial: true,
    association: true,
    departmental: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const include = Object.entries(selectedLedgers)
        .filter(([_, val]) => val)
        .map(([key, _]) => key)
        .join(",");
      
      const res = await api.getDepartmental({
        general: selectedLedgers.general,
        unofficial: selectedLedgers.unofficial,
        association: selectedLedgers.association,
        departmental: selectedLedgers.departmental,
      });
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedLedgers]);

  const years = useMemo(() => {
    const y = new Set([new Date().getFullYear()]);
    data.forEach(r => {
      if (r.date) y.add(new Date(r.date).getFullYear());
    });
    return Array.from(y).sort((a, b) => b - a);
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(r => new Date(r.date).getFullYear() === Number(year));
  }, [data, year]);

  const monthlyStats = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(0, i).toLocaleString("default", { month: "short" }),
      monthNum: i + 1,
      deposit: 0,
      cost: 0,
      net: 0,
    }));

    filteredData.forEach(r => {
      const m = new Date(r.date).getMonth();
      months[m].deposit += r.deposit || 0;
      months[m].cost += r.cost || 0;
      months[m].net = months[m].deposit - months[m].cost;
    });

    let runningBalance = 0;
    return months.map(m => {
      runningBalance += m.net;
      return { ...m, runningBalance };
    });
  }, [filteredData]);

  const pieData = useMemo(() => {
    const breakdown = {
      General: 0,
      Unofficial: 0,
      Association: 0,
      Departmental: 0,
    };
    filteredData.forEach(r => {
      const type = r._src === "general" ? "General" : 
                   r._src === "unofficial" ? "Unofficial" : 
                   r._src === "association" ? "Association" : "Departmental";
      breakdown[type] += r.cost || 0;
    });
    return Object.entries(breakdown).map(([name, value]) => ({ name, value })).filter(v => v.value > 0);
  }, [filteredData]);

  const exportPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFontSize(18);
    doc.text(`Expense Report - ${year}`, 14, 22);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = monthlyStats.map(m => [
      m.month,
      m.deposit.toLocaleString(),
      m.cost.toLocaleString(),
      m.net.toLocaleString(),
      m.runningBalance.toLocaleString(),
    ]);

    doc.autoTable({
      startY: 40,
      head: [["Month", "Total Deposit", "Total Cost", "Net", "Running Balance"]],
      body: tableData,
    });

    doc.save(`Report_${year}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Annual / Monthly Reports</h1>
        <button 
          onClick={exportPDF}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 transition shadow-sm"
        >
          <Download size={18} />
          Export Report as PDF
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-wrap gap-6 items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
          <select 
            value={year} 
            onChange={e => setYear(e.target.value)}
            className="border rounded px-3 py-2 bg-white focus:ring-2 focus:ring-slate-200 outline-none min-w-[120px]"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Ledgers to include</label>
          <div className="flex flex-wrap gap-4">
            {Object.keys(selectedLedgers).map(key => (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <div 
                  onClick={() => setSelectedLedgers(prev => ({ ...prev, [key]: !prev[key] }))}
                  className="text-slate-900"
                >
                  {selectedLedgers[key] ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300" />}
                </div>
                <span className="text-sm capitalize">{key}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center text-slate-500">Loading report data...</div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Monthly Income vs Expense</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="deposit" fill="#10b981" name="Income" />
                    <Bar dataKey="cost" fill="#ef4444" name="Expense" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Cumulative Net Balance</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="runningBalance" stroke="#0ea5e9" name="Running Balance" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Expense Breakdown by Ledger</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg border shadow-sm overflow-hidden">
              <h2 className="text-lg font-semibold mb-4">Monthly Summary Table</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2">Month</th>
                      <th className="text-right px-4 py-2">Total Deposit</th>
                      <th className="text-right px-4 py-2">Total Cost</th>
                      <th className="text-right px-4 py-2">Net</th>
                      <th className="text-right px-4 py-2">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.map((m, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium">{m.month}</td>
                        <td className="px-4 py-2 text-right">{m.deposit.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{m.cost.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-right font-medium ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.net.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-bold">{m.runningBalance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}