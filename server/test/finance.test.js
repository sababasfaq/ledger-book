import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { migrateFinance, LEDGERS } from "../finance-schema.js";
import { moneyMinor } from "../finance.js";
import { balanceRows } from "../../client/src/lib/ledgerMath.js";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dept-expense-tests-"));
process.env.BACKUP_DIR = directory;
process.env.JWT_SECRET = "isolated-finance-test-secret";
process.env.ADMIN_PASSWORD = "isolated-admin-password";
const { app, db, finance, backups } = await import("../server.js");
const { hashPassword } = await import("../auth.js");

test("financial upgrade integration", async (t) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  let token = "",
    officialToken = "",
    currentPassword = process.env.ADMIN_PASSWORD;
  const call = async (
    url,
    method = "GET",
    body,
    expected = 200,
    auth = token,
  ) => {
    const response = await fetch(base + "/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await response.json();
    assert.equal(
      response.status,
      expected,
      `${method} ${url}: ${JSON.stringify(json)}`,
    );
    return json;
  };
  const login = async (password = currentPassword) =>
    (
      await call(
        "/auth/login",
        "POST",
        { username: "chairman@example.com", password },
        200,
        "",
      )
    ).token;
  const period = finance.periods()[0],
    year = Number(period.start_date.slice(0, 4));
  let category, expense, backupId, future, closingBefore;
  const entry = (voucher, overrides = {}) => ({
    date: period.start_date,
    voucherNo: voucher,
    cost: "10.00",
    categoryId: category?.id,
    ...overrides,
  });
  try {
    await t.test("money and balances use exact minor units", () => {
      assert.equal(moneyMinor("0.10") + moneyMinor("0.20"), 30);
      for (const bad of ["-1", "NaN", "1.001", "1e5", {}, Infinity])
        assert.throws(() => moneyMinor(bad));
      const rows = balanceRows(
        [
          { id: 1, date: "2026-01-01", deposit_minor: 100000, cost_minor: 0 },
          { id: 2, date: "2026-02-01", deposit_minor: 0, cost_minor: 20000 },
        ],
        50,
      );
      assert.equal(
        rows.filter((row) => row.date >= "2026-02-01")[0].netBalance,
        850,
      );
    });
    await t.test(
      "existing data migrates once without losing rows or legacy history",
      () => {
        const legacy = new Database(":memory:");
        const source = fs.readFileSync(
          new URL("../db.js", import.meta.url),
          "utf8",
        );
        legacy.exec(source.split("db.exec(`")[1].split("`);")[0]);
        legacy.exec("ALTER TABLE association_ledger ADD COLUMN cost REAL");
        for (const table of Object.values(LEDGERS))
          legacy.exec(
            "ALTER TABLE " + table + " ADD COLUMN tax_type_id INTEGER",
          );
        legacy
          .prepare(
            "INSERT INTO users(name,email,password_hash) VALUES('Legacy','legacy@example.com','not-used')",
          )
          .run();
        legacy
          .prepare(
            "INSERT INTO general_ledger(no,date,voucher_no,deposit,created_by) VALUES('01','2020-01-01','OLD',1.23,1)",
          )
          .run();
        legacy
          .prepare(
            "INSERT INTO logs(user_id,user_name,role,table_name,action,row_id) VALUES(1,'Legacy','official','general_ledger','ADD',1)",
          )
          .run();
        legacy.exec("ALTER TABLE general_ledger ADD COLUMN voucher_file_data TEXT");
        legacy.prepare("UPDATE general_ledger SET voucher_file_data=?").run("data:image/png;base64,bGVnYWN5");
        migrateFinance(legacy);
        const migratedHash = legacy.prepare("SELECT receipt_hash FROM general_ledger").get().receipt_hash;
        assert.match(migratedHash, /^[a-f0-9]{64}$/);
        migrateFinance(legacy);
        const row = legacy.prepare("SELECT * FROM general_ledger").get();
        assert.equal(row.deposit, 1.23);
        assert.equal(row.deposit_minor, 123);
        assert.ok(row.financial_period_id);
        assert.equal(row.receipt_hash, migratedHash);
        assert.equal(row.voucher_file_data, "data:image/png;base64,bGVnYWN5");
        assert.equal(
          legacy.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n,
          1,
        );
        legacy.close();
      },
    );
    await t.test(
      "legacy user timestamps upgrade without a non-constant ALTER default",
      async () => {
        const legacyFile = path.join(directory, "legacy-users.sqlite");
        const legacy = new Database(legacyFile);
        const source = fs.readFileSync(
          new URL("../db.js", import.meta.url),
          "utf8",
        );
        legacy.exec(source.split("db.exec(`")[1].split("`);")[0]);
        legacy.exec("ALTER TABLE users DROP COLUMN created_at");
        legacy
          .prepare(
            "INSERT INTO users(name,email,password_hash) VALUES('Old user','old@example.com','unused')",
          )
          .run();
        legacy.close();
        process.env.DB_PATH = legacyFile;
        try {
          const { db: upgraded } =
            await import("../db.js?legacy-timestamp-regression");
          assert.ok(
            upgraded.prepare("SELECT created_at FROM users WHERE id=1").get()
              .created_at,
          );
          upgraded
            .prepare(
              "INSERT INTO users(name,email,password_hash) VALUES('New user','new@example.com','unused')",
            )
            .run();
          assert.ok(
            upgraded.prepare("SELECT created_at FROM users WHERE id=2").get()
              .created_at,
          );
          upgraded.close();
        } finally {
          process.env.DB_PATH = ":memory:";
        }
      },
    );
    await t.test(
      "authentication and admin roles protect finance controls",
      async () => {
        await call("/periods", "GET", undefined, 401, "");
        token = await login();
        const hash = await hashPassword("official-password");
        db.prepare(
          "INSERT INTO users(name,email,role,approved,password_hash) VALUES('Officer','officer@example.com','official',1,?)",
        ).run(hash);
        officialToken = (
          await call(
            "/auth/login",
            "POST",
            { username: "officer@example.com", password: "official-password" },
            200,
            "",
          )
        ).token;
        for (const url of ["/backups", "/admin/logs"])
          await call(url, "GET", undefined, 403, officialToken);
        await call(
          "/categories",
          "POST",
          { name: "Forbidden" },
          403,
          officialToken,
        );
        await call("/budgets", "PUT", {}, 403, officialToken);
      },
    );
    await t.test(
      "profile and instruction changes retain detailed audit snapshots",
      async () => {
        await call("/me", "PATCH", {
          name: "Finance Chairman",
          designation: "Chairman",
        });
        let events = (await call("/admin/logs?action=EDIT&table=users")).events;
        assert.equal(events[0].before.name, "Chairman");
        assert.equal(events[0].after.name, "Finance Chairman");
        assert.equal(events[0].before.password_hash, undefined);
        const instruction = await call("/instructions", "POST", {
          title: "Review documents",
          description: "Submit supporting documents",
        });
        await call(
          `/instructions/${instruction.id}/submit`,
          "POST",
          {
            note: "Reviewed",
            fileName: "proof.pdf",
            fileData: "data:application/pdf;base64,JVBERi0=",
          },
          200,
          officialToken,
        );
        events = (
          await call("/admin/logs?action=ADD&table=instruction_submissions")
        ).events;
        assert.equal(events[0].after.file_name, "proof.pdf");
        assert.equal(events[0].after.file_data, undefined);
        await call(`/instructions/${instruction.id}`, "DELETE");
        events = (await call("/admin/logs?action=DELETE&table=instructions"))
          .events;
        assert.equal(events[0].before.title, "Review documents");
      },
    );
    await t.test(
      "categories support unique names and archived historical records",
      async () => {
        category = await call("/categories", "POST", { name: "Travel" }, 201);
        await call("/categories", "POST", { name: "travel" }, 409);
        const archived = await call(
          "/categories",
          "POST",
          { name: "Archived" },
          201,
        );
        await call("/categories/" + archived.id, "PATCH", {
          name: "Archived",
          active: false,
          reason: "No longer used",
        });
        await call(
          "/ledger/general",
          "POST",
          entry("ARCH", { categoryId: archived.id }),
          400,
        );
      },
    );
    await t.test(
      "opening balances and budget allocations affect summaries",
      async () => {
        await call(`/periods/${period.id}/opening-balances`, "PUT", {
          balances: {
            general: "1000",
            unofficial: "0",
            association: "0",
            departmental: "0",
          },
          reason: "Initial funds",
        });
        await call("/budgets", "PUT", {
          periodId: period.id,
          categoryId: category.id,
          amount: "100",
          alertPercent: 80,
          reason: "Travel allowance",
        });
        const summary = await call(`/periods/${period.id}/summary`);
        assert.equal(summary.totalOpening, 1000);
        expense = await call(
          "/ledger/general",
          "POST",
          entry("TRAVEL-1", { cost: "90" }),
          201,
          officialToken,
        );
        let report = await call("/budgets?periodId=" + period.id);
        assert.equal(
          report.categories.find((c) => c.id === category.id).status,
          "warning",
        );
        await call(
          "/ledger/general",
          "POST",
          entry("TRAVEL-2", { cost: "20" }),
          201,
        );
        report = await call("/budgets?periodId=" + period.id);
        assert.equal(
          report.categories.find((c) => c.id === category.id).status,
          "over-budget",
        );
        assert.equal(report.totalSpent, 110);
      },
    );
    await t.test(
      "invalid financial input leaves ledger and audit unchanged",
      async () => {
        const count = db
          .prepare("SELECT COUNT(*) AS n FROM general_ledger")
          .get().n;
        for (const overrides of [
          { date: `${year}-02-30` },
          { date: "bad" },
          { cost: "-1" },
          { cost: "1.001" },
          { cost: "0" },
          { categoryId: 99999 },
          { categoryId: null },
          { voucherNo: "" },
        ])
          await call("/ledger/general", "POST", entry("BAD", overrides), 400);
        await call(
          "/ledger/general",
          "POST",
          entry("OUTSIDE", { date: "2199-01-01" }),
          409,
        );
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n,
          count,
        );
      },
    );
    await t.test(
      "posted financial fields cannot be overwritten or deleted",
      async () => {
        await call(
          `/ledger/general/${expense.id}`,
          "PATCH",
          { cost: "5", reason: "Attempt" },
          409,
        );
        await call(
          `/ledger/general/${expense.id}`,
          "PATCH",
          { date: period.end_date, reason: "Attempt" },
          409,
        );
        await call(`/ledger/general/${expense.id}`, "DELETE", undefined, 409);
        await call(
          `/ledger/general/${expense.id}`,
          "PATCH",
          { description: "Updated" },
          400,
        );
        await call(`/ledger/general/${expense.id}`, "PATCH", {
          description: "Travel to campus",
          reason: "Add missing context",
        });
        const audit = await call(
          "/admin/logs?action=EDIT&table=general_ledger",
        );
        assert.equal(audit.events[0].before.description, "");
        assert.equal(audit.events[0].after.description, "Travel to campus");
        assert.equal(audit.events[0].reason, "Add missing context");
        assert.throws(
          () => db.prepare("UPDATE audit_events SET reason='tampered'").run(),
          /append-only/,
        );
        assert.throws(
          () => db.prepare("DELETE FROM audit_events").run(),
          /append-only/,
        );
      },
    );
    await t.test(
      "an audit write failure rolls back the financial mutation",
      async () => {
        const rowsBefore = db
          .prepare("SELECT COUNT(*) AS n FROM general_ledger")
          .get().n;
        const eventsBefore = db
          .prepare("SELECT COUNT(*) AS n FROM audit_events")
          .get().n;
        db.exec(
          "CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events WHEN NEW.table_name='general_ledger' AND NEW.action='ADD' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END",
        );
        try {
          await call("/ledger/general", "POST", entry("AUDIT-FAILURE"), 409);
          assert.equal(
            db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n,
            rowsBefore,
          );
          assert.equal(
            db.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n,
            eventsBefore,
          );
        } finally {
          db.exec("DROP TRIGGER test_audit_failure");
        }
      },
    );
    await t.test(
      "tax rates are snapshotted and attachment bytes stay out of audit snapshots",
      async () => {
        const tax = await call(
          "/taxes",
          "POST",
          { name: "Test tax", percentage: 5 },
          201,
        );
        const result = await call(
          "/ledger/unofficial",
          "POST",
          entry("TAX", {
            taxTypeId: tax.id,
            voucherFileName: "proof.pdf",
            voucherFileData: "data:application/pdf;base64,JVBERi0=",
          }),
          201,
        );
        await call("/taxes/" + tax.id, "PATCH", {
          name: "Changed tax",
          percentage: 10,
        });
        const row = (await call("/ledger/unofficial")).find(
          (r) => r.id === result.id,
        );
        assert.equal(row.taxPercentage, 5);
        assert.equal(row.taxTypeName, "Test tax");
        const audit = await call(
          "/admin/logs?action=ADD&table=unofficial_ledger",
        );
        assert.equal(audit.events[0].after.voucher_file_name, "proof.pdf");
        assert.equal(audit.events[0].after.voucher_file_data, undefined);
        await call("/taxes/" + tax.id, "DELETE", undefined, 409);
      },
    );
    await t.test(
      "reversals preserve originals and reduce the correct category spend",
      async () => {
        const original = db
          .prepare("SELECT * FROM general_ledger WHERE id=?")
          .get(expense.id);
        const result = await call(
          `/ledger/general/${expense.id}/reverse`,
          "POST",
          { date: period.start_date, reason: "Wrong claim" },
          201,
        );
        assert.deepEqual(
          db.prepare("SELECT * FROM general_ledger WHERE id=?").get(expense.id),
          original,
        );
        const rows = await call("/ledger/general"),
          reversal = rows.find((r) => r.id === result.id);
        assert.equal(reversal.reversalOf, expense.id);
        assert.equal(reversal.deposit, 90);
        assert.equal(
          (await call("/budgets?periodId=" + period.id)).categories.find(
            (c) => c.id === category.id,
          ).spent,
          30,
        );
        await call(
          `/ledger/general/${expense.id}/reverse`,
          "POST",
          { date: period.start_date, reason: "Again" },
          409,
        );
        await call(
          `/ledger/general/${result.id}/reverse`,
          "POST",
          { date: period.start_date, reason: "Again" },
          409,
        );
        await call(
          `/ledger/general/${expense.id}/reverse`,
          "POST",
          { date: period.start_date, reason: "Role check" },
          403,
          officialToken,
        );
      },
    );
    await t.test(
      "imports preview errors and duplicates, and commit atomically after revalidation",
      async () => {
        const valid = {
          date: period.start_date,
          voucherNo: "IMPORT-1",
          cost: "12.34",
          category: "Travel",
        };
        const rows = [
          valid,
          { ...valid },
          { ...valid, voucherNo: "BAD-IMPORT", date: "not-a-date" },
          entry("TRAVEL-2", { cost: "20", category: "Travel" }),
        ];
        const count = db
          .prepare("SELECT COUNT(*) AS n FROM general_ledger")
          .get().n;
        const preview = await call("/ledger/general/import/preview", "POST", {
          rows,
        });
        assert.equal(preview.validCount, 1);
        assert.equal(preview.invalidCount, 3);
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n,
          count,
        );
        await call(
          "/ledger/general/import",
          "POST",
          { rows, fileName: "mixed.xlsx" },
          422,
        );
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n,
          count,
        );
        const imported = await call(
          "/ledger/general/import",
          "POST",
          { rows: [valid], fileName: "valid.xlsx" },
          201,
          officialToken,
        );
        assert.equal(imported.imported, 1);
        assert.equal(
          (
            await call("/ledger/general/import/preview", "POST", {
              rows: [valid],
            })
          ).validCount,
          0,
        );
        const audit = await call("/admin/logs?action=IMPORT");
        assert.equal(audit.events[0].user_name, "Officer");
        assert.match(audit.events[0].reason, /valid.xlsx/);
      },
    );
    await t.test(
      "period dates cannot overlap and closing is chronological",
      async () => {
        await call(
          "/periods",
          "POST",
          {
            name: "Overlap",
            startDate: period.start_date,
            endDate: period.end_date,
          },
          409,
        );
        future = await call(
          "/periods",
          "POST",
          {
            name: "Next year",
            startDate: `${year + 1}-01-01`,
            endDate: `${year + 1}-12-31`,
          },
          201,
        );
        await call(
          `/periods/${future.id}/close`,
          "POST",
          { reason: "Too early" },
          409,
        );
        await call(
          `/periods/${period.id}`,
          "PATCH",
          {
            name: period.name,
            startDate: period.end_date,
            endDate: period.end_date,
          },
          409,
        );
        await call(`/periods/${period.id}/close`, "POST", { reason: "" }, 400);
        assert.equal(finance.period(period.id).status, "open");
        await call(`/periods/${period.id}/close`, "POST", {
          reason: "Year reviewed",
        });
        closingBefore = await call(`/periods/${period.id}/report`);
        assert.equal(closingBefore.period.status, "closed");
      },
    );
    await t.test(
      "closed periods reject posting, edits, budget changes and imports",
      async () => {
        await call("/ledger/general", "POST", entry("CLOSED"), 409);
        await call(
          `/ledger/general/${expense.id}`,
          "PATCH",
          { description: "Backdated", reason: "Try" },
          409,
        );
        await call(
          "/budgets",
          "PUT",
          {
            periodId: period.id,
            categoryId: category.id,
            amount: "999",
            reason: "Try",
          },
          409,
        );
        await call(
          `/periods/${period.id}/opening-balances`,
          "PUT",
          {
            balances: {
              general: 1,
              unofficial: 0,
              association: 0,
              departmental: 0,
            },
            reason: "Try",
          },
          409,
        );
        await call(
          `/periods/${period.id}`,
          "PATCH",
          {
            name: "Rename closed",
            startDate: period.start_date,
            endDate: period.end_date,
          },
          409,
        );
        await call(
          `/periods/${future.id}`,
          "PATCH",
          {
            name: "Backdated empty period",
            startDate: `${year - 1}-01-01`,
            endDate: `${year - 1}-12-31`,
          },
          409,
        );
        await call(
          "/ledger/general/import",
          "POST",
          { rows: [entry("CLOSED-IMPORT")] },
          422,
        );
      },
    );
    await t.test(
      "later periods carry balances and preserve closed reports during corrections",
      async () => {
        const next = await call(`/periods/${future.id}/summary`);
        assert.equal(next.totalOpening, closingBefore.totalClosing);
        const target = (await call("/ledger/general")).find(
          (r) => r.voucher_no === "TRAVEL-2",
        );
        await call(
          `/ledger/general/${target.id}/reverse`,
          "POST",
          { date: future.start_date, reason: "Correction after closing" },
          201,
        );
        assert.deepEqual(
          await call(`/periods/${period.id}/report`),
          closingBefore,
        );
        assert.equal(
          (await call("/budgets?periodId=" + future.id)).totalSpent,
          -20,
        );
        await call(
          `/periods/${future.id}/opening-balances`,
          "PUT",
          { balances: {}, reason: "Try" },
          409,
        );
      },
    );
    await t.test(
      "backups download valid SQLite files and block unconfirmed recovery",
      async () => {
        const backup = await call("/backups", "POST", {}, 201);
        backupId = backup.id;
        const copy = new Database(backups.resolve(backupId), {
          readonly: true,
        });
        assert.equal(copy.pragma("integrity_check", { simple: true }), "ok");
        copy.close();
        const response = await fetch(
          base + "/api/backups/" + backupId + "/download",
          { headers: { Authorization: "Bearer " + token } },
        );
        assert.equal(response.status, 200);
        assert.equal(
          Buffer.from(await response.arrayBuffer())
            .subarray(0, 15)
            .toString(),
          "SQLite format 3",
        );
        await call(
          "/backups/" + backupId + "/restore",
          "POST",
          { password: currentPassword, confirmation: "NO", reason: "Try" },
          400,
        );
        await call(
          "/backups/" + backupId + "/restore",
          "POST",
          { password: "wrong", confirmation: "RESTORE", reason: "Try" },
          401,
        );
        assert.throws(() => backups.resolve("../data.sqlite"));
      },
    );
    await t.test(
      "restore preserves audit history, makes a safety copy and revokes existing sessions",
      async () => {
        const afterBackup = await call(
          "/ledger/general",
          "POST",
          entry("AFTER-BACKUP", { date: future.start_date, cost: "1" }),
          201,
        );
        const auditBefore = db
          .prepare("SELECT COUNT(*) AS n FROM audit_events")
          .get().n;
        const stale = token;
        const result = await call("/backups/" + backupId + "/restore", "POST", {
          password: currentPassword,
          confirmation: "RESTORE",
          reason: "Integration recovery",
        });
        assert.ok(fs.existsSync(backups.resolve(result.safetyBackup)));
        assert.equal(
          db
            .prepare("SELECT 1 FROM general_ledger WHERE id=?")
            .get(afterBackup.id),
          undefined,
        );
        assert.ok(
          db.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n >
            auditBefore,
        );
        assert.equal(db.pragma("foreign_key_check").length, 0);
        await call("/periods", "GET", undefined, 401, stale);
        await call("/periods", "GET", undefined, 401, officialToken);
        token = await login();
        const events = (await call("/admin/logs?action=RESTORE")).events;
        assert.equal(events[0].reason, "Integration recovery");
      },
    );
    await t.test(
      "scheduled retention keeps manual and safety copies",
      async () => {
        await call("/backups/settings", "PUT", {
          enabled: true,
          intervalHours: 1,
          retainCount: 2,
        });
        for (let i = 1; i <= 3; i++)
          await backups.tick(Date.now() + i * 7200000);
        const files = backups.list();
        assert.equal(
          files.filter((file) => file.id.startsWith("scheduled-")).length,
          2,
        );
        assert.ok(files.some((file) => file.id === backupId));
        assert.ok(files.some((file) => file.id.startsWith("before-restore-")));
        await call(
          "/backups/settings",
          "PUT",
          { enabled: true, intervalHours: 0, retainCount: 0 },
          400,
        );
      },
    );
    await t.test("password changes invalidate previous sessions", async () => {
      const stale = token,
        newPassword = "new-isolated-admin-password";
      await call("/me/change-password", "POST", {
        currentPassword,
        newPassword,
      });
      await call("/periods", "GET", undefined, 401, stale);
      currentPassword = newPassword;
      token = await login();
      assert.ok(
        (await call("/admin/logs?action=PASSWORD_CHANGE")).events.length,
      );
    });
  } finally {
    backups.stop();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("dept-expense-tests-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
