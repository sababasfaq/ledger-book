import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./db.js";
import { authRequired, superAdminOnly } from "./middleware.js";
import {
  createToken,
  hashPassword,
  verifyPassword,
} from "./auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const tableFor = (t) =>
  t === "general"
    ? "general_ledger"
    : t === "unofficial"
    ? "unofficial_ledger"
    : t === "association"
    ? "association_ledger"
    : t === "departmental"
    ? "departmental_ledger"
    : null;

const parseTaxTypeId = (value) => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function userDto(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    pictureUrl: user.picture_url || "",
    info: user.info || "",
    designation: user.designation || "",
    department: user.department || "",
    phone: user.phone || "",
    createdAt: user.created_at,
    approved: !!user.approved,
  };
}

function logAction(userId, tableName, action, rowId) {
  try {
    const user = db
      .prepare("SELECT name, role FROM users WHERE id = ?")
      .get(userId);
    const userName = user?.name || "";
    const role = user?.role || "";
    db.prepare(
      "INSERT INTO logs (user_id, user_name, role, table_name, action, row_id) VALUES (?,?,?,?,?,?)"
    ).run(userId, userName, role, tableName, action, rowId ?? null);
  } catch (err) {
    console.error("Failed to log action:", err);
  }
}

(async () => {
  const admin = db.prepare(`SELECT * FROM users WHERE role='super_admin'`).get();
  if (!admin) {
    const pass = process.env.ADMIN_PASSWORD || "admin123";
    const password_hash = await hashPassword(pass);
    db.prepare(`
      INSERT INTO users (name,email,picture_url,info,role,approved,password_hash,require_2fa)
      VALUES ('Chairman','chairman@example.com','','Super Admin','super_admin',1,?,0)
    `).run(password_hash);
    console.log(
      "✅ Seeded super admin: chairman@example.com | password:",
      process.env.ADMIN_PASSWORD || "admin123"
    );
  }
})();

// AUTH

app.post("/api/signup", async (req, res) => {
  const { name, email, password, pictureUrl, info } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }

  const exists = db.prepare(`SELECT 1 FROM users WHERE email=?`).get(email);
  if (exists) return res.status(409).json({ error: "Email already exists" });

  const password_hash = await hashPassword(password);
  db.prepare(`
    INSERT INTO users (name,email,picture_url,info,role,approved,password_hash,require_2fa)
    VALUES (?,?,?,?, 'official', 0, ?, 0)
  `).run(name, email, pictureUrl || "", info || "", password_hash);

  res.json({
    ok: true,
    message: "Account created. Waiting for Super Admin approval.",
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  const user =
    db.prepare(`SELECT * FROM users WHERE email=?`).get(username) ||
    db.prepare(`SELECT * FROM users WHERE name=?`).get(username);

  if (!user) return res.status(404).json({ error: "No account found." });

  const okPass = await verifyPassword(password, user.password_hash);
  if (!okPass) return res.status(401).json({ error: "Invalid credentials" });

  if (!user.approved) {
    return res
      .status(403)
      .json({ error: "Approval pending", pendingApproval: true });
  }

  const token = createToken(user);
  res.json({
    ok: true,
    token,
    user: userDto(user),
  });
});

// PROFILE

app.get("/api/me", authRequired, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(userDto(user));
});

app.patch("/api/me", authRequired, (req, res) => {
  const current = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  if (!current) return res.status(404).json({ error: "User not found" });

  const {
    name = current.name,
    pictureUrl = current.picture_url || "",
    info = current.info || "",
    designation = current.designation || "",
    department = current.department || "",
    phone = current.phone || "",
  } = req.body || {};

  if (!String(name || "").trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  db.prepare(
    `UPDATE users SET name=?, picture_url=?, info=?, designation=?, department=?, phone=? WHERE id=?`
  ).run(
    String(name).trim(),
    String(pictureUrl || "").trim(),
    String(info || ""),
    String(designation || ""),
    String(department || ""),
    String(phone || ""),
    req.user.id
  );

  const updated = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  res.json({ ok: true, user: userDto(updated) });
});

app.post("/api/me/change-password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  const okPass = await verifyPassword(currentPassword, user.password_hash);
  if (!okPass) return res.status(401).json({ error: "Incorrect current password" });

  const hash = await hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hash, req.user.id);

  res.json({ ok: true });
});

