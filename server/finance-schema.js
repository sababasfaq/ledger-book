import { attachmentHash } from "./receipt-files.js";

export const LEDGERS = {
  general: "general_ledger",
  unofficial: "unofficial_ledger",
  association: "association_ledger",
  departmental: "departmental_ledger",
};

export function migrateFinance(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS finance_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS financial_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
        closed_at TEXT,
        closed_by INTEGER,
        closing_summary TEXT
      );
      CREATE TABLE IF NOT EXISTS ledger_openings (
        ledger_type TEXT PRIMARY KEY,
        amount_minor INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS category_budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_id INTEGER NOT NULL REFERENCES financial_periods(id),
        category_id INTEGER NOT NULL REFERENCES expense_categories(id),
        amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
        alert_percent INTEGER NOT NULL DEFAULT 80 CHECK(alert_percent BETWEEN 1 AND 100),
        UNIQUE(period_id, category_id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT NOT NULL,
        role TEXT NOT NULL,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        row_id INTEGER,
        before_data TEXT,
        after_data TEXT,
        reason TEXT,
        legacy_log_id INTEGER UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE IF NOT EXISTS backup_settings (
        id INTEGER PRIMARY KEY CHECK(id=1),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        interval_hours INTEGER NOT NULL DEFAULT 24 CHECK(interval_hours BETWEEN 1 AND 168),
        retain_count INTEGER NOT NULL DEFAULT 14 CHECK(retain_count BETWEEN 1 AND 100),
        last_success_at TEXT,
        last_error TEXT
      );
      INSERT OR IGNORE INTO backup_settings(id) VALUES(1);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at, id);
      CREATE TRIGGER IF NOT EXISTS audit_events_no_update
        BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
        BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;
    `);
    const addColumn = (table, column, definition) => {
      if (
        db
          .prepare("PRAGMA table_info(" + table + ")")
          .all()
          .some((c) => c.name === column)
      )
        return false;
      db.exec(
        "ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition,
      );
      return true;
    };
    addColumn("instructions", "due_date", "TEXT");
    db.exec(`CREATE TABLE IF NOT EXISTS notification_states (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_key TEXT NOT NULL,
      read_at TEXT,
      snoozed_until TEXT,
      PRIMARY KEY(user_id,source_key)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS posting_requests (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL,
      ledger_type TEXT NOT NULL,
      entry_id INTEGER NOT NULL,
      body_hash TEXT NOT NULL,
      PRIMARY KEY(user_id,request_key)
    )`);
    addColumn("users", "token_version", "INTEGER NOT NULL DEFAULT 0");
    for (const [type, table] of Object.entries(LEDGERS)) {
      addColumn(table, "voucher_file_data", "TEXT");
      addColumn(table, "voucher_file_name", "TEXT");
      const newHash = addColumn(table, "receipt_hash", "TEXT");
      addColumn(table, "receipt_number", "TEXT");
      addColumn(table, "receipt_merchant", "TEXT");
      if (newHash) {
        const updateHash = db.prepare("UPDATE " + table + " SET receipt_hash=? WHERE id=?");
        const readBatch = db.prepare("SELECT id,voucher_file_data FROM " + table + " WHERE id>? AND voucher_file_data IS NOT NULL ORDER BY id LIMIT 10");
        let lastId = 0;
        for (;;) {
          // Release the SELECT before writing on this connection; bound memory for older databases.
          const rows = readBatch.all(lastId);
          if (!rows.length) break;
          for (const row of rows) updateHash.run(attachmentHash(row.voucher_file_data), row.id);
          lastId = rows.at(-1).id;
        }
      }
      db.exec("CREATE INDEX IF NOT EXISTS idx_" + table + "_receipt_hash ON " + table + "(receipt_hash)");
      const newDeposit = addColumn(
        table,
        "deposit_minor",
        "INTEGER NOT NULL DEFAULT 0",
      );
      const newCost = addColumn(
        table,
        "cost_minor",
        "INTEGER NOT NULL DEFAULT 0",
      );
      db.exec("CREATE INDEX IF NOT EXISTS idx_" + table + "_duplicate_amounts ON " + table + "(date,deposit_minor,cost_minor)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_" + table + "_receipt_reference ON " + table + "(lower(trim(COALESCE(receipt_number,voucher_no))))");
      addColumn(
        table,
        "category_id",
        "INTEGER REFERENCES expense_categories(id)",
      );
      addColumn(
        table,
        "financial_period_id",
        "INTEGER REFERENCES financial_periods(id)",
      );
      addColumn(table, "entry_kind", "TEXT NOT NULL DEFAULT 'posted'");
      addColumn(table, "reversal_of", "INTEGER REFERENCES " + table + "(id)");
      addColumn(table, "correction_reason", "TEXT");
      addColumn(table, "created_at", "TEXT");
      const newTax = addColumn(table, "tax_name_snapshot", "TEXT");
      addColumn(table, "tax_rate_snapshot", "REAL");
      if (newDeposit)
        db.exec(
          "UPDATE " +
            table +
            " SET deposit_minor=CAST(ROUND(COALESCE(deposit,0)*100) AS INTEGER)",
        );
      if (newCost)
        db.exec(
          "UPDATE " +
            table +
            " SET cost_minor=CAST(ROUND(COALESCE(cost,0)*100) AS INTEGER)",
        );
      if (newTax) {
        db.exec(
          "UPDATE " +
            table +
            " SET tax_name_snapshot=(SELECT name FROM tax_types WHERE id=tax_type_id), tax_rate_snapshot=(SELECT percentage FROM tax_types WHERE id=tax_type_id)",
        );
      }
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_" +
          table +
          "_reversal ON " +
          table +
          "(reversal_of) WHERE reversal_of IS NOT NULL",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_" +
          table +
          "_period_category ON " +
          table +
          "(financial_period_id, category_id, date, id)",
      );
      db.prepare(
        "INSERT OR IGNORE INTO ledger_openings(ledger_type) VALUES(?)",
      ).run(type);
    }
    db.exec(`
      INSERT OR IGNORE INTO audit_events(user_id,user_name,role,table_name,action,row_id,legacy_log_id,created_at)
        SELECT user_id,user_name,role,table_name,action,row_id,id,created_at FROM logs;
    `);
    db.prepare("INSERT OR REPLACE INTO finance_meta(key,value) VALUES('receipt_tools_version','1')").run();
    if (
      !db.prepare("SELECT 1 FROM finance_meta WHERE key='schema_version'").get()
    ) {
      for (const name of [
        "Equipment",
        "Events",
        "Maintenance",
        "Utilities",
        "Other",
      ]) {
        db.prepare(
          "INSERT OR IGNORE INTO expense_categories(name) VALUES(?)",
        ).run(name);
      }
      // Calendar years are migration defaults. Administrators can add custom, non-overlapping years.
      const currentYear = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Dhaka",
          year: "numeric",
        }).format(new Date()),
      );
      const years = new Set([currentYear]);
      for (const table of Object.values(LEDGERS)) {
        for (const row of db
          .prepare(
            "SELECT DISTINCT substr(date,1,4) AS year FROM " +
              table +
              " WHERE date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'",
          )
          .all()) {
          const year = Number(row.year);
          if (year >= 1900 && year <= 2200) years.add(year);
        }
      }
      for (const year of [...years].sort()) {
        db.prepare(
          "INSERT INTO financial_periods(name,start_date,end_date) VALUES(?,?,?)",
        ).run(String(year), year + "-01-01", year + "-12-31");
      }
      for (const table of Object.values(LEDGERS)) {
        db.exec(
          "UPDATE " +
            table +
            " SET financial_period_id=(SELECT id FROM financial_periods WHERE " +
            table +
            ".date BETWEEN start_date AND end_date)",
        );
      }
      db.prepare(
        "INSERT INTO finance_meta(key,value) VALUES('schema_version','1')",
      ).run();
    }
  })();
}
