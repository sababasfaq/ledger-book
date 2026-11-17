import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackupService } from "./backups.js";
import { financeRouter } from "./finance-routes.js";
import { LocalOcr, LocalModel } from "./local-ai-runtime.js";
import { AiService } from "./ai-service.js";
import { createAiRouter } from "./ai-routes.js";
import { FinanceService, HttpError, dateValue, writeAudit } from "./finance.js";
import { db } from "./db.js";
import { authRequired, superAdminOnly } from "./middleware.js";
import { createToken, hashPassword, verifyPassword } from "./auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

const finance = new FinanceService(db);
const ocr = new LocalOcr();
const model = new LocalModel();
app.locals.ai = new AiService({ db, finance, ocr, model });
app.use(
  "/api/ai",
  createAiRouter(() => app.locals.ai, authRequired),
);
const backups = new BackupService(
  db,
  process.env.BACKUP_DIR ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), "backups"),
);

function logAction(
  userId,
  tableName,
  action,
  rowId,
  before = null,
  after = null,
  reason = "",
) {
  const actor = db
    .prepare("SELECT id,name,role FROM users WHERE id=?")
    .get(userId);
  if (
    !before &&
    !after &&
    action === "ADD" &&
    ["tax_return_challans", "instructions", "instruction_submissions"].includes(
      tableName,
    )
  ) {
    after = db.prepare("SELECT * FROM " + tableName + " WHERE id=?").get(rowId);
  }
  writeAudit(db, actor, tableName, action, rowId, before, after, reason);
}

const admin = db.prepare("SELECT * FROM users WHERE role='super_admin'").get();
if (!admin) {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error(
      "Set ADMIN_PASSWORD to at least 12 characters before creating the first Chairman account.",
    );
  }
  const hash = await hashPassword(process.env.ADMIN_PASSWORD);
  db.prepare(
    "INSERT INTO users(name,email,info,role,approved,password_hash,require_2fa) VALUES('Chairman','chairman@example.com','Super Admin','super_admin',1,?,0)",
  ).run(hash);
  console.log("Created Chairman account: chairman@example.com");
}

// AUTH

app.post("/api/signup", async (req, res) => {
  const { name, email, password, pictureUrl, info } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }

  const exists = db.prepare(`SELECT 1 FROM users WHERE email=?`).get(email);
  if (exists) return res.status(409).json({ error: "Email already exists" });

  const password_hash = await hashPassword(password);
  db.prepare(
    `
    INSERT INTO users (name,email,picture_url,info,role,approved,password_hash,require_2fa)
    VALUES (?,?,?,?, 'official', 0, ?, 0)
  `,
  ).run(name, email, pictureUrl || "", info || "", password_hash);

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

  const updated = db.transaction(() => {
    db.prepare(
      `UPDATE users SET name=?, picture_url=?, info=?, designation=?, department=?, phone=? WHERE id=?`,
    ).run(
      String(name).trim(),
      String(pictureUrl || "").trim(),
      String(info || ""),
      String(designation || ""),
      String(department || ""),
      String(phone || ""),
      req.user.id,
    );

    const updated = db
      .prepare(`SELECT * FROM users WHERE id=?`)
      .get(req.user.id);
    logAction(
      req.user.id,
      "users",
      "EDIT",
      req.user.id,
      current,
      updated,
      "Profile updated",
    );
    return updated;
  })();

  res.json({ ok: true, user: userDto(updated) });
});

app.post("/api/me/change-password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  const okPass = await verifyPassword(currentPassword, user.password_hash);
  if (!okPass)
    return res.status(401).json({ error: "Incorrect current password" });

  const hash = await hashPassword(newPassword);
  db.transaction(() => {
    db.prepare(
      `UPDATE users SET password_hash=?,token_version=token_version+1 WHERE id=?`,
    ).run(hash, req.user.id);
    logAction(req.user.id, "users", "PASSWORD_CHANGE", req.user.id, null, {
      sessionsRevoked: true,
    });
  })();

  res.json({ ok: true });
});

// ADMIN

app.get(
  "/api/admin/users/pending",
  authRequired,
  superAdminOnly,
  (_req, res) => {
    const list = db
      .prepare(
        `SELECT id,name,email,info,picture_url FROM users WHERE approved=0`,
      )
      .all();
    res.json(list);
  },
);

app.get("/api/admin/users", authRequired, superAdminOnly, (_req, res) => {
  const list = db
    .prepare(
      `SELECT id,name,email,role,approved,picture_url,info FROM users WHERE approved=1`,
    )
    .all();
  res.json(list);
});

