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
    <article aria-labelledby="tax-title">
      <header>
        <h1 id="tax-title" className="text-xl font-semibold mb-4">Tax</h1>
      </header>

      {isAdmin && (
        <section aria-labelledby="add-tax-title" className="bg-white border rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <h2 id="add-tax-title" className="sr-only">Add New Tax Type</h2>
          <div className="space-y-1">
            <label htmlFor="tax-name" className="sr-only">Tax Type Name</label>
            <input
              id="tax-name"
              className="border rounded px-2 py-1 w-full"
              placeholder="Tax Type"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tax-percentage" className="sr-only">Percentage</label>
            <input
              id="tax-percentage"
              type="number"
              step="0.01"
              className="border rounded px-2 py-1 w-full"
              placeholder="Percentage"
              value={form.percentage}
              onChange={(e) => setForm({ ...form, percentage: e.target.value })}
            />
          </div>
          <button
            className="px-3 py-1 rounded bg-emerald-600 text-white"
            onClick={onAdd}
            aria-label="Add new tax type"
          >
            Add Tax
          </button>
        </section>
      )}

      {msg && <p className="text-sm text-red-600 mb-3" role="alert">{msg}</p>}

      <section aria-label="Tax types table" className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th scope="col" className="text-left px-3 py-2">Tax Type</th>
              <th scope="col" className="text-left px-3 py-2">Percentage</th>
              {isAdmin && <th scope="col" className="text-left px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                {editingId === r.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        aria-label="Edit tax type name"
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label="Edit tax percentage"
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
                          aria-label={`Save changes for ${r.name}`}
                        >
                          Save
                        </button>
                        <button
                          className="px-2 py-1 bg-slate-100 rounded mr-2"
                          onClick={() => {
                            setEditingId(null);
                            setEditForm(emptyForm);
                          }}
                          aria-label="Cancel editing"
                        >
                          Cancel
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                          aria-label={`Delete ${r.name}`}
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
                          aria-label={`Edit ${r.name}`}
                        >
                          Edit
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded"
                          onClick={() => onDelete(r.id)}
                          aria-label={`Delete ${r.name}`}
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
      </section>
    </article>
  );
}