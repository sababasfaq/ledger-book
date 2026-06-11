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
    return <div className="p-4" role="alert">Only Chairman (Super Admin) can view the Log Book.</div>;
  }

  return (
    <article className="p-4 space-y-4" aria-labelledby="logbook-title">
      <header>
        <h1 id="logbook-title" className="text-xl font-bold">Log Book</h1>
      </header>

      {error && (
        <div className="mb-4 text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
          {error}
        </div>
      )}

      <section aria-label="Action logs" className="overflow-x-auto bg-white shadow rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">#</th>
              <th scope="col" className="px-3 py-2 text-left">Time</th>
              <th scope="col" className="px-3 py-2 text-left">User</th>
              <th scope="col" className="px-3 py-2 text-left">Role</th>
              <th scope="col" className="px-3 py-2 text-left">Table</th>
              <th scope="col" className="px-3 py-2 text-left">Action</th>
              <th scope="col" className="px-3 py-2 text-left">Row ID</th>
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
      </section>
    </article>
  );
}