app.post(
  "/api/admin/users/:id/approve",
  authRequired,
  superAdminOnly,
  (req, res) => {
    db.transaction(() => {
      const before = db
        .prepare("SELECT id,name,email,role,approved FROM users WHERE id=?")
        .get(Number(req.params.id));
      if (!before) throw new HttpError(404, "User not found");
      db.prepare("UPDATE users SET approved=1 WHERE id=?").run(before.id);
      logAction(req.user.id, "users", "APPROVE", before.id, before, {
        ...before,
        approved: 1,
      });
    })();
    res.json({ ok: true });
  },
);

app.delete("/api/admin/users/:id", authRequired, superAdminOnly, (req, res) => {
  db.transaction(() => {
    const before = db
      .prepare("SELECT id,name,email,role,approved FROM users WHERE id=?")
      .get(Number(req.params.id));
    if (!before) throw new HttpError(404, "User not found");
    if (before.role === "super_admin")
      throw new HttpError(409, "Chairman accounts cannot be deleted");
    db.prepare("DELETE FROM users WHERE id=?").run(before.id);
    logAction(req.user.id, "users", "DELETE", before.id, before, null);
  })();
  res.json({ ok: true });
});

// Finance routes share the same authentication and role checks as the existing app.
app.use("/api", financeRouter(db, authRequired, superAdminOnly, backups));

// TAX TYPES

app.get("/api/taxes", authRequired, (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name, percentage FROM tax_types ORDER BY name ASC`)
    .all();
  res.json(rows);
});

app.post("/api/taxes", authRequired, superAdminOnly, (req, res) => {
  const { name, percentage } = req.body || {};
  if (
    !String(name || "").trim() ||
    !Number.isFinite(Number(percentage)) ||
    percentage === "" ||
    percentage == null ||
    Number(percentage) < 0 ||
    Number(percentage) > 100
  )
    return res
      .status(400)
      .json({ error: "Provide a tax name and a percentage from 0 to 100" });
  const id = db.transaction(() => {
    const out = db
      .prepare("INSERT INTO tax_types(name,percentage) VALUES(?,?)")
      .run(String(name).trim(), Number(percentage));
    logAction(
      req.user.id,
      "tax_types",
      "ADD",
      Number(out.lastInsertRowid),
      null,
      { name, percentage: Number(percentage) },
    );
    return Number(out.lastInsertRowid);
  })();
  res.status(201).json({ ok: true, id });
});

app.patch("/api/taxes/:id", authRequired, superAdminOnly, (req, res) => {
  const { name, percentage } = req.body || {};
  if (
    !String(name || "").trim() ||
    !Number.isFinite(Number(percentage)) ||
    percentage === "" ||
    percentage == null ||
    Number(percentage) < 0 ||
    Number(percentage) > 100
  )
    return res
      .status(400)
      .json({ error: "Provide a tax name and a percentage from 0 to 100" });
  db.transaction(() => {
    const before = db
      .prepare("SELECT * FROM tax_types WHERE id=?")
      .get(Number(req.params.id));
    if (!before) throw new HttpError(404, "Tax type not found");
    db.prepare("UPDATE tax_types SET name=?,percentage=? WHERE id=?").run(
      String(name).trim(),
      Number(percentage),
      before.id,
    );
    logAction(req.user.id, "tax_types", "EDIT", before.id, before, {
      ...before,
      name: String(name).trim(),
      percentage: Number(percentage),
    });
  })();
  res.json({ ok: true });
});

app.delete("/api/taxes/:id", authRequired, superAdminOnly, (req, res) => {
  db.transaction(() => {
    const id = Number(req.params.id),
      before = db.prepare("SELECT * FROM tax_types WHERE id=?").get(id);
    if (!before) throw new HttpError(404, "Tax type not found");
    for (const table of [
      "general_ledger",
      "unofficial_ledger",
      "association_ledger",
      "departmental_ledger",
    ]) {
      if (
        db
          .prepare("SELECT 1 FROM " + table + " WHERE tax_type_id=? LIMIT 1")
          .get(id)
      )
        throw new HttpError(
          409,
          "This tax type is used by historical transactions and cannot be deleted",
        );
    }
    db.prepare("DELETE FROM tax_types WHERE id=?").run(id);
    logAction(req.user.id, "tax_types", "DELETE", id, before, null);
  })();
  res.json({ ok: true });
});

// TAX RETURN CHALLAN

app.get("/api/tax-return-challan", authRequired, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM tax_return_challans
      ORDER BY created_at DESC, id DESC
    `,
    )
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
    return res
      .status(400)
      .json({ error: "challanNo, taxType and taxPeriod are required" });
  }

  if (!bankBranch || !accountHead || amount == null || amount === "") {
    return res
      .status(400)
      .json({ error: "bankBranch, accountHead and amount are required" });
  }

  const out = db.transaction(() => {
    const out = db
      .prepare(
        `
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
      `,
      )
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
        req.user.id,
      );
    logAction(req.user.id, "tax_return_challans", "ADD", out.lastInsertRowid);
    return out;
  })();

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
    .prepare(
      `
      SELECT COUNT(*) AS count FROM instructions i
      WHERE NOT EXISTS (
        SELECT 1 FROM instruction_submissions s
        WHERE s.instruction_id = i.id AND s.submitted_by = ?
      )
    `,
    )
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
    .prepare(
      `
      SELECT i.id, i.title, i.description, i.created_at, i.created_by, i.due_date,
             u.name AS createdByName
      FROM instructions i
      LEFT JOIN users u ON i.created_by = u.id
      ORDER BY i.created_at DESC, i.id DESC
    `,
    )
    .all();

  const submissions = db
    .prepare(
      `
      SELECT s.*, u.name AS submittedByName
      FROM instruction_submissions s
      LEFT JOIN users u ON s.submitted_by = u.id
      ORDER BY s.submitted_at DESC
    `,
    )
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
      dueDate: i.due_date || "",
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
  if (!descStr)
    return res.status(400).json({ error: "description is required" });
  const dueDate = req.body.dueDate ? dateValue(req.body.dueDate) : null;

  const out = db.transaction(() => {
    const out = db
      .prepare(
        `INSERT INTO instructions (title, description, created_by, due_date) VALUES (?,?,?,?)`,
      )
      .run(titleStr, descStr, req.user.id, dueDate);
    logAction(req.user.id, "instructions", "ADD", out.lastInsertRowid);
    return out;
  })();
  res.json({ ok: true, id: out.lastInsertRowid });
});

