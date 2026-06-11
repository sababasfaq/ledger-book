import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext.jsx";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function notifyInstructionsUpdated() {
  window.dispatchEvent(new Event("instructions-updated"));
}

export default function InstructionsPage() {
  const { user } = useAuth();
  const isChairman = user?.role === "super_admin";
  const isOfficer = user?.role === "official";

  const [instructions, setInstructions] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ title: "", description: "" });
  const [submittingId, setSubmittingId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.getInstructions();
      setInstructions(data.instructions || []);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "Failed to load instructions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAdd = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setMsg("Title and description are required");
      return;
    }
    try {
      setMsg("");
      await api.addInstruction({
        title: form.title.trim(),
        description: form.description.trim(),
      });
      setForm({ title: "", description: "" });
      await load();
      notifyInstructionsUpdated();
    } catch (e) {
      setMsg(e.message || "Failed to add instruction");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this instruction?")) return;
    try {
      await api.deleteInstruction(id);
      await load();
      notifyInstructionsUpdated();
    } catch (e) {
      setMsg(e.message || "Failed to delete instruction");
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setMsg("File must be 5MB or less");
      setSelectedFile(null);
      return;
    }
    setMsg("");
    setSelectedFile(file);
  };

  const onSubmitDone = async (id) => {
    try {
      setSubmitting(true);
      setMsg("");

      const payload = {};
      if (selectedFile) {
        payload.fileData = await fileToBase64(selectedFile);
        payload.fileName = selectedFile.name;
      }

      await api.submitInstruction(id, payload);
      setSubmittingId(null);
      setSelectedFile(null);
      await load();
      notifyInstructionsUpdated();
    } catch (e) {
      setMsg(e.message || "Failed to mark as done");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = instructions.filter((i) => !i.mySubmitted);
  const completed = instructions.filter((i) => i.mySubmitted);

  return (
    <article aria-labelledby="instructions-title">
      <header className="mb-4">
        {isChairman ? (
          <h1 id="instructions-title" className="text-xl font-semibold mb-1">Manage Instructions</h1>
        ) : (
          <h1 id="instructions-title" className="text-xl font-semibold mb-1">Office Instructions</h1>
        )}
        <p className="text-sm text-slate-500">
          {isChairman
            ? "Add tasks for office workers. They will see them on this page with a notification badge."
            : "Complete the instructions from the Chairman. Attach a file only if required."}
        </p>
      </header>

      {msg && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
          {msg}
        </div>
      )}

      {isChairman && (
        <section aria-labelledby="add-instruction-title" className="bg-white border rounded p-4 mb-6 space-y-3">
          <h2 id="add-instruction-title" className="font-medium text-slate-800">Add New Instruction</h2>
          <div className="space-y-2">
            <label htmlFor="inst-title" className="sr-only">Title</label>
            <input
              id="inst-title"
              className="border rounded px-3 py-2 w-full"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <label htmlFor="inst-desc" className="sr-only">Description</label>
            <textarea
              id="inst-desc"
              className="border rounded px-3 py-2 w-full min-h-[100px]"
              placeholder="What should the office worker do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm"
            onClick={onAdd}
            aria-label="Add new instruction"
          >
            Add Instruction
          </button>
        </section>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm" role="status">Loading...</p>
      ) : isOfficer ? (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section aria-labelledby="todo-title">
              <h2 id="todo-title" className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                To Do
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white" aria-label={`${pending.length} items to do`}>
                  {pending.length}
                </span>
              </h2>
              <div className="space-y-4">
                {pending.map((inst) => (
                  <OfficerCard
                    key={inst.id}
                    inst={inst}
                    submittingId={submittingId}
                    selectedFile={selectedFile}
                    submitting={submitting}
                    onStart={() => {
                      setSubmittingId(inst.id);
                      setSelectedFile(null);
                      setMsg("");
                    }}
                    onCancel={() => {
                      setSubmittingId(null);
                      setSelectedFile(null);
                    }}
                    onFileChange={onFileChange}
                    onSubmit={() => onSubmitDone(inst.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section aria-labelledby="completed-title">
              <h2 id="completed-title" className="font-medium text-slate-800 mb-3">Completed</h2>
              <div className="space-y-4">
                {completed.map((inst) => (
                  <OfficerCard key={inst.id} inst={inst} done />
                ))}
              </div>
            </section>
          )}

          {pending.length === 0 && completed.length === 0 && (
            <p className="text-slate-500 text-sm">No instructions at the moment.</p>
          )}
        </div>
      ) : isChairman ? (
        <section aria-labelledby="all-instructions-title">
          <h2 id="all-instructions-title" className="font-medium text-slate-800 mb-3">All Instructions</h2>
          {instructions.length === 0 ? (
            <p className="text-slate-500 text-sm">No instructions yet.</p>
          ) : (
            <div className="space-y-4">
              {instructions.map((inst) => (
                <ChairmanCard
                  key={inst.id}
                  inst={inst}
                  onDelete={() => onDelete(inst.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </article>
  );
}

function ChairmanCard({ inst, onDelete }) {
  const doneCount = inst.submissions?.length || 0;

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="font-medium text-slate-900">{inst.title}</h3>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
            {inst.description}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Added {inst.createdAt}
            {inst.createdByName ? ` by ${inst.createdByName}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-red-600 hover:underline shrink-0"
          onClick={onDelete}
          aria-label={`Delete instruction: ${inst.title}`}
        >
          Delete
        </button>
      </div>

      <div className="mt-3 text-sm text-slate-600">
        Completed by {doneCount} office worker{doneCount !== 1 ? "s" : ""}
      </div>

      {doneCount > 0 && (
        <ul role="list" className="mt-3 space-y-2 border-t pt-3">
          {inst.submissions.map((s) => (
            <li
              key={s.id}
              className="text-sm flex items-center justify-between gap-2 bg-slate-50 rounded px-3 py-2"
            >
              <span>
                <span className="font-medium">{s.submittedByName}</span>
                <span className="text-slate-400 ml-2">{s.submittedAt}</span>
              </span>
              {s.fileData && (
                <a
                  href={s.fileData}
                  download={s.fileName || "attachment"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs shrink-0"
                  aria-label={`Download file ${s.fileName} submitted by ${s.submittedByName}`}
                >
                  {s.fileName || "View file"}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OfficerCard({
  inst,
  done,
  submittingId,
  selectedFile,
  submitting,
  onStart,
  onCancel,
  onFileChange,
  onSubmit,
}) {
  const showForm = submittingId === inst.id;
  const submission = inst.mySubmission;

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-medium text-slate-900">{inst.title}</h3>
        {done && (
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
            Done
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
        {inst.description}
      </p>
      <p className="text-xs text-slate-400 mt-2">
        From Chairman · {inst.createdAt}
      </p>

      {!done && !showForm && (
        <button
          type="button"
          className="mt-4 px-4 py-2 rounded bg-slate-900 text-white text-sm"
          onClick={onStart}
          aria-label={`Mark instruction ${inst.title} as done`}
        >
          Mark as Done
        </button>
      )}

      {!done && showForm && (
        <div className="mt-4 border-t pt-3 space-y-3">
          <p className="text-sm text-slate-600">
            Optional: attach a file if needed, then submit.
          </p>
          <input
            type="file"
            className="text-sm"
            onChange={onFileChange}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            aria-label="Attach file"
          />
          {selectedFile && (
            <p className="text-xs text-slate-500">Selected: {selectedFile.name}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-50"
              disabled={submitting}
              onClick={onSubmit}
              aria-label={`Submit completion for ${inst.title}`}
            >
              {submitting ? "Submitting..." : "Submit & Mark Done"}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded border text-sm"
              disabled={submitting}
              onClick={onCancel}
              aria-label="Cancel submission"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && submission && (
        <div className="mt-3 text-sm text-slate-500">
          {submission.fileData ? (
            <a
              href={submission.fileData}
              download={submission.fileName || "attachment"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              aria-label={`Download your submitted file ${submission.fileName}`}
            >
              Your file: {submission.fileName || "attachment"}
            </a>
          ) : (
            <span>Completed without attachment.</span>
          )}
        </div>
      )}
    </div>
  );
}
