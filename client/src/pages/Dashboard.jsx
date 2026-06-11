import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { NavLink } from "react-router-dom";
import { Users, FileText, TrendingUp, TrendingDown, DollarSign, Clock } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboardStats().then(data => {
      setStats(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-center">Loading Dashboard...</div>;
  if (!stats) return <div className="p-8 text-center text-red-600">Failed to load dashboard data.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          title="Total Deposits" 
          value={stats.kpis.totalDeposits.toLocaleString()} 
          icon={<TrendingUp className="text-green-600" />} 
          color="bg-green-50"
        />
        <KpiCard 
          title="Total Costs" 
          value={stats.kpis.totalCosts.toLocaleString()} 
          icon={<TrendingDown className="text-red-600" />} 
          color="bg-red-50"
        />
        <KpiCard 
          title="Net Balance" 
          value={stats.kpis.netBalance.toLocaleString()} 
          icon={<DollarSign className="text-blue-600" />} 
          color="bg-blue-50"
        />
        <KpiCard 
          title="Pending Instructions" 
          value={stats.kpis.pendingInstructionsCount} 
          icon={<FileText className="text-amber-600" />} 
          color="bg-amber-50"
        />
      </div>

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Income vs Expense Chart */}
        <div className="lg:col-span-2 bg-white p-4 rounded-lg border shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Monthly Income vs Expense ({new Date().getFullYear()})</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="income" fill="#10b981" name="Income" />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Tasks Sidebar */}
        <div className="space-y-6">
          {user.role === "super_admin" && (
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Pending Approvals</h2>
                <Users className="text-slate-400" size={20} />
              </div>
              <div className="text-3xl font-bold mb-4">{stats.pendingApprovals}</div>
              <NavLink 
                to="/admin/users" 
                className="block w-full text-center py-2 px-4 bg-slate-900 text-white rounded hover:bg-slate-800 transition"
              >
                Go to Approvals
              </NavLink>
            </div>
          )}

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pending Instructions</h2>
              <Clock className="text-slate-400" size={20} />
            </div>
            {stats.pendingInstructions.length > 0 ? (
              <ul className="space-y-3">
                {stats.pendingInstructions.map(inst => (
                  <li key={inst.id} className="text-sm border-b pb-2 last:border-0">
                    <div className="font-medium">{inst.title}</div>
                    <div className="text-slate-500 text-xs">{inst.created_at}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No pending instructions.</p>
            )}
            <NavLink 
              to="/instructions" 
              className="mt-4 block text-center py-2 px-4 border border-slate-300 rounded hover:bg-slate-50 transition text-sm"
            >
              View All
            </NavLink>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white p-4 rounded-lg border shadow-sm overflow-hidden">
        <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Ledger</th>
                <th className="text-left px-4 py-2">Description</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Added By</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentTransactions.map((tx, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 whitespace-nowrap">{tx.date}</td>
                  <td className="px-4 py-2">{tx.type}</td>
                  <td className="px-4 py-2">{tx.description}</td>
                  <td className={`px-4 py-2 text-right font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{tx.addedBy}</td>
                </tr>
              ))}
              {stats.recentTransactions.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">No transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, color }) {
  return (
    <div className={`p-4 rounded-lg border shadow-sm flex items-center gap-4 ${color}`}>
      <div className="p-3 bg-white rounded-full shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-600">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}