app.patch("/api/instructions/:id/due-date", authRequired, superAdminOnly, (req, res) => {
  db.transaction(() => {
    const before = db.prepare("SELECT * FROM instructions WHERE id=?").get(Number(req.params.id));
    if (!before) throw new HttpError(404, "Instruction not found");
    const dueDate = req.body.dueDate ? dateValue(req.body.dueDate) : null;
    db.prepare("UPDATE instructions SET due_date=? WHERE id=?").run(dueDate, before.id);
    logAction(req.user.id, "instructions", "EDIT_DUE_DATE", before.id, before, { ...before, due_date: dueDate }, "Instruction deadline updated");
  })();
  res.json({ ok: true });
});

app.delete(
  "/api/instructions/:id",
  authRequired,
  superAdminOnly,
  (req, res) => {
    const id = Number(req.params.id);
    db.transaction(() => {
      const before = db
        .prepare("SELECT * FROM instructions WHERE id=?")
        .get(id);
      if (!before) throw new HttpError(404, "Instruction not found");
      db.prepare("DELETE FROM instructions WHERE id=?").run(id);
      logAction(
        req.user.id,
        "instructions",
        "DELETE",
        id,
        before,
        null,
        "Instruction removed",
      );
    })();
    res.json({ ok: true });
  },
);

app.get(
  "/api/instructions/:id/submissions",
  authRequired,
  superAdminOnly,
  (req, res) => {
    const rows = db
      .prepare(
        `
      SELECT s.*, u.name AS submittedByName
      FROM instruction_submissions s
      LEFT JOIN users u ON s.submitted_by = u.id
      WHERE s.instruction_id = ?
      ORDER BY s.submitted_at DESC
    `,
      )
      .all(Number(req.params.id));

    res.json(rows.map(mapSubmission));
  },
);

