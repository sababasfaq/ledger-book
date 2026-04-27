import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminUsers() {
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);

  const load = async ()=>{
    setPending(await api.listPendingUsers());
    setApproved(await api.listApprovedUsers());
  };
  useEffect(()=>{ load(); }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">User Approvals</h1>
      <h2 className="font-medium mb-2">Pending</h2>
      <div className="space-y-2 mb-6">
        {pending.length===0 && <p className="text-sm text-slate-600">No pending users.</p>}
        {pending.map(u=>(
          <div key={u.id} className="bg-white border rounded p-3 flex justify-between">
            <div><div className="font-medium">{u.name}</div><div className="text-sm text-slate-600">{u.email}</div></div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-slate-900 text-white rounded" onClick={async()=>{ await api.approveUser(u.id); await load(); }}>Approve</button>
              <button className="px-3 py-1 bg-slate-100 rounded" onClick={async()=>{ await api.deleteUser(u.id); await load(); }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-medium mb-2">Approved</h2>
      <div className="space-y-2">
        {approved.map(u=>(
          <div key={u.id} className="bg-white border rounded p-3 flex justify-between">
            <div><div className="font-medium">{u.name}</div><div className="text-sm text-slate-600">{u.email}</div></div>
            <div><span className="text-xs px-2 py-1 rounded bg-slate-100">{u.role}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
