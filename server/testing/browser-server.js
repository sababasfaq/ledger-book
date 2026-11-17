import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "browser-test-only-secret";
process.env.ADMIN_PASSWORD = "browser-test-admin-password";
process.env.DISABLE_BACKUP_SCHEDULER = "true";
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "dept-expense-browser-"),
);
process.env.BACKUP_DIR = directory;
const { app, db, backups, finance } = await import("../server.js");
const { browserAiFixture } = await import("./ai-fixture.js");
app.locals.ai = browserAiFixture(db, finance);
const server = app.listen(4174, "127.0.0.1", () =>
  console.log("Isolated browser test API listening on 4174"),
);
const stop = () => {
  backups.stop();
  server.close();
  db.close();
  if (
    path.dirname(directory) === path.resolve(os.tmpdir()) &&
    path.basename(directory).startsWith("dept-expense-browser-")
  )
    fs.rmSync(directory, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