app.post("/api/instructions/:id/submit", authRequired, (req, res) => {
  if (req.user.role === "super_admin") {
    return res
      .status(403)
      .json({ error: "Chairman cannot submit instructions" });
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
      `SELECT id FROM instruction_submissions WHERE instruction_id=? AND submitted_by=?`,
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

  const out = db.transaction(() => {
    const out = db
      .prepare(
        `
        INSERT INTO instruction_submissions (instruction_id, submitted_by, note, file_name, file_data)
        VALUES (?,?,?,?,?)
      `,
      )
      .run(
        instructionId,
        req.user.id,
        String(note || "").trim(),
        fileName ? String(fileName).trim() : null,
        dataStr || null,
      );
    logAction(
      req.user.id,
      "instruction_submissions",
      "ADD",
      out.lastInsertRowid,
    );
    return out;
  })();
  res.json({ ok: true, id: out.lastInsertRowid });
});

// DASHBOARD

app.get("/api/dashboard/stats", authRequired, (req, res) => {
  const ledgers = [
    "general_ledger",
    "unofficial_ledger",
    "association_ledger",
    "departmental_ledger",
  ];
  let totalDeposits = 0;
  let totalCosts = 0;
  const openingBalance =
    db
      .prepare(
        "SELECT COALESCE(SUM(amount_minor),0) AS total FROM ledger_openings",
      )
      .get().total / 100;

  ledgers.forEach((tbl) => {
    const d = db
      .prepare(`SELECT SUM(deposit_minor)/100.0 as sum FROM ${tbl}`)
      .get();
    const c = db
      .prepare(`SELECT SUM(cost_minor)/100.0 as sum FROM ${tbl}`)
      .get();
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

  ledgers.forEach((tbl) => {
    const rows = db
      .prepare(`SELECT deposit, cost, date FROM ${tbl} WHERE date LIKE ?`)
      .all(`${currentYear}-%`);
    rows.forEach((r) => {
      const m = parseInt(r.date.split("-")[1], 10) - 1;
      if (m >= 0 && m < 12) {
        months[m].income += r.deposit || 0;
        months[m].expense += r.cost || 0;
      }
    });
  });

  // Recent Transactions
  let recent = [];
  ledgers.forEach((tbl) => {
    const type = tbl.split("_")[0];
    const rows = db
      .prepare(
        `
      SELECT l.*, u.name as addedByName
      FROM ${tbl} l
      LEFT JOIN users u ON l.created_by = u.id
      ORDER BY l.date DESC, l.id DESC LIMIT 10
    `,
      )
      .all();
    rows.forEach((r) => {
      recent.push({
        id: r.id,
        date: r.date,
        type: type.charAt(0).toUpperCase() + type.slice(1),
        description: r.description,
        amount: r.deposit ? r.deposit : -r.cost,
        addedBy: r.addedByName || "Unknown",
      });
    });
  });
  recent.sort((a, b) => new Date(b.date) - new Date(a.date));
  recent = recent.slice(0, 10);

  // Pending Approvals (for super_admin)
  let pendingApprovals = 0;
  if (req.user.role === "super_admin") {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE approved=0")
      .get();
    pendingApprovals = row?.count || 0;
  }

  // Pending Instructions Card data
  const pendingInstructionsList = db
    .prepare(
      `
    SELECT i.id, i.title, i.created_at
    FROM instructions i
    WHERE NOT EXISTS (
      SELECT 1 FROM instruction_submissions s
      WHERE s.instruction_id = i.id AND s.submitted_by = ?
    )
    LIMIT 5
  `,
    )
    .all(req.user.id);

  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentPeriod = db
    .prepare(
      "SELECT id,name FROM financial_periods WHERE ? BETWEEN start_date AND end_date",
    )
    .get(currentDate);
  const budgetOverview = currentPeriod
    ? {
        ...finance.budgetReport(currentPeriod.id),
        periodName: currentPeriod.name,
      }
    : null;

  res.json({
    budgetOverview,
    kpis: {
      totalDeposits,
      totalCosts,
      netBalance: openingBalance + totalDeposits - totalCosts,
      pendingInstructionsCount,
    },
    chartData: months,
    recentTransactions: recent,
    pendingApprovals,
    pendingInstructions: pendingInstructionsList,
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError)
    return res.status(error.status).json({ error: error.message });
  if (error.code?.startsWith("SQLITE_CONSTRAINT"))
    return res.status(409).json({
      error: "This item is already in use or conflicts with another record.",
    });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "The uploaded request is too large" });
  if (error instanceof SyntaxError)
    return res.status(400).json({ error: "Invalid request data" });
  console.error(error);
  res.status(500).json({ error: "The request could not be completed" });
});

if (process.env.NODE_ENV !== "test") {
  const port = process.env.PORT || 4000;
  app.listen(port, () =>
    console.log(`API running at http://localhost:${port}`),
  );
  if (process.env.DISABLE_BACKUP_SCHEDULER !== "true") backups.start();
}
export { app, db, finance, backups };
