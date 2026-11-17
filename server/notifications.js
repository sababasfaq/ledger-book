import { requireValue } from "./finance.js";
import { LEDGERS } from "./finance-schema.js";
import { ledgerPaths } from "./receipt-files.js";

export function dhakaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export class NotificationService {
  constructor(db, finance) { Object.assign(this, { db, finance }); }
  list(actor, includeSnoozed = false) {
    const date = dhakaDate();
    const shifted = (days) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
    const items = [];
    const add = (id, kind, title, message, href, severity = "info") => items.push({ id, kind, title, message, href, severity });
    if (actor.role === "super_admin") {
      for (const user of this.db.prepare("SELECT id,name FROM users WHERE approved=0 ORDER BY id LIMIT 100").all()) {
        add("user:" + user.id, "approval", "Account awaiting approval", user.name + " is waiting for account approval.", "/admin/users");
      }
    }
    const tasks = this.db.prepare(`SELECT i.id,i.title,i.due_date,
      (SELECT COUNT(*) FROM users u WHERE u.role='official' AND u.approved=1 AND NOT EXISTS
        (SELECT 1 FROM instruction_submissions s WHERE s.instruction_id=i.id AND s.submitted_by=u.id)) AS pending
      FROM instructions i WHERE ${actor.role === "super_admin" ? "1=1" : "NOT EXISTS(SELECT 1 FROM instruction_submissions s WHERE s.instruction_id=i.id AND s.submitted_by=?)"}
      ORDER BY i.due_date IS NULL,i.due_date,i.id LIMIT 100`).all(...(actor.role === "super_admin" ? [] : [actor.id]));
    for (const task of tasks) {
      if (actor.role === "super_admin" && !task.pending) continue;
      if (actor.role === "super_admin" && (!task.due_date || task.due_date > shifted(3))) continue;
      const overdue = task.due_date && task.due_date < date;
      add(`instruction:${task.id}:${task.due_date || "none"}:${overdue ? "overdue" : "pending"}`, "instruction",
        overdue ? "Instruction overdue" : task.due_date && task.due_date <= shifted(3) ? "Instruction due soon" : "Pending instruction",
        task.title + (task.due_date ? " · Due " + task.due_date : "") + (actor.role === "super_admin" ? ` · ${task.pending} officials remaining` : ""),
        "/instructions", overdue ? "urgent" : "info");
    }
    for (const [type, table] of Object.entries(LEDGERS)) {
      const rows = this.db.prepare(`SELECT l.id,l.date,l.voucher_no FROM ${table} l
        WHERE l.cost_minor>0 AND l.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM ${table} r WHERE r.reversal_of=l.id)
        AND COALESCE(l.voucher_file_data,'')='' AND l.date<=?
        ${actor.role === "super_admin" ? "" : "AND l.created_by=?"} ORDER BY l.date,l.id LIMIT 100`)
        .all(shifted(-3), ...(actor.role === "super_admin" ? [] : [actor.id]));
      for (const row of rows) add(`receipt:${type}:${row.id}`, "receipt", "Receipt missing",
        `${row.voucher_no} · Expense dated ${row.date}. Attach the supporting receipt.`, ledgerPaths[type] + "?entry=" + row.id, "warning");
    }
    for (const period of this.finance.periods().filter((p) => p.status === "open" && p.start_date <= date && p.end_date >= date)) {
      for (const category of this.finance.budgetReport(period.id).categories) {
        if (!["over-budget", "warning"].includes(category.status)) continue;
        add(`budget:${period.id}:${category.id}:${category.status}`, "budget",
          category.status === "over-budget" ? "Budget exceeded" : "Budget approaching limit",
          `${category.name} · ${period.name} · BDT ${category.spent.toFixed(2)} spent of ${category.allocated.toFixed(2)}.`, "/budgets",
          category.status === "over-budget" ? "urgent" : "warning");
      }
    }
    const states = new Map(this.db.prepare("SELECT * FROM notification_states WHERE user_id=?").all(actor.id).map((s) => [s.source_key, s]));
    const now = new Date().toISOString();
    const visible = items.map((item) => ({ ...item, read: !!states.get(item.id)?.read_at, snoozedUntil: states.get(item.id)?.snoozed_until || null }))
      .filter((item) => includeSnoozed || !item.snoozedUntil || item.snoozedUntil <= now)
      .sort((a, b) => Number(a.read) - Number(b.read) || ({urgent:0,warning:1,info:2}[a.severity] - {urgent:0,warning:1,info:2}[b.severity]));
    return { items: visible, unreadCount: visible.filter((item) => !item.read).length };
  }
  update(actor, id, body) {
    requireValue(this.list(actor, true).items.some((item) => item.id === id), "Reminder not found", 404);
    requireValue(body.read === true || body.snoozeHours === 24 || body.snoozeHours === 0, "Choose mark as read or snooze for 24 hours");
    const before = this.db.prepare("SELECT * FROM notification_states WHERE user_id=? AND source_key=?").get(actor.id, id);
    const readAt = body.read === true ? new Date().toISOString() : before?.read_at || null;
    const until = body.snoozeHours === 24 ? new Date(Date.now() + 86400000).toISOString() : body.snoozeHours === 0 ? null : before?.snoozed_until || null;
    this.db.prepare(`INSERT INTO notification_states(user_id,source_key,read_at,snoozed_until) VALUES(?,?,?,?)
      ON CONFLICT(user_id,source_key) DO UPDATE SET read_at=excluded.read_at,snoozed_until=excluded.snoozed_until`).run(actor.id, id, readAt, until);
    return { ok: true };
  }
}
