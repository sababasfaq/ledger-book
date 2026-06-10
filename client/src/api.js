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
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
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
  deleteUser: (id) =>
    req(`/api/admin/users/${id}`, { method: "DELETE" }),

  getLogs: () => req(`/api/admin/logs`),

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
};