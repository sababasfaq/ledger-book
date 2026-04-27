import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
create table if not exists users (
  id integer primary key autoincrement,
  name text not null,
  email text unique not null,
  picture_url text,
  info text,
  role text check (role in ('super_admin','official')) not null default 'official',
  approved integer not null default 0,
  password_hash text not null,
  require_2fa integer not null default 1
);

create table if not exists otps (
  email text not null,
  code text not null,
  expires_at integer not null
);

create table if not exists tax_types (
  id integer primary key autoincrement,
  name text unique not null,
  percentage real not null default 0,
  created_at text not null default (datetime('now','localtime'))
);

create table if not exists general_ledger (
  id integer primary key autoincrement,
  no text not null,
  date text not null,
  voucher_no text not null,
  deposit real,
  cost real,
  description text,
  signature text,
  created_by integer references users(id)
);

create table if not exists unofficial_ledger (
  id integer primary key autoincrement,
  no text not null,
  date text not null,
  voucher_no text not null,
  deposit real,
  cost real,
  description text,
  signature text,
  created_by integer references users(id)
);

create table if not exists association_ledger (
  id integer primary key autoincrement,
  no text not null,
  date text not null,
  voucher_no text not null,
  deposit real,
  description text,
  signature text,
  created_by integer references users(id)
);

create table if not exists departmental_ledger (
  id integer primary key autoincrement,
  no text not null,
  date text not null,
  voucher_no text not null,
  deposit real,
  cost real,
  description text,
  signature text,
  created_by integer references users(id)
);

create table if not exists logs (
  id integer primary key autoincrement,
  user_id integer not null references users(id),
  user_name text not null,
  role text not null,
  table_name text not null,
  action text not null,
  row_id integer,
  created_at text not null default (datetime('now','localtime'))
);

create table if not exists tax_return_challans (
  id integer primary key autoincrement,
  challan_no text not null,
  date_day text,
  date_month text,
  date_year text,
  zone text,
  circle text,
  tax_type text not null,
  tax_period text,
  depositor_name text not null,
  depositor_tin text,
  depositor_address text,
  bank_name text,
  bank_branch text,
  account_head text,
  amount_words text,
  amount real not null,
  phone text,
  officer_name text,
  note text,
  extra_comment text,
  copy_label text,
  created_by integer references users(id),
  created_at text not null default (datetime('now','localtime'))
);
`);

try {
  const cols = db.prepare("PRAGMA table_info(association_ledger)").all();
  const hasCost = cols.some((c) => c.name === "cost");

  if (!hasCost) {
    db.prepare("ALTER TABLE association_ledger ADD COLUMN cost REAL").run();
    console.log("Added `cost` column to association_ledger");
  }

  const depositCol = cols.find((c) => c.name === "deposit");
  const needsNullableDeposit = depositCol && depositCol.notnull === 1;

  if (needsNullableDeposit) {
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE association_ledger_new (
        id integer primary key autoincrement,
        no text not null,
        date text not null,
        voucher_no text not null,
        deposit real,
        cost real,
        description text,
        signature text,
        created_by integer references users(id)
      );
    `);

    db.exec(`
      INSERT INTO association_ledger_new (id,no,date,voucher_no,deposit,cost,description,signature,created_by)
      SELECT id,no,date,voucher_no,deposit,
             CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('association_ledger') WHERE name='cost')>0
                  THEN cost ELSE NULL END,
             description,signature,created_by
      FROM association_ledger;
    `);

    db.exec(`DROP TABLE association_ledger;`);
    db.exec(`ALTER TABLE association_ledger_new RENAME TO association_ledger;`);
    db.exec("COMMIT");
    console.log("Migrated association_ledger: deposit is now nullable.");
  }
} catch (e) {
  console.error("association_ledger schema check/migration failed:", e);
}

for (const tableName of [
  "general_ledger",
  "unofficial_ledger",
  "association_ledger",
  "departmental_ledger",
]) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasTaxTypeId = cols.some((c) => c.name === "tax_type_id");
    if (!hasTaxTypeId) {
      db.prepare(
        `ALTER TABLE ${tableName} ADD COLUMN tax_type_id integer references tax_types(id)`
      ).run();
      console.log(`Added tax_type_id to ${tableName}`);
    }
  } catch (e) {
    console.error(`Failed adding tax_type_id to ${tableName}:`, e);
  }
}

try {
  const challanCols = db.prepare("PRAGMA table_info(tax_return_challans)").all();

  const hasBankName = challanCols.some((c) => c.name === "bank_name");
  if (!hasBankName) {
    db.prepare("ALTER TABLE tax_return_challans ADD COLUMN bank_name TEXT").run();
    console.log("Added bank_name to tax_return_challans");
  }

  const hasCopyLabel = challanCols.some((c) => c.name === "copy_label");
  if (!hasCopyLabel) {
    db.prepare("ALTER TABLE tax_return_challans ADD COLUMN copy_label TEXT").run();
    console.log("Added copy_label to tax_return_challans");
  }

  const hasTaxPeriod = challanCols.some((c) => c.name === "tax_period");
  if (!hasTaxPeriod) {
    db.prepare("ALTER TABLE tax_return_challans ADD COLUMN tax_period TEXT").run();
    console.log("Added tax_period to tax_return_challans");
  }
} catch (e) {
  console.error("tax_return_challans schema migration failed:", e);
}

export { db };