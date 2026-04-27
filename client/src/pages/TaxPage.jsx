import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";

const emptyForm = { name: "", percentage: "" };

export default function TaxPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      setRows(await api.getTaxes());
    } catch (e) {
      setMsg(e.message || "Failed to load tax types");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAdd = async () => {
    try {
      setMsg("");
      if (!form.name || form.percentage === "") {
        alert("Tax type and percentage are required");
        return;
      }

      await api.addTax({
        name: form.name,
        percentage: Number(form.percentage),
      });

      setForm(emptyForm);
      await load();
    } catch (e) {
      setMsg(e.message || "Failed to add tax");
    }
  };

  const onSave = async () => {
    try {
      if (!editForm.name || editForm.percentage === "") {
        alert("Tax type and percentage are required");
        return;
      }

      await api.updateTax(editingId, {
        name: editForm.name,
        percentage: Number(editForm.percentage),
      });

      setEditingId(null);
      setEditForm(emptyForm);
      await load();
    } catch (e) {
      setMsg(e.message || "Failed to update tax");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this tax type?")) return;
    try {
      await api.deleteTax(id);
      await load();
    } catch (e) {
      setMsg(e.message || "Failed to delete tax");
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tax</h1>

      {isAdmin && (
        <div className="bg-white border rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border rounded px-2 py-1"
            placeholder="Tax Type"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1"
            placeholder="Percentage"
            value={form.percentage}
            onChange={(e) => setForm({ ...form, percentage: e.target.value })}
          />
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white"
            onClick={onAdd}
          >
            Add Tax
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2">Tax Type</th>
              <th className="text-left px-3 py-2">Percentage</th>
              {isAdmin && <th className="text-left px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                {editingId === r.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.percentage}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            percentage: e.target.value,
                          })
                        }
                      />
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <button
                          className="px-2 py-1 text-white bg-emerald-600 rounded mr-2"
                          onClick={onSave}
                        >
                          Save
                        </button>
                        <button
                          className="px-2 py-1 bg-slate-100 rounded mr-2"
                          onClick={() => {
                            setEditingId(null);
                            setEditForm(emptyForm);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">
                      {Number(r.percentage).toLocaleString()}%
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <button
                          className="px-2 py-1 bg-slate-900 text-white rounded mr-2"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditForm({
                              name: r.name,
                              percentage: r.percentage,
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-4 text-center text-slate-500"
                  colSpan={isAdmin ? 3 : 2}
                >
                  No tax types found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}