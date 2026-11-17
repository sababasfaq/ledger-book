import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attachmentHash } from "../receipt-files.js";
import { NotificationService, dhakaDate } from "../notifications.js";
import { AiService } from "../ai-service.js";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "enhancement-test-secret";
process.env.ADMIN_PASSWORD = "enhancement-admin-password";
process.env.DISABLE_BACKUP_SCHEDULER = "true";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dept-enhancement-test-"));
process.env.BACKUP_DIR = directory;
const { app, db, finance, backups } = await import("../server.js");
const { createToken } = await import("../auth.js");

test("duplicate protection, evidence and reminders", async (t) => {
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  const admin = db.prepare("SELECT * FROM users WHERE role='super_admin'").get();
  const addUser = (name) => {
    const id = db.prepare("INSERT INTO users(name,email,role,approved,password_hash) VALUES(?,?,'official',1,'unused')").run(name, name + "@example.com").lastInsertRowid;
    return db.prepare("SELECT * FROM users WHERE id=?").get(id);
  };
  const officer = addUser("EvidenceOfficer"), other = addUser("OtherOfficer");
  const category = finance.categories().find((item) => item.name === "Equipment");
  const date = dhakaDate(), older = new Date(Date.parse(date + "T00:00:00Z") - 5 * 86400000).toISOString().slice(0, 10);
  const period = finance.periods().find((p) => p.start_date <= date && p.end_date >= date);
  if (!finance.periods().some((p) => p.start_date <= older && p.end_date >= older)) {
    db.prepare("INSERT INTO financial_periods(name,start_date,end_date) VALUES(?,?,?)").run("Older reminder test", older.slice(0, 4) + "-01-01", older.slice(0, 4) + "-12-31");
  }
  const image = "data:image/png;base64," + Buffer.from("unique receipt image bytes").toString("base64");
  const entry = (voucherNo, overrides = {}) => ({ date, voucherNo, cost: "10.00", categoryId: category.id, ...overrides });
  const call = async (url, method = "GET", body, expected = 200, actor = admin) => {
    const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: "Bearer " + createToken(actor) } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result)); return result;
  };
  try {
    let original;
    await t.test("manual duplicates across ledgers are rejected before any write and overrides are audited", async () => {
      original = await call("/ledger/general", "POST", entry("CROSS-1", { voucherFileName: "one.png", voucherFileData: image }), 201);
      const count = db.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n;
      const result = await call("/ledger/unofficial", "POST", entry("CROSS-1"), 409);
      assert.equal(result.duplicates[0].id, original.id);
      assert.match(result.duplicates[0].href, /general-ledger\?entry=/);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM unofficial_ledger").get().n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n, count);
      await call("/ledger/unofficial", "POST", entry("CROSS-1", { duplicateAcknowledged: true, duplicateReason: {} }), 409);
      const posted = await call("/ledger/unofficial", "POST", entry("CROSS-1", { duplicateAcknowledged: true, duplicateReason: "Separate legitimate purchase with reused reference" }), 201);
      assert.ok(posted.id);
      assert.match(db.prepare("SELECT reason FROM audit_events WHERE action='DUPLICATE_OVERRIDE'").get().reason, /Separate legitimate/);
    });
    await t.test("decoded attachment hashes detect reuse despite different vouchers, dates and MIME prefixes", async () => {
      const changedPrefix = image.replace("image/png", "image/jpeg");
      assert.equal(attachmentHash(changedPrefix), attachmentHash(image));
      const result = await call("/ledger/association", "POST", entry("DIFFERENT", { cost: "33", voucherFileName: "other.jpg", voucherFileData: changedPrefix }), 409);
      assert.ok(result.duplicates.some((item) => item.reasons.includes("Identical attachment bytes")));
    });
    await t.test("receipt reference metadata catches repeated receipts when department vouchers differ", async () => {
      await call("/ledger/general", "POST", entry("DEPT-A", { receiptNumber: "SHOP-42", receiptMerchant: "Demo Shop", cost: "12" }), 201);
      const result = await call("/ledger/departmental", "POST", entry("DEPT-B", { receiptNumber: "shop-42", receiptMerchant: "demo shop", cost: "15" }), 409);
      assert.ok(result.duplicates.some((item) => item.reasons.includes("Same receipt reference")));
    });
    await t.test("retrying a committed draft returns the original entry instead of posting twice", async () => {
      const draft = entry("RETRY-ONCE", { clientRequestId: "stable-draft-request", cost: "19" });
      const first = await call("/ledger/general", "POST", draft, 201, officer);
      const count = db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n;
      const retry = await call("/ledger/general", "POST", draft, 201, officer);
      assert.equal(retry.id, first.id);
      assert.equal(retry.replayed, true);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM general_ledger").get().n, count);
      await call("/ledger/general", "POST", { ...draft, cost: "20" }, 409, officer);
    });
    await t.test("reversed entries no longer cause duplicate warnings for replacement entries", async () => {
      const posted = await call("/ledger/general", "POST", entry("REPLACE-ME", { cost: "17" }), 201);
      await call(`/ledger/general/${posted.id}/reverse`, "POST", { date, reason: "Correct this purchase" }, 201);
      await call("/ledger/general", "POST", entry("REPLACE-ME", { cost: "17" }), 201);
    });
    await t.test("missing-receipt reminders respect ownership, persist snooze and resolve after attachment", async () => {
      // The reminder age crosses a year boundary safely if today's date is early January.
      const missing = await call("/ledger/general", "POST", entry("MISSING-OWN", { date: older, cost: "23" }), 201, officer);
      const notifications = await call("/notifications", "GET", undefined, 200, officer);
      const reminder = notifications.items.find((item) => item.id === `receipt:general:${missing.id}`);
      assert.ok(reminder);
      assert.ok(!(await call("/notifications", "GET", undefined, 200, other)).items.some((item) => item.id === reminder.id));
      await call("/notifications/" + encodeURIComponent(reminder.id), "PATCH", { read: true }, 200, officer);
      assert.equal((await call("/notifications", "GET", undefined, 200, officer)).items.find((item) => item.id === reminder.id).read, true);
      await call("/notifications/" + encodeURIComponent(reminder.id), "PATCH", { snoozeHours: 24 }, 200, officer);
      assert.ok(!(await call("/notifications", "GET", undefined, 200, officer)).items.some((item) => item.id === reminder.id));
      await call("/notifications/" + encodeURIComponent(reminder.id), "PATCH", { read: true }, 404, other);
      await call(`/ledger/general/${missing.id}/attachment`, "PATCH", { voucherFileName: "late.png", voucherFileData: image, reason: "Late supporting document" }, 403, other);
      const ownImage = "data:image/png;base64," + Buffer.from("late supporting receipt").toString("base64");
      await call(`/ledger/general/${missing.id}/attachment`, "PATCH", { voucherFileName: "late.png", voucherFileData: ownImage, reason: "Received supporting document" }, 200, officer);
      assert.ok(!(await call("/notifications?snoozed=true", "GET", undefined, 200, officer)).items.some((item) => item.id === reminder.id));
      assert.equal(db.prepare("SELECT cost_minor FROM general_ledger WHERE id=?").get(missing.id).cost_minor, 2300);
    });
    await t.test("instruction deadlines and budget thresholds create actionable reminders", async () => {
      const task = await call("/instructions", "POST", { title: "Submit inventory", description: "Count equipment", dueDate: date });
      await call(`/instructions/${task.id}/due-date`, "PATCH", { dueDate: older });
      await call(`/instructions/${task.id}/due-date`, "PATCH", { dueDate: "invalid" }, 400);
      await call(`/instructions/${task.id}/due-date`, "PATCH", { dueDate: date }, 403, officer);
      assert.ok((await call("/notifications", "GET", undefined, 200, officer)).items.some((item) => item.title === "Instruction overdue"));
      await call(`/instructions/${task.id}/submit`, "POST", {}, 200, officer);
      assert.ok(!(await call("/notifications", "GET", undefined, 200, officer)).items.some((item) => item.kind === "instruction" && item.message.includes("Submit inventory")));
      finance.saveBudget(admin, { periodId: period.id, categoryId: category.id, amount: "1", reason: "Test over-budget reminder" });
      assert.ok((await call("/notifications")).items.some((item) => item.kind === "budget" && item.title === "Budget exceeded"));
    });
    await t.test("English and Bangla financial questions return calculated figures and source links without the model", async () => {
      let modelCalls = 0;
      const service = new AiService({ db, finance, model: { json: async () => { modelCalls++; throw new Error("No runtime"); } }, ocr: {} });
      for (const message of ["How much did we spend on Equipment this period?", "এই মাসে কত টাকা খরচ হয়েছে?"]) {
        const answer = await service.ask(officer, { message, periodId: period.id, ledgerType: "general" });
        assert.equal(answer.mode, "grounded"); assert.ok(answer.evidence.total > 0);
        assert.ok(answer.evidence.entries.every((item) => item.ledgerType === "general" && item.href.startsWith("/general-ledger?entry=")));
        assert.ok(!JSON.stringify(answer.evidence).includes("base64"));
      }
      const help = await service.ask(officer, { message: "কীভাবে একাধিক রসিদ পড়ব?" });
      assert.match(help.answer, /Batch Receipts/);
      assert.equal(modelCalls, 0);
    });
    await t.test("notification API requires login and validates update actions", async () => {
      await call("/notifications", "GET", undefined, 401, null);
      const service = new NotificationService(db, finance);
      const item = service.list(admin).items[0];
      await call("/notifications/" + encodeURIComponent(item.id), "PATCH", { snoozeHours: -2 }, 400);
    });
    await t.test("supporting receipts can resolve missing documentation after closing without changing closing figures", async () => {
      const posted = finance.addEntry(officer, "general", entry("CLOSED-DOCUMENT", { cost: "7" }));
      for (const p of finance.periods().filter((p) => p.status === "open" && p.end_date <= period.end_date).sort((a, b) => a.start_date.localeCompare(b.start_date))) {
        finance.closePeriod(admin, p.id, "Close before late documentation test");
      }
      const closing = db.prepare("SELECT closing_summary FROM financial_periods WHERE id=?").get(period.id).closing_summary;
      await call(`/ledger/general/${posted.id}/attachment`, "PATCH", {
        voucherFileName: "late-closed.png", voucherFileData: "data:image/png;base64,Y2xvc2VkLXJlY2VpcHQ=", reason: "Documentation arrived after closing",
      }, 200, officer);
      assert.equal(db.prepare("SELECT closing_summary FROM financial_periods WHERE id=?").get(period.id).closing_summary, closing);
      assert.equal(db.prepare("SELECT cost_minor FROM general_ledger WHERE id=?").get(posted.id).cost_minor, 700);
    });
  } finally {
    backups.stop(); await new Promise((resolve) => server.close(resolve)); db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("dept-enhancement-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
