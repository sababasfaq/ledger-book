const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const token = () => localStorage.getItem("token") || "";

async function req(path, opts = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (
      r.status === 401 &&
      /^(Session expired|Invalid token|Missing token)/.test(data.error || "")
    )
      window.dispatchEvent(new Event("session-expired"));
    const error = new Error(data.error || "Request failed");
    error.status = r.status;
    error.details = data;
    throw error;
  }
  return data;
}

export const api = {
  getNotifications: (includeSnoozed = false) => req("/api/notifications" + (includeSnoozed ? "?snoozed=true" : "")),
  updateNotification: (id, payload) => req("/api/notifications/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(payload) }),
  checkDuplicates: (type, payload) => req(`/api/ledger/${type}/duplicates`, { method: "POST", body: JSON.stringify(payload) }),
  attachReceipt: (type, id, payload) => req(`/api/ledger/${type}/${id}/attachment`, { method: "PATCH", body: JSON.stringify(payload) }),
  setInstructionDueDate: (id, dueDate) => req(`/api/instructions/${id}/due-date`, { method: "PATCH", body: JSON.stringify({ dueDate }) }),
  getAiStatus: () => req("/api/ai/status"),
  scanReceipt: (payload, signal) =>
    req("/api/ai/receipt", {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }),
  askAssistant: (payload, signal, onEvent) => onEvent ? streamAssistant(payload, signal, onEvent) :
    req("/api/ai/assistant", {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    }),

  signup: (payload) =>
    req("/api/signup", { method: "POST", body: JSON.stringify(payload) }),

  login: (username, password) =>
    req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  verifyOtp: (email, code) =>
    req("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  getMe: () => req("/api/me"),
  updateMe: (payload) =>
    req("/api/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getLedger: (type) => req(`/api/ledger/${type}`),

  addRow: (type, row) =>
    req(`/api/ledger/${type}`, {
      method: "POST",
      body: JSON.stringify(row),
    }),

  updateRow: (type, id, patch) =>
    req(`/api/ledger/${type}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteRow: (type, id) =>
    req(`/api/ledger/${type}/${id}`, {
      method: "DELETE",
    }),

  getDepartmental: ({
    general = true,
    unofficial = true,
    association = true,
    departmental = true,
  } = {}) => {
    const inc = [];
    if (general) inc.push("general");
    if (unofficial) inc.push("unofficial");
    if (association) inc.push("association");
    if (departmental) inc.push("departmental");
    const qs = `?include=${encodeURIComponent(inc.join(","))}`;
    return req(`/api/departmental${qs}`);
  },

  listPendingUsers: () => req(`/api/admin/users/pending`),
  listApprovedUsers: () => req(`/api/admin/users`),
  approveUser: (id) =>
    req(`/api/admin/users/${id}/approve`, { method: "POST" }),
  deleteUser: (id) => req(`/api/admin/users/${id}`, { method: "DELETE" }),

  getLogs: () => req(`/api/admin/logs`),
  getAudit: (filters = {}) =>
    req(
      "/api/admin/logs?" +
        new URLSearchParams(
          Object.entries(filters).filter(([, v]) => v !== "" && v != null),
        ),
    ),
  getFinanceConfig: () => req("/api/finance/config"),
  getCategories: () => req("/api/categories"),
  addCategory: (payload) =>
    req("/api/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id, payload) =>
    req(`/api/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getPeriods: () => req("/api/periods"),
  createPeriod: (payload) =>
    req("/api/periods", { method: "POST", body: JSON.stringify(payload) }),
  updatePeriod: (id, payload) =>
    req(`/api/periods/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getPeriodSummary: (id) => req(`/api/periods/${id}/summary`),
  getPeriodReport: (id) => req(`/api/periods/${id}/report`),
  setOpeningBalances: (id, payload) =>
    req(`/api/periods/${id}/opening-balances`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  closePeriod: (id, reason) =>
    req(`/api/periods/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getBudgets: (periodId) =>
    req("/api/budgets?" + new URLSearchParams({ periodId })),
  saveBudget: (payload) =>
    req("/api/budgets", { method: "PUT", body: JSON.stringify(payload) }),
  reverseRow: (type, id, payload) =>
    req(`/api/ledger/${type}/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  previewImport: (type, rows) =>
    req(`/api/ledger/${type}/import/preview`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  importRows: (type, payload) =>
    req(`/api/ledger/${type}/import`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBackups: () => req("/api/backups"),
  createBackup: () => req("/api/backups", { method: "POST", body: "{}" }),
  saveBackupSettings: (payload) =>
    req("/api/backups/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  restoreBackup: (id, payload) =>
    req(`/api/backups/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  downloadBackup: async (id) => {
    const response = await fetch(
      `${API_BASE}/api/backups/${encodeURIComponent(id)}/download`,
      { headers: { Authorization: `Bearer ${token()}` } },
    );
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => ({}))).error || "Download failed",
      );
    return response.blob();
  },

  getTaxes: () => req(`/api/taxes`),
  addTax: (payload) =>
    req(`/api/taxes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTax: (id, payload) =>
    req(`/api/taxes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTax: (id) =>
    req(`/api/taxes/${id}`, {
      method: "DELETE",
    }),

  getTaxReturnChallans: () => req(`/api/tax-return-challan`),
  createTaxReturnChallan: (payload) =>
    req(`/api/tax-return-challan`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getInstructionsPendingCount: () => req(`/api/instructions/pending-count`),
  getInstructions: () => req(`/api/instructions`),
  addInstruction: (payload) =>
    req(`/api/instructions`, { method: "POST", body: JSON.stringify(payload) }),
  deleteInstruction: (id) =>
    req(`/api/instructions/${id}`, { method: "DELETE" }),
  getSubmissions: (id) => req(`/api/instructions/${id}/submissions`),
  submitInstruction: (id, payload) =>
    req(`/api/instructions/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getDashboardStats: () => req("/api/dashboard/stats"),

  changePassword: (payload) =>
    req("/api/me/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

async function streamAssistant(payload, signal, onEvent) {
  const response = await fetch(API_BASE + "/api/ai/assistant/stream", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && /^(Session expired|Invalid token|Missing token)/.test(data.error || "")) window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "The assistant request failed");
  }
  if (!response.body) throw new Error("No assistant response received");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result = null;
  const consume = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error("The assistant response was interrupted. Please retry."); }
    if (event.type === "error") throw new Error(event.error || "The assistant could not complete this request");
    if (event.type === "result") result = event.result;
    else onEvent(event);
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 200000) throw new Error("The assistant response is too large");
      const lines = buffer.split("\n"); buffer = lines.pop();
      lines.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!result) throw new Error("The reply was interrupted. Please retry or continue from the visible text.");
    return result;
  } finally { await reader.cancel().catch(() => {}); }
}