// ADMIN

app.get("/api/admin/users/pending", authRequired, superAdminOnly, (_req, res) => {
  const list = db
    .prepare(`SELECT id,name,email,info,picture_url FROM users WHERE approved=0`)
    .all();
  res.json(list);
});

app.get("/api/admin/users", authRequired, superAdminOnly, (_req, res) => {
  const list = db
    .prepare(`SELECT id,name,email,role,approved,picture_url,info FROM users WHERE approved=1`)
    .all();
  res.json(list);
});

app.post("/api/admin/users/:id/approve", authRequired, superAdminOnly, (req, res) => {
  db.prepare(`UPDATE users SET approved=1 WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", authRequired, superAdminOnly, (req, res) => {
  db.prepare(`DELETE FROM users WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/api/admin/logs", authRequired, superAdminOnly, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT id, user_id, user_name, role, table_name, action, row_id, created_at
      FROM logs
      ORDER BY created_at DESC
    `)
    .all();
  res.json(rows);
});

// TAX TYPES

app.get("/api/taxes", authRequired, (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name, percentage FROM tax_types ORDER BY name ASC`)
    .all();
  res.json(rows);
});

app.post("/api/taxes", authRequired, superAdminOnly, (req, res) => {
  const { name, percentage } = req.body || {};

  if (!name || percentage == null || percentage === "") {
    return res.status(400).json({ error: "name and percentage are required" });
  }

  const out = db
    .prepare(`INSERT INTO tax_types (name, percentage) VALUES (?, ?)`)
    .run(String(name).trim(), Number(percentage));

  res.json({ ok: true, id: out.lastInsertRowid });
});

app.patch("/api/taxes/:id", authRequired, superAdminOnly, (req, res) => {
  const { id } = req.params;
  const { name, percentage } = req.body || {};

  if (!name || percentage == null || percentage === "") {
    return res.status(400).json({ error: "name and percentage are required" });
  }

  db.prepare(`UPDATE tax_types SET name=?, percentage=? WHERE id=?`).run(
    String(name).trim(),
    Number(percentage),
    Number(id)
  );

  res.json({ ok: true });
});

app.delete("/api/taxes/:id", authRequired, superAdminOnly, (req, res) => {
  const taxId = Number(req.params.id);

  db.prepare(`UPDATE general_ledger SET tax_type_id=NULL WHERE tax_type_id=?`).run(taxId);
  db.prepare(`UPDATE unofficial_ledger SET tax_type_id=NULL WHERE tax_type_id=?`).run(taxId);
  db.prepare(`UPDATE association_ledger SET tax_type_id=NULL WHERE tax_type_id=?`).run(taxId);
  db.prepare(`UPDATE departmental_ledger SET tax_type_id=NULL WHERE tax_type_id=?`).run(taxId);
  db.prepare(`DELETE FROM tax_types WHERE id=?`).run(taxId);

  res.json({ ok: true });
});

// LEDGERS

app.get("/api/ledger/:type", authRequired, (req, res) => {
  const tbl = tableFor(req.params.type);
  if (!tbl) return res.status(400).json({ error: "invalid type" });

  const rows = db
    .prepare(`
      SELECT
        l.*,
        u.name AS addedByName,
        u.role AS addedByRole,
        t.id AS taxTypeId,
        t.name AS taxTypeName,
        t.percentage AS taxPercentage
      FROM ${tbl} AS l
      LEFT JOIN users u ON l.created_by = u.id
      LEFT JOIN tax_types t ON l.tax_type_id = t.id
      ORDER BY l.date ASC, l.no ASC
    `)
    .all();

  res.json(rows.map(r => ({
    ...r,
    voucherFileName: r.voucher_file_name,
    voucherFileData: r.voucher_file_data
  })));
});

