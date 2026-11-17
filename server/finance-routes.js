import { Router } from "express";
import {
  FinanceService,
  HttpError,
  dateValue,
  positiveId,
  requireValue,
  writeAudit,
} from "./finance.js";
import { verifyPassword } from "./auth.js";
import { LEDGERS } from "./finance-schema.js";
import { NotificationService } from "./notifications.js";

export function financeRouter(db, authRequired, superAdminOnly, backups) {
  const router = Router(),
    finance = new FinanceService(db);
  const notifications = new NotificationService(db, finance);
  const route = (method, path, handler, admin = false) => {
    router[method](
      path,
      authRequired,
      ...(admin ? [superAdminOnly] : []),
      (req, res, next) => {
        Promise.resolve()
          .then(() => handler(req, res))
          .catch(next);
      },
    );
  };
  route("get", "/finance/config", (_req, res) =>
    res.json({
      categories: finance.categories(),
      periods: finance.periods(),
      openingBalances: Object.fromEntries(
        Object.keys(LEDGERS).map((type) => [type, finance.opening(type) / 100]),
      ),
    }),
  );
  route("get", "/notifications", (req, res) => res.json(notifications.list(req.user, req.query.snoozed === "true")));
  route("patch", "/notifications/:id", (req, res) => res.json(notifications.update(req.user, req.params.id, req.body)));
  route("get", "/categories", (_req, res) => res.json(finance.categories()));
  route(
    "post",
    "/categories",
    (req, res) =>
      res.status(201).json(finance.saveCategory(req.user, req.body)),
    true,
  );
  route(
    "patch",
    "/categories/:id",
    (req, res) =>
      res.json(
        finance.saveCategory(req.user, req.body, positiveId(req.params.id)),
      ),
    true,
  );
  route("get", "/periods", (_req, res) => res.json(finance.periods()));
  route(
    "post",
    "/periods",
    (req, res) => res.status(201).json(finance.savePeriod(req.user, req.body)),
    true,
  );
  route(
    "patch",
    "/periods/:id",
    (req, res) =>
      res.json(
        finance.savePeriod(req.user, req.body, positiveId(req.params.id)),
      ),
    true,
  );
  route("get", "/periods/:id/summary", (req, res) =>
    res.json(finance.summary(req.params.id)),
  );
  route("get", "/periods/:id/report", (req, res) => {
    const period = finance.period(req.params.id);
    const report = period.closing_summary
      ? JSON.parse(period.closing_summary)
      : {
          ...finance.summary(period.id),
          budgets: finance.budgetReport(period.id),
        };
    res.json({
      ...report,
      period: {
        ...report.period,
        status: period.status,
        closed_at: period.closed_at,
      },
    });
  });
  route(
    "put",
    "/periods/:id/opening-balances",
    (req, res) =>
      res.json(finance.setOpenings(req.user, req.params.id, req.body)),
    true,
  );
  route(
    "post",
    "/periods/:id/close",
    (req, res) =>
      res.json(
        finance.closePeriod(
          req.user,
          positiveId(req.params.id),
          req.body.reason,
        ),
      ),
    true,
  );
  route("get", "/budgets", (req, res) =>
    res.json(finance.budgetReport(req.query.periodId)),
  );
  route(
    "put",
    "/budgets",
    (req, res) => res.json(finance.saveBudget(req.user, req.body)),
    true,
  );
  route("get", "/ledger/:type", (req, res) =>
    res.json(finance.listLedger(req.params.type)),
  );
  route("post", "/ledger/:type", (req, res) =>
    res.status(201).json(finance.addEntry(req.user, req.params.type, req.body)),
  );
  route("post", "/ledger/:type/duplicates", (req, res) => {
    finance.table(req.params.type);
    res.json({ duplicates: finance.duplicateMatches(finance.normalizeEntry(req.body)) });
  });
  route("patch", "/ledger/:type/:id/attachment", (req, res) =>
    res.json(finance.attachReceipt(req.user, req.params.type, req.params.id, req.body)));
  route(
    "patch",
    "/ledger/:type/:id",
    (req, res) =>
      res.json(
        finance.editEntry(
          req.user,
          req.params.type,
          positiveId(req.params.id),
          req.body,
        ),
      ),
    true,
  );
  route(
    "delete",
    "/ledger/:type/:id",
    () => {
      throw new HttpError(
        409,
        "Posted entries cannot be deleted. Use a reversal with a correction reason.",
      );
    },
    true,
  );
  route(
    "post",
    "/ledger/:type/:id/reverse",
    (req, res) =>
      res
        .status(201)
        .json(
          finance.reverseEntry(
            req.user,
            req.params.type,
            positiveId(req.params.id),
            req.body,
          ),
        ),
    true,
  );
  route("post", "/ledger/:type/import/preview", (req, res) => {
    const preview = finance.importPreview(req.params.type, req.body.rows);
    res.json({
      ...preview,
      rows: preview.rows.map(({ normalized, ...row }) => row),
    });
  });
  route("post", "/ledger/:type/import", (req, res) =>
    res
      .status(201)
      .json(finance.importRows(req.user, req.params.type, req.body)),
  );
  route("get", "/departmental", (req, res) => {
    const include =
      req.query.include === undefined
        ? Object.keys(LEDGERS)
        : String(req.query.include).split(",").filter(Boolean);
    requireValue(
      include.every((type) => Object.hasOwn(LEDGERS, type)),
      "Invalid ledger type",
    );
    const rows = include.flatMap((type) =>
      finance
        .listLedger(type)
        .map(({ voucherFileData, voucher_file_data, ...row }) => ({
          ...row,
          _src: type,
          voucherNo: row.voucher_no,
        })),
    );
    rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a._src.localeCompare(b._src) ||
        a.id - b.id,
    );
    res.json(rows.map((row, index) => ({ ...row, combinedNo: index + 1 })));
  });
  route(
    "get",
    "/admin/logs",
    (req, res) => {
      const conditions = [],
        values = [];
      for (const [query, column] of [
        ["action", "action"],
        ["table", "table_name"],
      ]) {
        if (req.query[query]) {
          conditions.push(column + "=?");
          values.push(String(req.query[query]));
        }
      }
      if (req.query.search) {
        conditions.push("(user_name LIKE ? OR reason LIKE ?)");
        values.push("%" + req.query.search + "%", "%" + req.query.search + "%");
      }
      if (req.query.from) {
        conditions.push("date(created_at)>=?");
        values.push(dateValue(req.query.from));
      }
      if (req.query.to) {
        conditions.push("date(created_at)<=?");
        values.push(dateValue(req.query.to));
      }
      const where = conditions.length
        ? " WHERE " + conditions.join(" AND ")
        : "";
      const page = Math.max(1, Number(req.query.page) || 1),
        limit = 50;
      requireValue(Number.isSafeInteger(page), "Invalid page");
      const total = db
        .prepare("SELECT COUNT(*) AS count FROM audit_events" + where)
        .get(...values).count;
      const events = db
        .prepare(
          "SELECT * FROM audit_events" +
            where +
            " ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .all(...values, limit, (page - 1) * limit)
        .map((row) => ({
          ...row,
          before: row.before_data ? JSON.parse(row.before_data) : null,
          after: row.after_data ? JSON.parse(row.after_data) : null,
          before_data: undefined,
          after_data: undefined,
        }));
      res.json({ events, total, page, pageSize: limit });
    },
    true,
  );
  route(
    "get",
    "/backups",
    (_req, res) =>
      res.json({ files: backups.list(), settings: backups.settings() }),
    true,
  );
  route(
    "post",
    "/backups",
    async (req, res) =>
      res.status(201).json(await backups.create("manual", req.user)),
    true,
  );
  route(
    "put",
    "/backups/settings",
    (req, res) => res.json(backups.updateSettings(req.user, req.body)),
    true,
  );
  route(
    "get",
    "/backups/:id/download",
    (req, res) => {
      const file = backups.resolve(req.params.id);
      writeAudit(
        db,
        req.user,
        "backups",
        "DOWNLOAD",
        null,
        null,
        { id: req.params.id },
        "Downloaded recovery copy",
      );
      res.download(file, req.params.id);
    },
    true,
  );
  route(
    "post",
    "/backups/:id/restore",
    async (req, res) => {
      const current = db
        .prepare("SELECT password_hash FROM users WHERE id=?")
        .get(req.user.id);
      requireValue(
        typeof req.body.password === "string" &&
          current &&
          (await verifyPassword(req.body.password, current.password_hash)),
        "Incorrect current password",
        401,
      );
      res.json(await backups.restore(req.user, req.params.id, req.body));
    },
    true,
  );
  router.use((error, _req, res, _next) => {
    if (error instanceof HttpError)
      return res.status(error.status).json({ error: error.message, ...error.details });
    if (error.code?.startsWith("SQLITE_CONSTRAINT"))
      return res
        .status(409)
        .json({
          error:
            "This change conflicts with an existing record or a referenced item.",
        });
    console.error("Finance request failed:", error);
    res.status(500).json({ error: "The request could not be completed" });
  });
  return router;
}
