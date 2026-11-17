import { LEDGERS } from "./finance-schema.js";
import { attachmentHash, ledgerPaths } from "./receipt-files.js";
import { createHash } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function textValue(value, label, max = 500, required = false) {
  requireValue(
    value == null || typeof value === "string",
    label + " must be text",
  );
  const text = (value || "").trim();
  requireValue(text.length <= max, label + " is too long");
  requireValue(!required || text.length > 0, label + " is required");
  return text;
}
export function dateValue(value) {
  requireValue(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use a valid date in YYYY-MM-DD format",
  );
  const d = new Date(value + "T00:00:00Z");
  requireValue(
    !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2200-12-31",
    "Invalid date",
  );
  return value;
}
export function moneyMinor(value, label = "Amount", signed = false) {
  if (value == null || value === "") return 0;
  requireValue(
    typeof value === "number" || typeof value === "string",
    label + " must be a number",
  );
  const raw = String(value).trim();
  requireValue(
    (signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(raw),
    label +
      " must have at most two decimal places" +
      (signed ? "" : " and cannot be negative"),
  );
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  const minor =
    (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
    (raw.startsWith("-") ? -1 : 1);
  requireValue(
    Number.isSafeInteger(minor) && Math.abs(minor) <= 100_000_000_000,
    label + " is too large",
  );
  return minor;
}
export function positiveId(value, label = "ID") {
  const id = Number(value);
  requireValue(Number.isSafeInteger(id) && id > 0, "Invalid " + label);
  return id;
}
function snapshot(value) {
  if (value == null) return null;
  return JSON.stringify(value, (key, val) => {
    if (/password|token|file_data|fileData|picture_url|pictureUrl/i.test(key))
      return undefined;
    return val;
  });
}
export function writeAudit(
  db,
  actor,
  table,
  action,
  rowId,
  before = null,
  after = null,
  reason = "",
) {
  db.prepare(
    "INSERT INTO audit_events(user_id,user_name,role,table_name,action,row_id,before_data,after_data,reason) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    actor?.id || null,
    actor?.name || actor?.user_name || "System",
    actor?.role || "system",
    table,
    action,
    rowId || null,
    snapshot(before),
    snapshot(after),
    reason || null,
  );
}

export class FinanceService {
  constructor(db) {
    this.db = db;
  }
  table(type) {
    requireValue(Object.hasOwn(LEDGERS, type), "Invalid ledger type");
    return LEDGERS[type];
  }
  categories() {
    return this.db
      .prepare("SELECT * FROM expense_categories ORDER BY name COLLATE NOCASE")
      .all();
  }
  periods() {
    return this.db
      .prepare(
        "SELECT id,name,start_date,end_date,status,closed_at FROM financial_periods ORDER BY start_date DESC",
      )
      .all();
  }
  period(id) {
    const row = this.db
      .prepare("SELECT * FROM financial_periods WHERE id=?")
      .get(positiveId(id, "period"));
    requireValue(row, "Financial period not found", 404);
    return row;
  }
  openPeriodFor(date) {
    const row = this.db
      .prepare(
        "SELECT * FROM financial_periods WHERE ? BETWEEN start_date AND end_date",
      )
      .get(dateValue(date));
    requireValue(
      row,
      "No financial period covers this date. Ask the Chairman to create one.",
      409,
    );
    requireValue(
      row.status === "open",
      "This financial period is closed. Post a correction in an open period.",
      409,
    );
    return row;
  }
  assertOpen(period) {
    requireValue(
      period.status === "open",
      "The financial period is closed",
      409,
    );
  }
  firstPeriod() {
    return this.db
      .prepare("SELECT * FROM financial_periods ORDER BY start_date LIMIT 1")
      .get();
  }
  opening(type, beforeDate = null) {
    const table = this.table(type);
    const base =
      this.db
        .prepare("SELECT amount_minor FROM ledger_openings WHERE ledger_type=?")
        .get(type)?.amount_minor || 0;
    if (!beforeDate) return base;
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(deposit_minor-cost_minor),0) AS movement FROM " +
          table +
          " WHERE date < ?",
      )
      .get(beforeDate);
    return base + row.movement;
  }
  summary(id) {
    const period = this.period(id);
    const ledgers = Object.entries(LEDGERS).map(([type, table]) => {
      const values = this.db
        .prepare(
          "SELECT COALESCE(SUM(deposit_minor),0) AS deposits, COALESCE(SUM(cost_minor),0) AS costs, COUNT(*) AS entryCount FROM " +
            table +
            " WHERE date BETWEEN ? AND ?",
        )
        .get(period.start_date, period.end_date);
      const openingMinor = this.opening(type, period.start_date);
      return {
        type,
        opening: openingMinor / 100,
        deposits: values.deposits / 100,
        costs: values.costs / 100,
        closing: (openingMinor + values.deposits - values.costs) / 100,
        entryCount: values.entryCount,
      };
    });
    return {
      period: {
        id: period.id,
        name: period.name,
        start_date: period.start_date,
        end_date: period.end_date,
        status: period.status,
        closed_at: period.closed_at,
      },
      canEditOpening:
        period.id === this.firstPeriod()?.id && period.status === "open",
      ledgers,
      totalOpening:
        ledgers.reduce((s, r) => s + Math.round(r.opening * 100), 0) / 100,
      totalDeposits:
        ledgers.reduce((s, r) => s + Math.round(r.deposits * 100), 0) / 100,
      totalCosts:
        ledgers.reduce((s, r) => s + Math.round(r.costs * 100), 0) / 100,
      totalClosing:
        ledgers.reduce((s, r) => s + Math.round(r.closing * 100), 0) / 100,
    };
  }
  saveCategory(actor, body, id = null) {
    return this.db.transaction(() => {
      const name = textValue(body.name, "Category name", 80, true);
      const before = id
        ? this.db
            .prepare("SELECT * FROM expense_categories WHERE id=?")
            .get(positiveId(id))
        : null;
      if (id) requireValue(before, "Category not found", 404);
      requireValue(
        !this.db
          .prepare(
            "SELECT id FROM expense_categories WHERE name=? COLLATE NOCASE AND id<>?",
          )
          .get(name, id || 0),
        "A category with this name already exists",
        409,
      );
      requireValue(
        body.active === undefined || typeof body.active === "boolean",
        "Active must be true or false",
      );
      if (id)
        this.db
          .prepare("UPDATE expense_categories SET name=?,active=? WHERE id=?")
          .run(
            name,
            body.active === undefined ? before.active : Number(body.active),
            id,
          );
      else
        id = Number(
          this.db
            .prepare("INSERT INTO expense_categories(name) VALUES(?)")
            .run(name).lastInsertRowid,
        );
      const after = this.db
        .prepare("SELECT * FROM expense_categories WHERE id=?")
        .get(id);
      writeAudit(
        this.db,
        actor,
        "expense_categories",
        before ? "EDIT" : "ADD",
        id,
        before,
        after,
        textValue(body.reason, "Reason", 1000),
      );
      return after;
    })();
  }
  savePeriod(actor, body, id = null) {
    return this.db.transaction(() => {
      const name = textValue(body.name, "Period name", 80, true);
      const start = dateValue(body.startDate),
        end = dateValue(body.endDate);
      requireValue(start <= end, "The end date must follow the start date");
      const before = id ? this.period(id) : null;
      if (before) this.assertOpen(before);
      const lastClosed = this.db
        .prepare(
          "SELECT MAX(end_date) AS end FROM financial_periods WHERE status='closed'",
        )
        .get().end;
      requireValue(
        !lastClosed || start > lastClosed,
        "New or edited periods must follow the latest closed period to protect its opening balances",
        409,
      );
      requireValue(
        !this.db
          .prepare(
            "SELECT id FROM financial_periods WHERE id<>? AND (name=? OR NOT(end_date < ? OR start_date > ?))",
          )
          .get(id || 0, name, start, end),
        "Period names must be unique and date ranges cannot overlap",
        409,
      );
      const first = this.firstPeriod();
      if (!before && first && start < first.start_date) {
        requireValue(
          !this.db
            .prepare("SELECT 1 FROM ledger_openings WHERE amount_minor<>0")
            .get() &&
            !this.db
              .prepare("SELECT 1 FROM financial_periods WHERE status='closed'")
              .get(),
          "Cannot insert an earlier period after opening balances or closed periods exist",
          409,
        );
      }
      if (before) {
        for (const table of Object.values(LEDGERS)) {
          requireValue(
            !this.db
              .prepare(
                "SELECT 1 FROM " +
                  table +
                  " WHERE financial_period_id=? AND (date < ? OR date > ?) LIMIT 1",
              )
              .get(id, start, end),
            "The new dates would exclude existing transactions",
            409,
          );
        }
        this.db
          .prepare(
            "UPDATE financial_periods SET name=?,start_date=?,end_date=? WHERE id=?",
          )
          .run(name, start, end, id);
      } else
        id = Number(
          this.db
            .prepare(
              "INSERT INTO financial_periods(name,start_date,end_date) VALUES(?,?,?)",
            )
            .run(name, start, end).lastInsertRowid,
        );
      const after = this.period(id);
      // Legacy rows previously outside a managed year become part of the new year.
      for (const table of Object.values(LEDGERS)) {
        this.db
          .prepare(
            "UPDATE " +
              table +
              " SET financial_period_id=? WHERE financial_period_id IS NULL AND date BETWEEN ? AND ?",
          )
          .run(id, start, end);
      }
      writeAudit(
        this.db,
        actor,
        "financial_periods",
        before ? "EDIT" : "ADD",
        id,
        before,
        after,
        textValue(body.reason, "Reason", 1000),
      );
      return after;
    })();
  }
  setOpenings(actor, id, body) {
    return this.db.transaction(() => {
      const period = this.period(id);
      this.assertOpen(period);
      requireValue(
        period.id === this.firstPeriod()?.id,
        "Later periods carry forward earlier balances automatically",
        409,
      );
      requireValue(
        body.balances && typeof body.balances === "object",
        "Opening balances are required",
      );
      const reason = textValue(body.reason, "Reason", 1000, true);
      const before = this.summary(id);
      for (const type of Object.keys(LEDGERS)) {
        requireValue(
          Object.hasOwn(body.balances, type),
          "Provide an opening balance for each ledger",
        );
        this.db
          .prepare(
            "UPDATE ledger_openings SET amount_minor=? WHERE ledger_type=?",
          )
          .run(moneyMinor(body.balances[type], type + " opening", true), type);
      }
      const after = this.summary(id);
      writeAudit(
        this.db,
        actor,
        "ledger_openings",
        "EDIT",
        period.id,
        before,
        after,
        reason,
      );
      return after;
    })();
  }
  closePeriod(actor, id, reason) {
    return this.db.transaction(() => {
      const period = this.period(id);
      this.assertOpen(period);
      requireValue(
        !this.db
          .prepare(
            "SELECT 1 FROM financial_periods WHERE start_date < ? AND status='open'",
          )
          .get(period.start_date),
        "Close earlier financial periods first",
        409,
      );
      const report = { ...this.summary(id), budgets: this.budgetReport(id) },
        closedAt = new Date().toISOString();
      report.period = {
        ...report.period,
        status: "closed",
        closed_at: closedAt,
      };
      this.db
        .prepare(
          "UPDATE financial_periods SET status='closed',closed_at=?,closed_by=?,closing_summary=? WHERE id=?",
        )
        .run(closedAt, actor.id, JSON.stringify(report), id);
      writeAudit(
        this.db,
        actor,
        "financial_periods",
        "CLOSE",
        Number(id),
        period,
        this.period(id),
        textValue(reason, "Closing reason", 1000, true),
      );
      return this.summary(id);
    })();
  }
  budgetReport(id) {
    const period = this.period(id);
    const spend = new Map();
    for (const table of Object.values(LEDGERS)) {
      const rows = this.db
        .prepare(
          "SELECT category_id, SUM(CASE WHEN reversal_of IS NOT NULL THEN -deposit_minor ELSE cost_minor END) AS spent FROM " +
            table +
            " WHERE date BETWEEN ? AND ? GROUP BY category_id",
        )
        .all(period.start_date, period.end_date);
      for (const row of rows)
        spend.set(
          row.category_id,
          (spend.get(row.category_id) || 0) + row.spent,
        );
    }
    const allocations = this.db
      .prepare("SELECT * FROM category_budgets WHERE period_id=?")
      .all(period.id);
    const rows = this.categories().map((category) => {
      const allocation = allocations.find((b) => b.category_id === category.id);
      const allocated = allocation?.amount_minor || 0,
        spent = spend.get(category.id) || 0;
      const utilization = allocated
        ? Math.round((spent / allocated) * 1000) / 10
        : null;
      return {
        ...category,
        budgetId: allocation?.id || null,
        allocated: allocated / 100,
        spent: spent / 100,
        remaining: (allocated - spent) / 100,
        alertPercent: allocation?.alert_percent || 80,
        utilization,
        status:
          allocated === 0
            ? spent > 0
              ? "unbudgeted"
              : "no-budget"
            : spent > allocated
              ? "over-budget"
              : utilization >= (allocation?.alert_percent || 80)
                ? "warning"
                : "on-track",
      };
    });
    return {
      periodId: period.id,
      categories: rows,
      totalAllocated: allocations.reduce((s, r) => s + r.amount_minor, 0) / 100,
      totalSpent: [...spend.values()].reduce((s, r) => s + r, 0) / 100,
      uncategorizedSpent: (spend.get(null) || 0) / 100,
    };
  }
  saveBudget(actor, body) {
    return this.db.transaction(() => {
      const period = this.period(body.periodId);
      this.assertOpen(period);
      const category = this.db
        .prepare("SELECT * FROM expense_categories WHERE id=?")
        .get(positiveId(body.categoryId));
      requireValue(category, "Category not found", 404);
      requireValue(category.active, "Choose an active category");
      requireValue(
        body.amount != null && body.amount !== "",
        "A budget amount is required",
      );
      const amount = moneyMinor(body.amount, "Budget");
      const threshold = Number(body.alertPercent ?? 80);
      requireValue(
        Number.isInteger(threshold) && threshold >= 1 && threshold <= 100,
        "Alert percentage must be from 1 to 100",
      );
      const reason = textValue(body.reason, "Reason", 1000, true);
      const before = this.db
        .prepare(
          "SELECT * FROM category_budgets WHERE period_id=? AND category_id=?",
        )
        .get(period.id, category.id);
      this.db
        .prepare(
          "INSERT INTO category_budgets(period_id,category_id,amount_minor,alert_percent) VALUES(?,?,?,?) ON CONFLICT(period_id,category_id) DO UPDATE SET amount_minor=excluded.amount_minor,alert_percent=excluded.alert_percent",
        )
        .run(period.id, category.id, amount, threshold);
      const after = this.db
        .prepare(
          "SELECT * FROM category_budgets WHERE period_id=? AND category_id=?",
        )
        .get(period.id, category.id);
      writeAudit(
        this.db,
        actor,
        "category_budgets",
        before ? "EDIT" : "ADD",
        after.id,
        before,
        after,
        reason,
      );
      return after;
    })();
  }
  listLedger(type) {
    const table = this.table(type);
    return this.db
      .prepare(
        `
      SELECT l.*,u.name AS addedByName,u.role AS addedByRole,
        c.name AS categoryName,c.active AS categoryActive,p.name AS periodName,p.status AS periodStatus,
        t.name AS liveTaxName,t.percentage AS liveTaxRate,
        (SELECT r.id FROM ${table} r WHERE r.reversal_of=l.id) AS reversedBy
      FROM ${table} l LEFT JOIN users u ON l.created_by=u.id
      LEFT JOIN expense_categories c ON c.id=l.category_id
      LEFT JOIN financial_periods p ON p.id=l.financial_period_id
      LEFT JOIN tax_types t ON t.id=l.tax_type_id
      ORDER BY l.date,l.id
    `,
      )
      .all()
      .map((row) => ({
        ...row,
        deposit: row.deposit_minor ? row.deposit_minor / 100 : null,
        cost: row.cost_minor ? row.cost_minor / 100 : null,
        categoryId: row.category_id,
        periodId: row.financial_period_id,
        entryKind: row.entry_kind,
        reversalOf: row.reversal_of,
        taxTypeId: row.tax_type_id,
        taxTypeName: row.tax_name_snapshot ?? row.liveTaxName,
        taxPercentage: row.tax_rate_snapshot ?? row.liveTaxRate,
        voucherFileName: row.voucher_file_name,
        voucherFileData: row.voucher_file_data,
      }));
  }
  normalizeEntry(body, importing = false) {
    const date = dateValue(body.date),
      period = this.openPeriodFor(date);
    const voucherNo = textValue(body.voucherNo, "Voucher number", 120, true);
    const depositMinor = moneyMinor(body.deposit, "Deposit"),
      costMinor = moneyMinor(body.cost, "Cost");
    requireValue(
      depositMinor > 0 || costMinor > 0,
      "Provide a positive deposit or cost",
    );
    let categoryId = body.categoryId
      ? positiveId(body.categoryId, "category")
      : null;
    if (importing && body.category) {
      const category = this.db
        .prepare(
          "SELECT * FROM expense_categories WHERE name=? COLLATE NOCASE AND active=1",
        )
        .get(textValue(body.category, "Category", 80));
      requireValue(category, "Unknown or archived category: " + body.category);
      categoryId = category.id;
    }
    if (categoryId)
      requireValue(
        this.db
          .prepare("SELECT 1 FROM expense_categories WHERE id=? AND active=1")
          .get(categoryId),
        "Choose an active category",
      );
    requireValue(
      costMinor === 0 || categoryId,
      "Choose an expense category for costs",
    );
    let taxTypeId = body.taxTypeId
      ? positiveId(body.taxTypeId, "tax type")
      : null;
    if (importing && body.taxType) {
      const tax = this.db
        .prepare("SELECT * FROM tax_types WHERE name=? COLLATE NOCASE")
        .get(textValue(body.taxType, "Tax type", 80));
      requireValue(tax, "Unknown tax type: " + body.taxType);
      taxTypeId = tax.id;
    }
    const tax = taxTypeId
      ? this.db.prepare("SELECT * FROM tax_types WHERE id=?").get(taxTypeId)
      : null;
    requireValue(!taxTypeId || tax, "Tax type not found");
    const fileName = textValue(body.voucherFileName, "Voucher file name", 255);
    const fileData = body.voucherFileData || null;
    requireValue(
      !fileData ||
        (typeof fileData === "string" &&
          fileData.length <= 3 * 1024 * 1024 &&
          /^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(
            fileData,
          )),
      "Attach a PNG, JPEG, WebP, GIF or PDF voucher up to 2 MB",
    );
    if (fileData) requireValue(Buffer.from(fileData.split(",")[1], "base64").length <= 2 * 1024 * 1024, "Voucher must be 2 MB or less");
    return {
      date,
      voucherNo,
      depositMinor,
      costMinor,
      categoryId,
      periodId: period.id,
      taxTypeId,
      taxName: tax?.name || null,
      taxRate: tax?.percentage ?? null,
      description: textValue(body.description, "Description", 2000),
      signature: textValue(body.signature, "Signature", 200),
      fileName,
      fileData,
      receiptHash: attachmentHash(fileData),
      receiptNumber: textValue(body.receiptNumber, "Receipt number", 120),
      receiptMerchant: textValue(body.receiptMerchant, "Receipt merchant", 200),
    };
  }
  insertEntry(
    actor,
    type,
    data,
    action = "ADD",
    reversalOf = null,
    reason = "",
  ) {
    const table = this.table(type);
    const next = this.db
      .prepare(
        "SELECT COALESCE(MAX(CAST(no AS INTEGER)),0)+1 AS value FROM " + table,
      )
      .get().value;
    const no = String(next).padStart(2, "0");
    const out = this.db
      .prepare(
        `
      INSERT INTO ${table}(no,date,voucher_no,deposit,cost,description,signature,created_by,tax_type_id,voucher_file_name,voucher_file_data,
        deposit_minor,cost_minor,category_id,financial_period_id,entry_kind,reversal_of,correction_reason,tax_name_snapshot,tax_rate_snapshot,receipt_hash,receipt_number,receipt_merchant,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    `,
      )
      .run(
        no,
        data.date,
        data.voucherNo,
        data.depositMinor ? data.depositMinor / 100 : null,
        data.costMinor ? data.costMinor / 100 : null,
        data.description,
        data.signature,
        actor.id,
        data.taxTypeId,
        data.fileName || null,
        data.fileData || null,
        data.depositMinor,
        data.costMinor,
        data.categoryId,
        data.periodId,
        reversalOf ? "reversal" : "posted",
        reversalOf,
        reason || null,
        data.taxName,
        data.taxRate,
        data.receiptHash || null,
        data.receiptNumber || null,
        data.receiptMerchant || null,
      );
    const after = this.db
      .prepare("SELECT * FROM " + table + " WHERE id=?")
      .get(out.lastInsertRowid);
    writeAudit(
      this.db,
      actor,
      table,
      action,
      Number(out.lastInsertRowid),
      null,
      after,
      reason,
    );
    return { ok: true, id: Number(out.lastInsertRowid), no };
  }
  addEntry(actor, type, body) {
    return this.db.transaction(() => {
      this.table(type);
      const data = this.normalizeEntry(body);
      const requestKey = textValue(body.clientRequestId, "Draft request ID", 100);
      const bodyHash = createHash("sha256").update(JSON.stringify({ ...data, fileData: undefined })).digest("hex");
      if (requestKey) {
        const previous = this.db.prepare("SELECT * FROM posting_requests WHERE user_id=? AND request_key=?").get(actor.id, requestKey);
        if (previous) {
          const href = ledgerPaths[previous.ledger_type] + "?entry=" + previous.entry_id;
          requireValue(previous.ledger_type === type && previous.body_hash === bodyHash,
            "This draft was already posted. Review the existing entry before creating a new draft: " + href, 409);
          const saved = this.db.prepare("SELECT no FROM " + this.table(type) + " WHERE id=?").get(previous.entry_id);
          requireValue(saved, "The original entry is no longer available", 409);
          return { ok: true, id: previous.entry_id, no: saved.no, replayed: true };
        }
      }
      const duplicates = this.duplicateMatches(data);
      let reason = "";
      if (duplicates.length) {
        if (body.duplicateAcknowledged !== true || typeof body.duplicateReason !== "string" || !body.duplicateReason.trim()) {
          throw new HttpError(409, "Possible duplicate entries found. Review the matches and give a reason to post anyway.", { duplicates });
        }
        reason = textValue(body.duplicateReason, "Duplicate override reason", 1000, true);
      }
      const result = this.insertEntry(actor, type, data, "ADD", null, reason);
      if (requestKey) this.db.prepare("INSERT INTO posting_requests(user_id,request_key,ledger_type,entry_id,body_hash) VALUES(?,?,?,?,?)")
        .run(actor.id, requestKey, type, result.id, bodyHash);
      if (duplicates.length) writeAudit(this.db, actor, this.table(type), "DUPLICATE_OVERRIDE", result.id, null,
        { matches: duplicates.map(({ id, ledgerType, reasons }) => ({ id, ledgerType, reasons })) }, reason);
      return result;
    })();
  }
  duplicateMatches(data, exclude = null) {
    const matches = [];
    for (const [ledgerType, table] of Object.entries(LEDGERS)) {
      const rows = this.db.prepare(`SELECT l.id,l.no,l.date,l.voucher_no,l.deposit_minor,l.cost_minor,l.receipt_hash,l.receipt_number,l.receipt_merchant
        FROM ${table} l WHERE l.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM ${table} r WHERE r.reversal_of=l.id)
        AND ((? IS NOT NULL AND l.receipt_hash=?) OR
          (l.date=? AND l.deposit_minor=? AND l.cost_minor=?) OR
          (?<>'' AND lower(trim(COALESCE(l.receipt_number,l.voucher_no)))=lower(trim(?))))`)
        .all(data.receiptHash || null, data.receiptHash || null, data.date || "", data.depositMinor || 0, data.costMinor || 0,
          data.receiptNumber || "", data.receiptNumber || "");
      for (const row of rows) {
        if (exclude?.ledgerType === ledgerType && exclude.id === row.id) continue;
        const reasons = [];
        if (data.receiptHash && row.receipt_hash === data.receiptHash) reasons.push("Identical attachment bytes");
        if (row.date === data.date && row.deposit_minor === data.depositMinor && row.cost_minor === data.costMinor &&
          (row.voucher_no || "").trim().toLowerCase() === data.voucherNo?.trim().toLowerCase()) reasons.push("Same voucher, date and amounts");
        const receipt = row.receipt_number || row.voucher_no || "";
        if (data.receiptNumber && receipt.trim().toLowerCase() === data.receiptNumber.trim().toLowerCase() &&
          (!data.receiptMerchant || !row.receipt_merchant || data.receiptMerchant.toLowerCase() === row.receipt_merchant.toLowerCase())) {
          reasons.push("Same receipt reference");
        }
        if (reasons.length) matches.push({ id: row.id, no: row.no, date: row.date, voucherNo: row.voucher_no,
          ledgerType, deposit: row.deposit_minor / 100, cost: row.cost_minor / 100, reasons,
          href: ledgerPaths[ledgerType] + "?entry=" + row.id });
      }
    }
    return matches.slice(0, 30);
  }
  attachReceipt(actor, type, id, body) {
    return this.db.transaction(() => {
      const table = this.table(type);
      const before = this.db.prepare("SELECT * FROM " + table + " WHERE id=?").get(positiveId(id));
      requireValue(before, "Entry not found", 404);
      requireValue(actor.role === "super_admin" || before.created_by === actor.id, "You can attach receipts only to your own entries", 403);
      requireValue(!before.voucher_file_data, "An attachment already exists", 409);
      const reason = textValue(body.reason, "Attachment reason", 1000, true);
      // Reuse file validation without changing dates or posting into a closed period.
      const fileData = body.voucherFileData;
      requireValue(typeof fileData === "string" && fileData.length <= 3 * 1024 * 1024 &&
        /^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=\r\n]+$/.test(fileData), "Attach a supported voucher up to 2 MB");
      requireValue(Buffer.from(fileData.split(",")[1], "base64").length <= 2 * 1024 * 1024, "Voucher must be 2 MB or less");
      const hash = attachmentHash(fileData);
      const duplicates = this.duplicateMatches({ receiptHash: hash }, { ledgerType: type, id: before.id });
      if (duplicates.length && body.duplicateAcknowledged !== true) throw new HttpError(409, "This attachment is already used. Review the matches before attaching it.", { duplicates });
      this.db.prepare("UPDATE " + table + " SET voucher_file_name=?,voucher_file_data=?,receipt_hash=? WHERE id=?")
        .run(textValue(body.voucherFileName, "File name", 255, true), fileData, hash, before.id);
      const duplicateReason = duplicates.length ? textValue(body.duplicateReason, "Duplicate override reason", 1000, true) : "";
      writeAudit(this.db, actor, table, "ATTACH_RECEIPT", before.id, before,
        this.db.prepare("SELECT * FROM " + table + " WHERE id=?").get(before.id), reason + (duplicateReason ? " · Duplicate review: " + duplicateReason : ""));
      return { ok: true };
    })();
  }
  editEntry(actor, type, id, body) {
    return this.db.transaction(() => {
      const table = this.table(type),
        before = this.db
          .prepare("SELECT * FROM " + table + " WHERE id=?")
          .get(positiveId(id));
      requireValue(before, "Entry not found", 404);
      this.openPeriodFor(before.date);
      requireValue(
        Object.keys(body).every((key) =>
          ["description", "signature", "categoryId", "reason"].includes(key),
        ),
        "Posted financial fields cannot be edited. Reverse the entry and post a correction.",
        409,
      );
      const reason = textValue(body.reason, "Reason", 1000, true);
      const description =
        body.description === undefined
          ? before.description
          : textValue(body.description, "Description", 2000);
      const signature =
        body.signature === undefined
          ? before.signature
          : textValue(body.signature, "Signature", 200);
      const categoryId =
        body.categoryId === undefined
          ? before.category_id
          : body.categoryId == null || body.categoryId === ""
            ? null
            : positiveId(body.categoryId, "category");
      if (categoryId !== before.category_id && categoryId)
        requireValue(
          this.db
            .prepare("SELECT 1 FROM expense_categories WHERE id=? AND active=1")
            .get(categoryId),
          "Choose an active category",
        );
      requireValue(
        before.reversal_of == null || categoryId === before.category_id,
        "Reversal categories follow their original entry",
        409,
      );
      requireValue(
        !this.db
          .prepare("SELECT 1 FROM " + table + " WHERE reversal_of=?")
          .get(id) || categoryId === before.category_id,
        "A reversed entry cannot be recategorized",
        409,
      );
      this.db
        .prepare(
          "UPDATE " +
            table +
            " SET description=?,signature=?,category_id=? WHERE id=?",
        )
        .run(description, signature, categoryId, id);
      const after = this.db
        .prepare("SELECT * FROM " + table + " WHERE id=?")
        .get(id);
      writeAudit(
        this.db,
        actor,
        table,
        "EDIT",
        Number(id),
        before,
        after,
        reason,
      );
      return { ok: true };
    })();
  }
  reverseEntry(actor, type, id, body) {
    return this.db.transaction(() => {
      const table = this.table(type),
        before = this.db
          .prepare("SELECT * FROM " + table + " WHERE id=?")
          .get(positiveId(id));
      requireValue(before, "Entry not found", 404);
      requireValue(
        !before.reversal_of,
        "Reversal entries cannot themselves be reversed",
        409,
      );
      requireValue(
        !this.db
          .prepare("SELECT 1 FROM " + table + " WHERE reversal_of=?")
          .get(id),
        "This entry has already been reversed",
        409,
      );
      const date = dateValue(body.date);
      const period = this.openPeriodFor(date);
      requireValue(
        date >= before.date,
        "A reversal cannot precede its original entry",
      );
      const reason = textValue(body.reason, "Correction reason", 1000, true);
      const data = {
        date,
        voucherNo: "REV-" + before.no + "-" + before.id,
        depositMinor: before.cost_minor,
        costMinor: before.deposit_minor,
        description: "Reversal of voucher " + before.voucher_no + ": " + reason,
        signature: actor.name || "",
        categoryId: before.category_id,
        periodId: period.id,
        taxTypeId: before.tax_type_id,
        taxName: before.tax_name_snapshot,
        taxRate: before.tax_rate_snapshot,
        fileName: null,
        fileData: null,
      };
      const result = this.insertEntry(
        actor,
        type,
        data,
        "REVERSE",
        before.id,
        reason,
      );
      // The original is unchanged; its relationship to the correction is preserved in the new entry.
      return result;
    })();
  }
  importPreview(type, rows) {
    const table = this.table(type);
    requireValue(
      Array.isArray(rows) && rows.length > 0 && rows.length <= 1000,
      "Import between 1 and 1,000 rows",
    );
    const existing = new Set(
      this.db
        .prepare(
          "SELECT date,voucher_no,deposit_minor,cost_minor FROM " +
            table +
            " WHERE reversal_of IS NULL",
        )
        .all()
        .map((r) =>
          JSON.stringify([
            r.date,
            r.voucher_no.trim().toLowerCase(),
            r.deposit_minor,
            r.cost_minor,
          ]),
        ),
    );
    const seen = new Set();
    const preview = rows.map((row, index) => {
      try {
        requireValue(
          row && typeof row === "object" && !Array.isArray(row),
          "Invalid row",
        );
        const entry = this.normalizeEntry(row, true);
        const key = JSON.stringify([
          entry.date,
          entry.voucherNo.toLowerCase(),
          entry.depositMinor,
          entry.costMinor,
        ]);
        const duplicate = existing.has(key) || seen.has(key) || this.duplicateMatches(entry).length > 0;
        seen.add(key);
        return {
          index,
          sourceRow: row.sourceRow || index + 2,
          valid: !duplicate,
          duplicate,
          errors: duplicate ? ["Duplicate voucher, date and amounts"] : [],
          entry: {
            date: entry.date,
            voucherNo: entry.voucherNo,
            deposit: entry.depositMinor / 100,
            cost: entry.costMinor / 100,
            categoryId: entry.categoryId,
            category:
              this.categories().find((c) => c.id === entry.categoryId)?.name ||
              "",
            description: entry.description,
            signature: entry.signature,
            taxTypeId: entry.taxTypeId,
          },
          normalized: entry,
        };
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return {
          index,
          sourceRow: row?.sourceRow || index + 2,
          valid: false,
          duplicate: false,
          errors: [error.message],
          entry: row,
        };
      }
    });
    return {
      rows: preview,
      validCount: preview.filter((r) => r.valid).length,
      invalidCount: preview.filter((r) => !r.valid).length,
    };
  }
  importRows(actor, type, body) {
    return this.db.transaction(() => {
      const preview = this.importPreview(type, body.rows);
      requireValue(
        preview.invalidCount === 0,
        "Import validation changed or rows are invalid. Preview the file again.",
        422,
      );
      const fileName = textValue(body.fileName, "Import file name", 255);
      for (const row of preview.rows)
        this.insertEntry(
          actor,
          type,
          row.normalized,
          "IMPORT",
          null,
          "Imported from " + (fileName || "spreadsheet"),
        );
      return { ok: true, imported: preview.validCount };
    })();
  }
}