app.post("/api/ledger/:type", authRequired, (req, res) => {
  const tbl = tableFor(req.params.type);
  if (!tbl) return res.status(400).json({ error: "invalid type" });

  const { date, voucherNo, deposit, cost, description, signature, taxTypeId, voucherFileName, voucherFileData } =
    req.body || {};

  if (!date || !voucherNo) {
    return res.status(400).json({ error: "date and voucherNo are required" });
  }

  if ((deposit == null || deposit === "") && (cost == null || cost === "")) {
    return res.status(400).json({ error: "Either deposit or cost must be provided" });
  }

  const last = db
    .prepare(`SELECT no FROM ${tbl} ORDER BY CAST(no AS INTEGER) DESC LIMIT 1`)
    .get();

  let nextNo = 1;
  if (last && last.no != null) {
    const parsed = parseInt(last.no, 10);
    if (Number.isFinite(parsed)) nextNo = parsed + 1;
  }
  const noValue = String(nextNo).padStart(2, "0");

  const out = db
    .prepare(`
      INSERT INTO ${tbl} (no,date,voucher_no,deposit,cost,description,signature,created_by,tax_type_id,voucher_file_name,voucher_file_data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `)
    .run(
      noValue,
      date,
      voucherNo,
      deposit === "" ? null : Number(deposit),
      cost === "" ? null : Number(cost),
      description || "",
      signature || "",
      req.user.id,
      parseTaxTypeId(taxTypeId),
      voucherFileName || null,
      voucherFileData || null
    );

  logAction(req.user.id, tbl, "ADD", out.lastInsertRowid);

  res.json({ ok: true, id: out.lastInsertRowid, no: noValue });
});

