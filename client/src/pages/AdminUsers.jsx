import { useEffect, useState } from "react";
import { api } from "../api";
import { CheckCircle2, Trash2, ShieldCheck, UserCheck } from "lucide-react";

export default function AdminUsers() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [p, a] = await Promise.all([
        api.listPendingUsers(),
        api.listApprovedUsers()
      ]);
      setPending(p || []);
      setApproved(a || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => { load(); }, []);

  const onApprove = async (id) => {
    if (!window.confirm("Approve this user?")) return;
    await api.approveUser(id);
    await load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    await api.deleteUser(id);
    await load();
  };

  if (loading && pending.length === 0 && approved.length === 0) {
    return <div className="p-8 text-center text-slate-500" role="status">Loading users...</div>;
  }

  return (
    <article aria-labelledby="admin-users-title" className="p-8 space-y-10">
      <header className="sr-only">
        <h1 id="admin-users-title">User Management</h1>
      </header>

      <section aria-labelledby="pending-approval-title">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="text-amber-500" size={20} aria-hidden="true" />
          <h2 id="pending-approval-title" className="text-lg font-bold text-slate-800">Pending Approval ({pending.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pending.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-2xl text-slate-400">
              No users waiting for approval.
            </div>
          )}
          {pending.map(u => (
            <div key={u.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between group hover:bg-white hover:shadow-md transition duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold" aria-hidden="true">
                  {u.name[0]}
                </div>
                <div>
                  <div className="font-bold text-slate-900">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => onApprove(u.id)}
                  className="p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition"
                  title="Approve"
                  aria-label={`Approve user ${u.name}`}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                </button>
                <button 
                  onClick={() => onDelete(u.id)}
                  className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition"
                  title="Delete"
                  aria-label={`Delete user ${u.name}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="approved-users-title">
        <div className="flex items-center gap-2 mb-6">
          <UserCheck className="text-emerald-500" size={20} aria-hidden="true" />
          <h2 id="approved-users-title" className="text-lg font-bold text-slate-800">Approved Users ({approved.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {approved.map(u => (
            <div key={u.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold" aria-hidden="true">
                {u.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 truncate">{u.name}</div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-tight ${
                    u.role === 'super_admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role === 'super_admin' ? 'Chairman' : 'Official'}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{u.email}</span>
                </div>
                {u.designation && (
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <span className="font-bold">Pos:</span> {u.designation} 
                    {u.department && <> • <span className="font-bold">Dept:</span> {u.department}</>}
                  </div>
                )}
                {u.phone && <div className="text-[10px] text-slate-500 flex items-center gap-1"><span className="font-bold">Tel:</span> {u.phone}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}