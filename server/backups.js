import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { HttpError, requireValue, textValue, writeAudit } from "./finance.js";

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const auditTables = new Set(["audit_events"]);
export class BackupService {
  constructor(db, directory) {
    this.db = db;
    this.directory = path.resolve(directory);
    this.busy = false;
    this.timer = null;
    fs.mkdirSync(this.directory, { recursive: true });
  }
  settings() {
    return this.db.prepare("SELECT * FROM backup_settings WHERE id=1").get();
  }
  resolve(id) {
    requireValue(
      typeof id === "string" && /^[a-z0-9][a-z0-9._-]*\.sqlite$/i.test(id),
      "Invalid backup ID",
    );
    const filename = path.resolve(this.directory, id);
    requireValue(
      path.dirname(filename) === this.directory && fs.existsSync(filename),
      "Backup not found",
      404,
    );
    requireValue(!fs.lstatSync(filename).isSymbolicLink(), "Invalid backup");
    return filename;
  }
  list() {
    return fs
      .readdirSync(this.directory)
      .filter((id) => /^[a-z0-9][a-z0-9._-]*\.sqlite$/i.test(id))
      .map((id) => {
        const filename = this.resolve(id),
          stat = fs.statSync(filename);
        return {
          id,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          compatible: !/^(before-finance-upgrade|before-assistant-tools-upgrade)-/.test(id),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(kind = "manual", actor = null) {
    requireValue(!this.busy, "Another backup or restore is running", 409);
    this.busy = true;
    try {
      return await this.createUnlocked(kind, actor);
    } finally {
      this.busy = false;
    }
  }
  async createUnlocked(kind, actor) {
    const id =
      kind +
      "-" +
      new Date().toISOString().replaceAll(/[:.]/g, "-") +
      "-" +
      randomUUID().slice(0, 8) +
      ".sqlite";
    const target = path.join(this.directory, id);
    try {
      await this.db.backup(target);
      const check = new Database(target, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        requireValue(
          check.pragma("integrity_check", { simple: true }) === "ok",
          "Backup integrity check failed",
          500,
        );
      } finally {
        check.close();
      }
      const result = {
        id,
        size: fs.statSync(target).size,
        createdAt: new Date().toISOString(),
        compatible: true,
      };
      this.db
        .prepare(
          "UPDATE backup_settings SET last_success_at=?,last_error=NULL WHERE id=1",
        )
        .run(result.createdAt);
      writeAudit(
        this.db,
        actor,
        "backups",
        "BACKUP",
        null,
        null,
        result,
        kind + " backup",
      );
      return result;
    } catch (error) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      this.db
        .prepare("UPDATE backup_settings SET last_error=? WHERE id=1")
        .run(error.message);
      throw error;
    }
  }
  updateSettings(actor, body) {
    requireValue(
      typeof body.enabled === "boolean",
      "Enabled must be true or false",
    );
    const hours = Number(body.intervalHours),
      keep = Number(body.retainCount);
    requireValue(
      Number.isInteger(hours) && hours >= 1 && hours <= 168,
      "Choose a backup interval from 1 to 168 hours",
    );
    requireValue(
      Number.isInteger(keep) && keep >= 1 && keep <= 100,
      "Keep between 1 and 100 scheduled backups",
    );
    return this.db.transaction(() => {
      const before = this.settings();
      this.db
        .prepare(
          "UPDATE backup_settings SET enabled=?,interval_hours=?,retain_count=? WHERE id=1",
        )
        .run(Number(body.enabled), hours, keep);
      const after = this.settings();
      writeAudit(
        this.db,
        actor,
        "backup_settings",
        "EDIT",
        1,
        before,
        after,
        "Updated automatic backup schedule",
      );
      return after;
    })();
  }
  async tick(now = Date.now()) {
    const settings = this.settings();
    if (!settings.enabled || this.busy) return;
    const latest = this.list().find((file) => file.id.startsWith("scheduled-"));
    if (
      latest &&
      now - new Date(latest.createdAt).getTime() <
        settings.interval_hours * 3600000
    )
      return;
    await this.create("scheduled");
    const scheduled = this.list().filter((file) =>
      file.id.startsWith("scheduled-"),
    );
    for (const file of scheduled.slice(settings.retain_count))
      fs.unlinkSync(this.resolve(file.id));
  }
  start() {
    if (this.timer) return;
    const tick = () =>
      this.tick().catch((error) =>
        console.error("Scheduled backup failed:", error.message),
      );
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
    tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async restore(actor, id, body) {
    requireValue(!this.busy, "Another backup or restore is running", 409);
    requireValue(
      body.confirmation === "RESTORE",
      "Type RESTORE to confirm recovery",
    );
    const reason = textValue(body.reason, "Restore reason", 1000, true);
    const source = this.resolve(id);
    this.busy = true;
    let attached = false;
    const foreignKeys = this.db.pragma("foreign_keys", { simple: true });
    try {
      // Check the copy independently before touching the running database.
      const copy = new Database(source, {
        readonly: true,
        fileMustExist: true,
      });
      let tables;
      try {
        requireValue(
          copy.pragma("integrity_check", { simple: true }) === "ok",
          "The selected backup failed its integrity check",
          422,
        );
        const version = copy
          .prepare("SELECT value FROM finance_meta WHERE key='schema_version'")
          .get();
        requireValue(
          version?.value === "1",
          "This backup needs an offline migration before it can be restored",
          422,
        );
        requireValue(
          copy.pragma("foreign_key_check").length === 0,
          "The backup contains broken relationships",
          422,
        );
        const currentTables = this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .all()
          .map((r) => r.name);
        const backupTables = copy
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
          )
          .all()
          .map((r) => r.name);
        requireValue(
          currentTables.length === backupTables.length &&
            currentTables.every((table) => backupTables.includes(table)),
          "Backup schema does not match this version of the app",
          422,
        );
        tables = currentTables.filter((table) => !auditTables.has(table));
        for (const table of tables) {
          const expected = this.db
            .prepare("PRAGMA table_info(" + quote(table) + ")")
            .all()
            .map((c) => c.name)
            .join(",");
          const actual = copy
            .prepare("PRAGMA table_info(" + quote(table) + ")")
            .all()
            .map((c) => c.name)
            .join(",");
          requireValue(
            expected === actual,
            "Incompatible backup table: " + table,
            422,
          );
        }
        requireValue(
          copy
            .prepare(
              "SELECT 1 FROM users WHERE role='super_admin' AND approved=1",
            )
            .get(),
          "The backup has no approved Chairman account",
          422,
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(422, "The backup is incompatible or damaged");
      } finally {
        copy.close();
      }
      const safety = await this.createUnlocked("before-restore", actor);
      const currentVersion = this.db
        .prepare("SELECT COALESCE(MAX(token_version),0) AS version FROM users")
        .get().version;
      this.db.prepare("ATTACH DATABASE ? AS recovery").run(source);
      attached = true;
      this.db.pragma("foreign_keys = OFF");
      this.db.transaction(() => {
        // The audit table is deliberately retained. A recovery must not erase its own history.
        for (const table of tables) this.db.exec("DELETE FROM " + quote(table));
        for (const table of tables)
          this.db.exec(
            "INSERT INTO " +
              quote(table) +
              " SELECT * FROM recovery." +
              quote(table),
          );
        for (const table of tables) {
          this.db
            .prepare("DELETE FROM sqlite_sequence WHERE name=?")
            .run(table);
          this.db
            .prepare(
              "INSERT INTO sqlite_sequence(name,seq) SELECT name,seq FROM recovery.sqlite_sequence WHERE name=?",
            )
            .run(table);
        }
        this.db
          .prepare("UPDATE users SET token_version=token_version+?")
          .run(currentVersion + 1);
        requireValue(
          this.db.pragma("foreign_key_check").length === 0,
          "Restore failed relationship validation",
          422,
        );
        writeAudit(
          this.db,
          actor,
          "backups",
          "RESTORE",
          null,
          { restoredFrom: id },
          { safetyBackup: safety.id, allSessionsRevoked: true },
          reason,
        );
      })();
      return { ok: true, safetyBackup: safety.id, reauthenticate: true };
    } finally {
      if (attached) this.db.exec("DETACH DATABASE recovery");
      this.db.pragma("foreign_keys = " + (foreignKeys ? "ON" : "OFF"));
      this.busy = false;
    }
  }
}