app.patch("/api/ledger/:type/:id", authRequired, superAdminOnly, (req, res) => {
  const tbl = tableFor(req.params.type);
  if (!tbl) return res.status(400).json({ error: "invalid type" });

  const id = Number(req.params.id);
  const map = { 
    voucherNo: "voucher_no", 
    taxTypeId: "tax_type_id",
    voucherFileName: "voucher_file_name",
    voucherFileData: "voucher_file_data"
  };
  const allowed = [
    "date",
    "voucherNo",
    "deposit",
    "cost",
    "description",
    "signature",
    "taxTypeId",
    "voucherFileName",
    "voucherFileData"
  ];

  const sets = [];
  const vals = [];

  for (const k of allowed) {
    if (k in req.body) {
      const col = map[k] || k;

      if (k === "deposit" || k === "cost") {
        const v = req.body[k];
        vals.push(v === "" || v == null ? null : Number(v));
      } else if (k === "taxTypeId") {
        vals.push(parseTaxTypeId(req.body[k]));
      } else {
        vals.push(req.body[k]);
      }

      sets.push(`${col} = ?`);
    }
  }

  if (!sets.length) return res.status(400).json({ error: "no fields" });

  vals.push(id);
  db.prepare(`UPDATE ${tbl} SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

  logAction(req.user.id, tbl, "EDIT", id);

  res.json({ ok: true });
});

app.delete("/api/ledger/:type/:id", authRequired, superAdminOnly, (req, res) => {
  const tbl = tableFor(req.params.type);
  if (!tbl) return res.status(400).json({ error: "invalid type" });

  const id = Number(req.params.id);
  db.prepare(`DELETE FROM ${tbl} WHERE id=?`).run(id);

  logAction(req.user.id, tbl, "DELETE", id);

  res.json({ ok: true });
});

// DEPARTMENTAL COMBINED

app.get("/api/departmental", authRequired, (req, res) => {
  const include = (
    req.query.include || "general,unofficial,association,departmental"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let rows = [];

  if (include.includes("general")) {
    rows = rows.concat(
      db.prepare(`
        SELECT 'general' AS _src, l.id,l.no,l.date,l.voucher_no,l.deposit,l.cost,l.description,l.signature,
        l.tax_type_id AS taxTypeId,t.name AS taxTypeName,t.percentage AS taxPercentage
        FROM general_ledger l
        LEFT JOIN tax_types t ON l.tax_type_id=t.id
      `).all()
    );
  }

  if (include.includes("unofficial")) {
    rows = rows.concat(
      db.prepare(`
        SELECT 'unofficial' AS _src, l.id,l.no,l.date,l.voucher_no,l.deposit,l.cost,l.description,l.signature,
        l.tax_type_id AS taxTypeId,t.name AS taxTypeName,t.percentage AS taxPercentage
        FROM unofficial_ledger l
        LEFT JOIN tax_types t ON l.tax_type_id=t.id
      `).all()
    );
  }

  if (include.includes("association")) {
    rows = rows.concat(
      db.prepare(`
        SELECT 'association' AS _src, l.id,l.no,l.date,l.voucher_no,l.deposit,l.cost,l.description,l.signature,
        l.tax_type_id AS taxTypeId,t.name AS taxTypeName,t.percentage AS taxPercentage
        FROM association_ledger l
        LEFT JOIN tax_types t ON l.tax_type_id=t.id
      `).all()
    );
  }

  if (include.includes("departmental")) {
    rows = rows.concat(
      db.prepare(`
        SELECT 'departmental' AS _src, l.id,l.no,l.date,l.voucher_no,l.deposit,l.cost,l.description,l.signature,
        l.tax_type_id AS taxTypeId,t.name AS taxTypeName,t.percentage AS taxPercentage
        FROM departmental_ledger l
        LEFT JOIN tax_types t ON l.tax_type_id=t.id
      `).all()
    );
  }

  rows = rows.map((r) => ({
    ...r,
    deposit: r.deposit == null ? null : Number(r.deposit),
    cost: r.cost == null ? null : Number(r.cost),
    voucherNo: r.voucher_no,
  }));

  rows.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return String(a.no).localeCompare(String(b.no));
  });

  rows = rows.map((r, i) => ({ ...r, combinedNo: i + 1 }));

  res.json(rows);
});

// TAX RETURN CHALLAN

app.get("/api/tax-return-challan", authRequired, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT *
      FROM tax_return_challans
      ORDER BY created_at DESC, id DESC
    `)
    .all();
  res.json(rows);
});

