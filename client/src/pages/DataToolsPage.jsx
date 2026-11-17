import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DatabaseBackup, Download, RotateCcw, Upload } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../state/AuthContext";
import {
  amount,
  downloadBlob,
  Field,
  ledgerNames,
  Modal,
  Notice,
  Panel,
  today,
} from "../components/FinanceUI";

const headerKeys = {
  date: "date",
  voucherno: "voucherNo",
  vouchernumber: "voucherNo",
  deposit: "deposit",
  cost: "cost",
  category: "category",
  description: "description",
  signature: "signature",
  taxtype: "taxType",
};
export function spreadsheetRows(XLSX, sheet) {
  const range = sheet["!fullref"] || sheet["!ref"];
  if (!range) throw new Error("The worksheet is empty");
  if (XLSX.utils.decode_range(range).e.r > 1000)
    throw new Error("Import up to 1,000 rows at a time");
  const cells = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  const headers = (cells[0] || []).map(
    (value) =>
      headerKeys[
        String(value)
          .trim()
          .toLowerCase()
          .replace(/[\s_-]/g, "")
      ],
  );
  if (!headers.includes("date") || !headers.includes("voucherNo"))
    throw new Error(
      "The first row must include Date and Voucher No columns. Download the template for the expected format.",
    );
  const known = headers.filter(Boolean);
  if (new Set(known).size !== known.length)
    throw new Error("The worksheet has duplicate column headings");
  return cells
    .slice(1)
    .map((values, index) => {
      const row = { sourceRow: index + 2 };
      headers.forEach((key, column) => {
        if (key) row[key] = values[column] ?? "";
      });
      if (row.date instanceof Date)
        row.date = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}-${String(row.date.getDate()).padStart(2, "0")}`;
      else if (typeof row.date === "number") {
        const d = XLSX.SSF.parse_date_code(row.date);
        row.date = d
          ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
          : String(row.date);
      } else row.date = String(row.date || "").trim();
      for (const key of [
        "voucherNo",
        "category",
        "description",
        "signature",
        "taxType",
      ])
        if (row[key] != null) row[key] = String(row[key]).trim();
      return row;
    })
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "sourceRow" && value !== "",
      ),
    );
}

export default function DataToolsPage() {
  const { user, logout } = useAuth(),
    isAdmin = user?.role === "super_admin",
    navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("import"),
    [type, setType] = useState(
      Object.hasOwn(ledgerNames, params.get("ledger"))
        ? params.get("ledger")
        : "general",
    );
  const [workbook, setWorkbook] = useState(null),
    [sheetName, setSheetName] = useState(""),
    [fileName, setFileName] = useState(""),
    [rawRows, setRawRows] = useState([]),
    [preview, setPreview] = useState(null),
    [selected, setSelected] = useState([]);
  const [backupData, setBackupData] = useState(null),
    [schedule, setSchedule] = useState(null),
    [restoring, setRestoring] = useState(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const loadBackups = async () => {
    const data = await api.getBackups();
    setBackupData(data);
    setSchedule({
      enabled: !!data.settings.enabled,
      intervalHours: data.settings.interval_hours,
      retainCount: data.settings.retain_count,
    });
  };
  useEffect(() => {
    if (tab === "backups" && isAdmin)
      loadBackups().catch((e) => setError(e.message));
  }, [tab, isAdmin]);
  useEffect(() => {
    setPreview(null);
    setSelected([]);
  }, [type, sheetName]);
  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const readFile = (e) => {
    const file = e.target.files?.[0];
    setWorkbook(null);
    setPreview(null);
    setRawRows([]);
    setSelected([]);
    setFileName("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a spreadsheet of 5 MB or less");
      e.target.value = "";
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Choose an .xlsx, .xls or .csv file");
      return;
    }
    run(async () => {
      const XLSX = await import("xlsx"),
        buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, {
        type: "array",
        cellDates: false,
        raw: true,
        sheetRows: 1002,
        bookVBA: false,
      });
      if (!book.SheetNames.length) throw new Error("No worksheets found");
      setWorkbook(book);
      setSheetName(book.SheetNames[0]);
      setFileName(file.name);
    });
  };
  const previewFile = () =>
    run(async () => {
      const XLSX = await import("xlsx"),
        rows = spreadsheetRows(XLSX, workbook.Sheets[sheetName]);
      if (!rows.length) throw new Error("The worksheet has no data rows");
      const result = await api.previewImport(type, rows);
      setRawRows(rows);
      setPreview(result);
      setSelected(
        result.rows.filter((row) => row.valid).map((row) => row.index),
      );
    });
  const template = () =>
    run(async () => {
      const [XLSX, categories] = await Promise.all([
        import("xlsx"),
        api.getCategories(),
      ]);
      const book = XLSX.utils.book_new(),
        sheet = XLSX.utils.json_to_sheet([
          {
            Date: today(),
            "Voucher No": "EXAMPLE-001",
            Deposit: "",
            Cost: 100,
            Category: categories.find((c) => c.active)?.name || "Other",
            Description: "Replace this example",
            Signature: "",
            "Tax Type": "",
          },
        ]);
      sheet["!cols"] = [
        { wch: 14 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 35 },
        { wch: 20 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(book, sheet, "Import");
      XLSX.writeFile(book, "Ledger_import_template.xlsx");
    });
  const commitImport = () =>
    run(async () => {
      const result = await api.importRows(type, {
        fileName,
        rows: selected.map((index) => rawRows[index]),
      });
      setPreview(null);
      setSelected([]);
      setWorkbook(null);
      setFileName("");
      setMessage(
        `${result.imported} entries imported into ${ledgerNames[type]}. Each entry is recorded in the audit trail.`,
      );
    });
  return (
    <article className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Data Tools</h1>
        <p className="text-sm text-slate-500 mt-1">
          Preview spreadsheet imports and keep recovery copies of the project’s
          data.
        </p>
      </header>
      <div className="flex gap-2 border-b pb-3">
        <button
          className={
            tab === "import" ? "finance-button" : "finance-button-secondary"
          }
          onClick={() => {
            setTab("import");
            setError("");
            setMessage("");
          }}
        >
          <Upload size={16} />
          Import ledger
        </button>
        {isAdmin && (
          <button
            className={
              tab === "backups" ? "finance-button" : "finance-button-secondary"
            }
            onClick={() => {
              setTab("backups");
              setError("");
              setMessage("");
            }}
          >
            <DatabaseBackup size={16} />
            Backups & recovery
          </button>
        )}
      </div>
      <Notice message={error} error />
      <Notice message={message} />
      {tab === "import" ? (
        <>
          <Panel
            title="1. Choose a ledger and spreadsheet"
            actions={
              <button
                disabled={busy}
                className="finance-button-secondary"
                onClick={template}
              >
                <Download size={16} />
                Download template
              </button>
            }
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Destination ledger">
                <select
                  disabled={busy}
                  className="finance-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {Object.entries(ledgerNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Spreadsheet (.xlsx, .xls or .csv, up to 5 MB)">
                <input
                  disabled={busy}
                  className="finance-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={readFile}
                />
              </Field>
              {workbook && (
                <Field label="Worksheet">
                  <select
                    disabled={busy}
                    className="finance-input"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                  >
                    {workbook.SheetNames.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-4">
              Use YYYY-MM-DD dates or Excel date cells and amounts with up to
              two decimal places. Costs need an existing active category. Tax
              Type is optional. Up to 1,000 rows per import.
            </p>
            <button
              disabled={busy || !workbook}
              className="finance-button mt-4"
              onClick={previewFile}
            >
              {busy ? "Working..." : "Validate and preview"}
            </button>
          </Panel>
          {preview && (
            <Panel title="2. Review and import selected rows">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <p className="text-sm">
                  <strong className="text-emerald-700">
                    {preview.validCount} valid
                  </strong>{" "}
                  ·{" "}
                  <strong className="text-red-700">
                    {preview.invalidCount} invalid or duplicate
                  </strong>{" "}
                  · {selected.length} selected
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      preview.validCount > 0 &&
                      selected.length === preview.validCount
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? preview.rows
                              .filter((row) => row.valid)
                              .map((row) => row.index)
                          : [],
                      )
                    }
                  />
                  Select valid rows
                </label>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Row</th>
                      <th>Date</th>
                      <th>Voucher</th>
                      <th>Deposit</th>
                      <th>Cost</th>
                      <th>Category</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={row.index}
                        className={!row.valid ? "bg-red-50/60" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            disabled={!row.valid || busy}
                            aria-label={`Import spreadsheet row ${row.sourceRow}`}
                            checked={selected.includes(row.index)}
                            onChange={(e) =>
                              setSelected((values) =>
                                e.target.checked
                                  ? [...values, row.index]
                                  : values.filter((i) => i !== row.index),
                              )
                            }
                          />
                        </td>
                        <td>{row.sourceRow}</td>
                        <td>{String(row.entry?.date || "")}</td>
                        <td>{String(row.entry?.voucherNo || "")}</td>
                        <td>{String(row.entry?.deposit ?? "")}</td>
                        <td>{String(row.entry?.cost ?? "")}</td>
                        <td>{String(row.entry?.category || "")}</td>
                        <td
                          className={
                            row.valid ? "text-emerald-700" : "text-red-700"
                          }
                        >
                          {row.valid ? "Ready" : row.errors.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 my-4">
                Duplicate detection compares voucher number, date and amounts
                within this ledger and the import. Selected rows are validated
                again and committed together; a failed row leaves the whole
                selection unchanged.
              </p>
              <button
                disabled={busy || !selected.length}
                className="finance-button"
                onClick={commitImport}
              >
                {busy
                  ? "Importing..."
                  : `Import ${selected.length} selected entries`}
              </button>
            </Panel>
          )}
        </>
      ) : backupData ? (
        <>
          <Panel title="Automatic backups">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api.saveBackupSettings(schedule);
                  await loadBackups();
                }, "Backup schedule saved");
              }}
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(e) =>
                    setSchedule({ ...schedule, enabled: e.target.checked })
                  }
                />
                Enable automatic backups while the server is running
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Run every (hours)">
                  <input
                    className="finance-input"
                    type="number"
                    min="1"
                    max="168"
                    required
                    value={schedule.intervalHours}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        intervalHours: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Scheduled copies to retain">
                  <input
                    className="finance-input"
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={schedule.retainCount}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        retainCount: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                The scheduler checks once a minute. Retention applies to
                scheduled copies; manual and safety backups are kept. Last
                successful backup:{" "}
                {backupData.settings.last_success_at
                  ? new Date(
                      backupData.settings.last_success_at,
                    ).toLocaleString()
                  : "None yet"}
                .
              </p>
              {backupData.settings.last_error && (
                <Notice
                  error
                  message={`Last backup error: ${backupData.settings.last_error}`}
                />
              )}
              <button disabled={busy} className="finance-button-secondary">
                Save schedule
              </button>
            </form>
          </Panel>
          <Panel
            title="Recovery copies"
            actions={
              <button
                disabled={busy}
                className="finance-button"
                onClick={() =>
                  run(async () => {
                    await api.createBackup();
                    await loadBackups();
                  }, "Backup created and integrity checked")
                }
              >
                <DatabaseBackup size={16} />
                Create backup now
              </button>
            }
          >
            <p className="text-sm text-slate-500 mb-4">
              Copies include accounts, attachments and financial records.
              Download copies for storage away from this computer. Restoring
              creates a safety copy, keeps the current audit history, and signs
              everyone out.
            </p>
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Backup</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupData.files.map((file) => (
                    <tr key={file.id}>
                      <td className="max-w-xs break-all text-xs">
                        {file.id}
                        {!file.compatible && (
                          <p className="text-amber-700 mt-1">
                            Before upgrade · offline recovery only
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {new Date(file.createdAt).toLocaleString()}
                      </td>
                      <td>{(file.size / 1024 / 1024).toFixed(2)} MB</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            className="finance-button-secondary"
                            aria-label={`Download ${file.id}`}
                            onClick={() =>
                              run(async () =>
                                downloadBlob(
                                  await api.downloadBackup(file.id),
                                  file.id,
                                ),
                              )
                            }
                          >
                            <Download size={15} />
                            Download
                          </button>
                          <button
                            disabled={busy || !file.compatible}
                            className="finance-button-danger"
                            aria-label={`Restore ${file.id}`}
                            onClick={() => {
                              setError("");
                              setRestoring({
                                id: file.id,
                                password: "",
                                reason: "",
                                confirmation: "",
                              });
                            }}
                          >
                            <RotateCcw size={15} />
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!backupData.files.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-slate-400"
                      >
                        No recovery copies yet. Create the first backup above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <p role="status">Loading backups...</p>
      )}
      {restoring && (
        <Modal
          title="Restore database backup"
          onClose={() => {
            if (!busy) setRestoring(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.restoreBackup(restoring.id, restoring);
                logout();
                navigate("/", { replace: true });
              });
            }}
          >
            <Notice message={error} error />
            <p className="text-sm bg-amber-50 text-amber-900 p-3 rounded-lg border">
              This replaces the current application data with{" "}
              <strong className="break-all">{restoring.id}</strong>. A safety
              copy is made first. After recovery, sign in with an account and
              password from the restored copy.
            </p>
            <Field label="Reason for recovery">
              <textarea
                required
                maxLength={1000}
                className="finance-input"
                value={restoring.reason}
                onChange={(e) =>
                  setRestoring({ ...restoring, reason: e.target.value })
                }
              />
            </Field>
            <Field label="Your current password">
              <input
                autoComplete="current-password"
                type="password"
                required
                className="finance-input"
                value={restoring.password}
                onChange={(e) =>
                  setRestoring({ ...restoring, password: e.target.value })
                }
              />
            </Field>
            <Field label="Type RESTORE to confirm">
              <input
                required
                pattern="RESTORE"
                className="finance-input"
                value={restoring.confirmation}
                onChange={(e) =>
                  setRestoring({ ...restoring, confirmation: e.target.value })
                }
              />
            </Field>
            <button
              disabled={busy || restoring.confirmation !== "RESTORE"}
              className="finance-button-danger"
            >
              {busy ? "Restoring..." : "Restore and sign out"}
            </button>
          </form>
        </Modal>
      )}
    </article>
  );
}
