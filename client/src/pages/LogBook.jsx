import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";

export default function LogBook() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getLogs();
        setLogs(data);
      } catch (e) {
        setError(e.message || "Failed to load logs");
      }
    };
    load();
  }, []);

  if (!user || user.role !== "super_admin") {
    return <div className="p-4">Only Chairman (Super Admin) can view the Log Book.</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Log Book</h1>
      {error && (
        <div className="mb-4 text-red-600 text-sm">
          {error}
        </div>
      )}
      <div className="overflow-x-auto bg-white shadow rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Time</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Table</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Row ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="px-3 py-2">{log.id}</td>
                <td className="px-3 py-2">{log.created_at}</td>
                <td className="px-3 py-2">{log.user_name}</td>
                <td className="px-3 py-2">
                  {log.role === "super_admin" ? "Chairman" : log.role}
                </td>
                <td className="px-3 py-2">{log.table_name}</td>
                <td className="px-3 py-2">{log.action}</td>
                <td className="px-3 py-2">{log.row_id}</td>
              </tr>
            ))}

            {logs.length === 0 && !error && (
              <tr>
                <td className="px-3 py-4 text-center text-gray-500" colSpan={7}>
                  No log entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