app.post("/api/tax-return-challan", authRequired, (req, res) => {
  const {
    challanNo,
    date,
    zone,
    circle,
    taxType,
    taxPeriod,
    depositor,
    bankBranch,
    accountHead,
    amountWords,
    amount,
    officerName,
    note,
    extraComment,
  } = req.body || {};

  if (!challanNo || !taxType || !taxPeriod) {
    return res.status(400).json({ error: "challanNo, taxType and taxPeriod are required" });
  }

  if (!bankBranch || !accountHead || amount == null || amount === "") {
    return res.status(400).json({ error: "bankBranch, accountHead and amount are required" });
  }

  const out = db
    .prepare(`
      INSERT INTO tax_return_challans (
        challan_no,
        date_day,
        date_month,
        date_year,
        zone,
        circle,
        tax_type,
        tax_period,
        depositor_name,
        depositor_tin,
        depositor_address,
        bank_branch,
        account_head,
        amount_words,
        amount,
        phone,
        officer_name,
        note,
        extra_comment,
        created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .run(
      String(challanNo || ""),
      String(date?.day || ""),
      String(date?.month || ""),
      String(date?.year || ""),
      String(zone || ""),
      String(circle || ""),
      String(taxType || ""),
      String(taxPeriod || ""),
      String(depositor?.name || ""),
      String(depositor?.tin || ""),
      String(depositor?.address || ""),
      String(bankBranch || ""),
      String(accountHead || ""),
      String(amountWords || ""),
      Number(amount),
      String(depositor?.phone || ""),
      String(officerName || ""),
      String(note || ""),
      String(extraComment || ""),
      req.user.id
    );

  logAction(req.user.id, "tax_return_challans", "ADD", out.lastInsertRowid);

  res.json({ ok: true, id: out.lastInsertRowid });
});

// INSTRUCTIONS

function mapSubmission(row) {
  return {
    id: row.id,
    instructionId: row.instruction_id,
    submittedBy: row.submitted_by,
    submittedByName: row.submittedByName || "",
    fileName: row.file_name || "",
    fileData: row.file_data || "",
    note: row.note || "",
    submittedAt: row.submitted_at,
  };
}

function pendingCountForUser(userId) {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count FROM instructions i
      WHERE NOT EXISTS (
        SELECT 1 FROM instruction_submissions s
        WHERE s.instruction_id = i.id AND s.submitted_by = ?
      )
    `)
    .get(userId);
  return row?.count ?? 0;
}

app.get("/api/instructions/pending-count", authRequired, (req, res) => {
  if (req.user.role === "super_admin") {
    return res.json({ count: 0 });
  }
  res.json({ count: pendingCountForUser(req.user.id) });
});

app.get("/api/instructions", authRequired, (req, res) => {
  const isAdmin = req.user.role === "super_admin";
  const userId = req.user.id;

  const instructions = db
    .prepare(`
      SELECT i.id, i.title, i.description, i.created_at, i.created_by,
             u.name AS createdByName
      FROM instructions i
      LEFT JOIN users u ON i.created_by = u.id
      ORDER BY i.created_at DESC, i.id DESC
    `)
    .all();

  const submissions = db
    .prepare(`
      SELECT s.*, u.name AS submittedByName
      FROM instruction_submissions s
      LEFT JOIN users u ON s.submitted_by = u.id
      ORDER BY s.submitted_at DESC
    `)
    .all();

  const mapped = instructions.map((i) => {
    const subs = submissions
      .filter((s) => s.instruction_id === i.id)
      .map(mapSubmission);
    const mine = subs.find((s) => s.submittedBy === userId);

    return {
      id: i.id,
      title: i.title,
      description: i.description,
      createdAt: i.created_at,
      createdByName: i.createdByName || "",
      mySubmitted: !!mine,
      mySubmission: mine || null,
      submissions: isAdmin ? subs : [],
    };
  });

  const pendingCount = isAdmin ? 0 : pendingCountForUser(userId);

  res.json({ instructions: mapped, pendingCount });
});

app.post("/api/instructions", authRequired, superAdminOnly, (req, res) => {
  const { title, description } = req.body || {};
  const titleStr = String(title || "").trim();
  const descStr = String(description || "").trim();

  if (!titleStr) return res.status(400).json({ error: "title is required" });
  if (!descStr) return res.status(400).json({ error: "description is required" });

  const out = db
    .prepare(
      `INSERT INTO instructions (title, description, created_by) VALUES (?,?,?)`
    )
    .run(titleStr, descStr, req.user.id);

  logAction(req.user.id, "instructions", "ADD", out.lastInsertRowid);
  res.json({ ok: true, id: out.lastInsertRowid });
});

app.delete("/api/instructions/:id", authRequired, superAdminOnly, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM instructions WHERE id=?`).run(id);
  logAction(req.user.id, "instructions", "DELETE", id);
  res.json({ ok: true });
});

app.get("/api/instructions/:id/submissions", authRequired, superAdminOnly, (req, res) => {
  const rows = db
    .prepare(`
      SELECT s.*, u.name AS submittedByName
      FROM instruction_submissions s
      LEFT JOIN users u ON s.submitted_by = u.id
      WHERE s.instruction_id = ?
      ORDER BY s.submitted_at DESC
    `)
    .all(Number(req.params.id));

  res.json(rows.map(mapSubmission));
});

app.post("/api/instructions/:id/submit", authRequired, (req, res) => {
  if (req.user.role === "super_admin") {
    return res.status(403).json({ error: "Chairman cannot submit instructions" });
  }

  const instructionId = Number(req.params.id);
  const instruction = db
    .prepare(`SELECT id FROM instructions WHERE id=?`)
    .get(instructionId);

  if (!instruction) {
    return res.status(404).json({ error: "Instruction not found" });
  }

  const existing = db
    .prepare(
      `SELECT id FROM instruction_submissions WHERE instruction_id=? AND submitted_by=?`
    )
    .get(instructionId, req.user.id);

  if (existing) {
    return res.status(409).json({ error: "Already marked as done" });
  }

  const { note, fileName, fileData } = req.body || {};
  const dataStr = String(fileData || "").trim();

  if (dataStr && dataStr.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: "File is too large (max ~6MB)" });
  }

  const out = db
    .prepare(`
      INSERT INTO instruction_submissions (instruction_id, submitted_by, note, file_name, file_data)
      VALUES (?,?,?,?,?)
    `)
    .run(
      instructionId,
      req.user.id,
      String(note || "").trim(),
      fileName ? String(fileName).trim() : null,
      dataStr || null
    );

  logAction(req.user.id, "instruction_submissions", "ADD", out.lastInsertRowid);
  res.json({ ok: true, id: out.lastInsertRowid });
});

// DASHBOARD

app.get("/api/dashboard/stats", authRequired, (req, res) => {
  const ledgers = ["general_ledger", "unofficial_ledger", "association_ledger", "departmental_ledger"];
  let totalDeposits = 0;
  let totalCosts = 0;

  ledgers.forEach(tbl => {
    const d = db.prepare(`SELECT SUM(deposit) as sum FROM ${tbl}`).get();
    const c = db.prepare(`SELECT SUM(cost) as sum FROM ${tbl}`).get();
    totalDeposits += d?.sum || 0;
    totalCosts += c?.sum || 0;
  });

  const pendingInstructionsCount = pendingCountForUser(req.user.id);

  // Bar chart data (current year)
  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(0, i).toLocaleString("default", { month: "short" }),
    income: 0,
    expense: 0,
  }));

  ledgers.forEach(tbl => {
    const rows = db.prepare(`SELECT deposit, cost, date FROM ${tbl} WHERE date LIKE ?`).all(`${currentYear}-%`);
    rows.forEach(r => {
      const m = parseInt(r.date.split("-")[1], 10) - 1;
      if (m >= 0 && m < 12) {
        months[m].income += r.deposit || 0;
        months[m].expense += r.cost || 0;
      }
    });
  });

  // Recent Transactions
  let recent = [];
  ledgers.forEach(tbl => {
    const type = tbl.split("_")[0];
    const rows = db.prepare(`
      SELECT l.*, u.name as addedByName
      FROM ${tbl} l
      LEFT JOIN users u ON l.created_by = u.id
      ORDER BY l.date DESC, l.id DESC LIMIT 10
    `).all();
    rows.forEach(r => {
      recent.push({
        id: r.id,
        date: r.date,
        type: type.charAt(0).toUpperCase() + type.slice(1),
        description: r.description,
        amount: r.deposit ? r.deposit : -r.cost,
        addedBy: r.addedByName || "Unknown"
      });
    });
  });
  recent.sort((a, b) => new Date(b.date) - new Date(a.date));
  recent = recent.slice(0, 10);

  // Pending Approvals (for super_admin)
  let pendingApprovals = 0;
  if (req.user.role === "super_admin") {
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE approved=0").get();
    pendingApprovals = row?.count || 0;
  }

  // Pending Instructions Card data
  const pendingInstructionsList = db.prepare(`
    SELECT i.id, i.title, i.created_at
    FROM instructions i
    WHERE NOT EXISTS (
      SELECT 1 FROM instruction_submissions s
      WHERE s.instruction_id = i.id AND s.submitted_by = ?
    )
    LIMIT 5
  `).all(req.user.id);

  res.json({
    kpis: {
      totalDeposits,
      totalCosts,
      netBalance: totalDeposits - totalCosts,
      pendingInstructionsCount,
    },
    chartData: months,
    recentTransactions: recent,
    pendingApprovals,
    pendingInstructions: pendingInstructionsList,
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`🚀 API running at http://localhost:${port}`);
});