# Department Expense / Ledger Book

A React and Express application for departmental ledgers, expense budgets, financial periods, tax challans and office instructions. Data is stored in SQLite.

## Run locally

Install dependencies in both folders:

```powershell
cd server
npm ci
cd ../client
npm ci
```

Create `server/.env` and `client/.env` using the corresponding `.env.example` files. Keep existing configuration when upgrading an installation.

Start the API in one terminal:

```powershell
cd server
npm start
```

Start the client in another terminal:

```powershell
cd client
npm run dev
```

The client normally runs at `http://localhost:5173` and the API at `http://localhost:4000`.

A new database creates `chairman@example.com` using `ADMIN_PASSWORD`. Set a unique password of at least 12 characters before the first start. Existing accounts and passwords remain available. The JWT secret must be set before starting the server.

`better-sqlite3` is a native dependency. Reinstall or rebuild server dependencies if you change the Node.js runtime.

## Upgrade an existing installation

Restart the API after installing the new code. The first upgrade automatically creates a SQLite backup named `before-finance-upgrade-*.sqlite` in `server/backups` (or `BACKUP_DIR`) before changing the existing schema.

The migration preserves existing ledger rows, creates integer poisha columns, carries over old activity logs, and creates calendar-year periods for existing dated entries plus the current year. These periods start open. Initial opening balances start at zero; legacy entries have no category.

Use **Budgets & Categories** to create your categories and **Financial Periods** to review the generated periods. The Chairman can categorize old entries through **Edit entry details** while their period is open. The first period’s opening balances can be set with an audit reason. Edit empty periods or create future periods with your institution’s financial-year dates. Ranges cannot overlap.

Tax names and rates are captured when each new entry is posted. Existing entries receive snapshots of the tax settings available during migration; previously overwritten historical rates cannot be reconstructed.

Generated databases, backups and environment files are ignored for new files. Files already tracked in Git remain tracked until explicitly removed from its index.

## Budgets and categories

- The Chairman creates, renames and archives categories. Archiving retains history and prevents new entries from using that category.
- Each category can have one budget per financial period, covering all four ledgers.
- Budgets show allocation, net spending, remaining funds and configurable usage alerts. The dashboard shows the current period’s budget summary.
- Net category spending is original costs less expense reversals posted in that period. A reversal in a later period adjusts that later period, without rewriting a closed year.
- Legacy uncategorized spending is shown separately. Deposits do not count as category spending.
- Budgets are advisory. Going over an allocation shows an alert and does not prevent posting.

## Financial periods and corrections

All new posting and imports require a date in an open financial period. Money is validated to two decimal places and calculated in integer poisha.

The first period has configurable initial balances. Later opening balances carry forward all earlier movements automatically. Ledger balances are calculated before applying search, category or date filters.

Financial amounts, dates and voucher numbers are fixed after posting. The Chairman can edit a description, signature or category in an open period with a recorded reason. A reversed original and its reversal keep the same category.

To correct a financial amount:

1. Choose **Reverse** beside the original entry.
2. Select a correction date in an open period and give a reason.
3. Post a replacement entry with the correct amount if needed.

The original remains in place and the opposite entry links to it. Each original can be reversed once. Closed-period entries can be corrected through reversals in a later open period.

Close periods in chronological order from **Financial Periods**. Closing saves a report of ledger balances and category budgets, and locks posting, details, budgets, period dates and opening balances for that period. Closing cannot be undone through the normal app. Download open or saved closing reports as PDF.

The existing Annual / Monthly Reports screen remains a calendar-year report; financial-year closing reports are under Financial Periods.

## Audit history

The Chairman’s **Audit History** screen supports action, area, person/reason and date filters, pagination and before/after inspection. New financial changes and their audit entries commit in the same transaction.

Audit events retain the actor’s identity, timestamp and reason. Database triggers prevent updates or deletion through normal SQL statements. Voucher bytes, profile images, password hashes and tokens are excluded from snapshots. Old log entries are retained and marked as predating detailed snapshots.

Audit tables are append-only within the application. A database administrator with direct filesystem/schema access can still replace files or change triggers.

## Spreadsheet import

Open **Data Tools → Import ledger**, or select **Import** from a ledger.

1. Download the Excel template.
2. Fill in `Date`, `Voucher No`, `Deposit`, `Cost`, `Category`, `Description`, `Signature` and optional `Tax Type`.
3. Upload `.xlsx`, `.xls` or `.csv` (up to 5 MB), and choose a worksheet.
4. Preview validation results. Duplicates, unknown/archived categories, invalid money, invalid dates and closed periods are flagged.
5. Select valid rows and import them.

Use ISO `YYYY-MM-DD` dates or Excel date cells. The first row must contain headers. There is a limit of 1,000 data rows per import. Category and Tax Type names must already exist. Duplicate detection compares voucher number (case insensitive), date, deposit and cost within the destination ledger and the worksheet.

Every selected row is revalidated at commit. The selection is imported in one transaction; any failure rolls it all back. Each imported entry is attributed to the signed-in official and included in audit history.

SheetJS is installed from its official distribution URL; network access to `cdn.sheetjs.com` is needed when installing dependencies.

## Backups and recovery

Only the Chairman can use **Data Tools → Backups & recovery**.

- Manual and automatic backups use SQLite’s online backup API, including committed WAL data, followed by an integrity check.
- Automatic backups are enabled by default every 24 hours while the API is running. The scheduler checks once a minute and makes an initial scheduled copy if none exists.
- The default retention is 14 scheduled copies. Manual, pre-upgrade and pre-restore safety copies are kept.
- Download copies to storage away from the server. They contain user account hashes, attachments and financial records. Environment files are not included.
- In-app recovery accepts compatible copies from the server’s backup list. It requires the current Chairman password, a reason and the word `RESTORE`.
- Recovery validates the schema, integrity and foreign keys, creates a safety copy, restores application data in a transaction, retains the current detailed audit trail, and invalidates all existing sessions. Sign in with credentials from the restored copy.

To recover a downloaded copy, place it in `BACKUP_DIR` with a plain `.sqlite` filename; a compatible current-version copy can then be restored from the app.

A pre-upgrade or differently versioned backup needs offline recovery:

1. Stop the API.
2. Move the current database and any matching `-wal` / `-shm` files together into a separate safety directory.
3. Copy the selected SQLite backup to the configured database path.
4. Start the API so migrations run.

Offline file replacement also rolls back the database’s audit history. Prefer in-app recovery for compatible copies.

For a production deployment, keep backups on persistent storage and ensure that a single API process owns this SQLite database and its scheduler.

## Validation

API and financial-rule tests use an isolated in-memory database and temporary backup directory:

```powershell
cd server
npm test
```

Browser tests start their own API and Vite servers on ports 4174 and 4175 and use an isolated database:

```powershell
cd client
npm run test:e2e
npm run build
```

Windows browser tests use installed Microsoft Edge in headless mode. On other systems, install Playwright Chromium first with `npx playwright install chromium`.

The browser test covers categories, budgets, posting, metadata edits, reversals, spreadsheet errors and duplicate detection, PDF export, audit inspection, backup download/restore, financial-period closing and a mobile viewport.

## Code map

- `server/finance-schema.js`: additive finance migrations.
- `server/finance.js`: budgets, periods, exact amounts, posting, reversals, import validation and audit snapshots.
- `server/finance-routes.js`: API permissions, audit querying and finance routes.
- `server/backups.js`: checked snapshots, scheduling, retention and transactional recovery.
- `client/src/components/LedgerPage.jsx`: shared behavior for all four ledgers.
- `client/src/pages/BudgetsPage.jsx`, `PeriodsPage.jsx`, `DataToolsPage.jsx`: finance administration and recovery.
- `server/test/finance.test.js`, `client/e2e/finance.spec.js`: integration and browser validation.

## Local receipt scanning and AI assistant

The app can process printed Bangla and English receipts and answer questions using a local model. It does not send receipt images or application records to a cloud AI API.

### One-time setup on Windows

Install the updated server dependencies, then run:

```powershell
cd server
npm ci
npm run ai:setup
```

Setup downloads English and Bengali Tesseract language files, the portable official Ollama runtime and `qwen3:1.7b`. The language model is about 1.4 GB; the runtime archive and unpacked libraries require additional disk space. Setup verifies the runtime archive against the SHA-256 digest provided by the official GitHub release.

Downloaded files live in `server/.local-ai`, which is excluded from Git and financial database backups. Initial downloads require internet access. Once the files are installed, receipt processing, assistant requests and runtime restarts work offline.

The setup process starts Ollama in the background at `127.0.0.1:11434`, keeps model files under this project and disables Ollama cloud functionality. It does not register a Windows startup service.

```powershell
npm run ai:start
npm run ai:stop
```

`ai:start` reuses installed files and models without downloading them again. `ai:stop` verifies that the saved process belongs to this project's portable runtime before stopping it. It leaves independently installed Ollama processes alone.

Restart the API and frontend after installing the code. Open **AI Assistant** and use **Refresh status** to check readiness. Start the local runtime again after restarting Windows.

### Read a receipt into an entry draft

1. Open any ledger and choose **Add entry**.
2. Under **Fill from a receipt**, choose a PNG, JPEG or WebP image up to 2 MB.
3. Select **Read receipt**.
4. Compare the source image, extracted text and suggested fields.
5. Select the fields to use, confirm that you reviewed them and confirmed BDT amounts, then select **Apply reviewed fields**.
6. Review the resulting form and choose **Post entry**.

Applying a scan does not save a ledger entry. The image stays attached to the draft. A receipt number is offered as a voucher reference, with a separate review selection; an existing voucher reference is not selected for replacement by default. Signature fields are never inferred.

Extraction handles Bangla numerals, numeric dates and English/Bangla month names. Ambiguous slash dates are interpreted as day/month/year and flagged. A named category suggestion must match an existing active category. Tax selections are suggested only when an extracted rate matches a single configured tax type. The app never determines legal tax rates from a model.

Missing fields, low OCR quality, several dates, duplicates, foreign currencies and closed periods are flagged. Foreign-currency totals are not applied as BDT costs. The server still enforces normal financial-period and amount validation when the user posts.

The OCR quality number describes text recognition, not a guarantee that each financial field is correct. Clear printed receipts are the initial target; handwriting, blur, shadows, missing totals and unusual layouts can require manual entry.

OCR uses local Tesseract.js with Bengali and English trained data. Images are rotated, resized and normalized locally using Sharp. The local language model refines field suggestions; identified amounts and dates must still be grounded in the OCR text. If the language model is unavailable, OCR and receipt rules remain usable and the result is labelled accordingly.

### Ask about departmental work

Open **AI Assistant** and select a financial period and ledger scope. Example questions:

- “How much did we spend on equipment this financial period?”
- “এই মাসে কত টাকা খরচ হয়েছে?”
- “Which categories are over budget?”
- “Show my pending instructions.”
- “Find expenses without receipt attachments.”
- “Prepare an expense report.”
- “How do I scan a receipt?”

The model selects from a fixed set of read-only report operations. The application validates the scope and calculates financial figures from integer-poisha records, including reversals. It does not run model-generated SQL. Each response shows its date range and source. Budget allocations always cover all four ledgers.

Officials see their own pending instructions. Chairman instruction summaries show completion counts. User account secrets, other officials' private submissions, attachment bytes and backup contents are not assistant inputs.

The assistant cannot post entries, approve users, change budgets, reverse transactions, close periods or restore backups. Those operations remain in their normal review screens. Requests to prepare expense reports can produce downloadable text drafts containing computed figures.

### Chat from any page

After signing in, select **AI Chat** in the bottom-right corner. Ask in Bangla or English about the app, studying, coding, translation, writing emails or drafting documents. The chat uses the installed local model and has no live web access. Model quality and response speed depend on the installed model and computer.

Minimizing the chat or navigating to another page keeps the current conversation. Use the expand button to continue the same conversation on **AI Assistant**, where you can also choose a financial period and ledger scope, run quick reports and download expense report drafts. The last six messages provide follow-up context; financial figures are calculated again from saved records. Conversation text stays in browser memory, is sent only to the local API/model, and clears on reload, sign-out or **Clear conversation**. Audit events contain the operation and report scope, not the conversation text.

If the chat reports that local AI is offline, run `npm run ai:start` from the `server` folder and select **Check connection**. Use `npm run ai:setup` first if the runtime or model has not been installed.

### Duplicate review and supporting receipts

Manual posting now checks all four ledgers for matching voucher/date/amount combinations, matching receipt references, and identical decoded attachment bytes. Receipt scanning uses the same checks. Reversed entries are excluded so a corrected replacement can reuse its receipt. Spreadsheet import also checks matching entries across ledgers.

Possible matches link to the existing entries. Posting a legitimate separate transaction requires checking the review box and giving a reason; overrides are recorded in audit history. Checks run again on the server when posting. Attachment hashes detect identical files; they do not establish that differently cropped, resized or recompressed images are the same receipt. Extracted receipt references provide an additional check.

Use **Attach receipt** beside an entry without documentation to add a supporting image or PDF (up to 2 MB). The entry creator or Chairman can add it with an audit reason, including after the financial period closes. This adds documentation without changing posted amounts or closing figures. Existing attachments cannot be replaced through this action.

### Batch receipts

Open **Batch Receipts** from navigation or a ledger. Choose up to 10 PNG, JPEG or WebP images, each up to 2 MB, and select **Read receipts**. Images are processed sequentially on the local OCR service. Reading never posts entries.

Review and correct each draft's date, voucher reference, BDT cost, category, tax selection and description. Mark each draft reviewed, then select the expenses to post. Editing draft fields clears its review confirmation. Foreign-currency totals must be converted and checked manually. A positive cost, category and date in an open period are required.

**Post selected** posts each selected, reviewed draft separately. Successful drafts link to their posted entries and cannot be posted again from the batch. Failed drafts remain for correction and duplicate review; retrying them does not resubmit successful drafts. Drafts and source images stay in page memory and are lost when leaving or reloading the page. The page shows repeated images within the batch, and posting rechecks duplicates against committed entries.

Manual and batch drafts include a stable request ID. If an identical request is retried after the server commits it, the API returns the original entry instead of creating another. Reusing that request ID with changed content is rejected.

### Financial AI evidence

Financial answers include **View source entries**, with links opening the exact ledger entry and its attachment. Figures use all matching records; the source list shows up to the latest 20 entries and states the total count. Reversals remain visible in the evidence. General model guidance is labelled separately from saved-record reports.

Common spending, budget, missing-receipt and instruction questions in English or Bangla route directly to validated report operations. Supported app workflow questions also use a written guide. These requests work without the language model. Ambiguous questions, free-form follow-ups and general chat still require the local model, whose language quality varies.

### Reminders and instruction deadlines

Open **Reminders** or the notification bell for current, account-specific reminders. Officials see their own incomplete instructions and missing receipts; the Chairman also sees pending account approvals and instruction progress. Instruction deadlines can be set when creating a task or changed with **Save deadline**. Due-soon reminders use a three-day window; overdue reminders update automatically.

Expense entries without attachment data generate reminders after three days. Reversed entries are excluded. Budget alerts use the configured category threshold and allocation for the currently active open financial period. Mark reminders read or snooze them for 24 hours; state survives reloads. Use **Include snoozed** to restore a snoozed item early. Resolved conditions disappear automatically. The app refreshes reminders every minute while open and after relevant changes; reminders are in-app, without email or desktop delivery.

On the first upgrade, the API creates `before-assistant-tools-upgrade-*.sqlite` before adding receipt metadata, reminder state and instruction deadlines. Existing rows and attachments are retained, and existing attachments receive hashes. Pre-upgrade copies require the documented offline migration/recovery procedure.

Quick report buttons run directly against saved records and work without the language model. Free-form Bangla/English questions require the runtime and model to be available. Conversation history is kept in page memory and can be cleared; the app does not store a chat transcript. Audit events record the requested operation and report scope, or selected receipt metadata, without saving raw OCR text or image bytes.

### Runtime settings and performance

Optional `server/.env` settings:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
LOCAL_AI_THREADS=4
LOCAL_AI_USE_GPU=false
# OCR_LANG_PATH=./.local-ai/tessdata
```

Remote URLs, authenticated URLs, redirects and cloud model names are rejected. Point `OCR_LANG_PATH` at a local directory containing `eng.traineddata` and `ben.traineddata` if using another installation.

CPU inference is the default because the automatic GPU path stalled during verification on this workspace's GTX 1650. Set `LOCAL_AI_USE_GPU=true` only after testing the installed runtime and driver on the target machine. One receipt and one model request are processed at a time. OCR memory is released before model refinement; the model unloads after its short idle period.

The first request can take longer while files load. Accuracy and speed vary with the computer, receipt format and image quality. The model's text explanations are suggestions; saved-record figures and normal posting validation remain authoritative.

### AI validation

```powershell
cd server
npm test
npm run ai:verify
```

The regular suite uses deterministic local-provider fixtures with isolated databases to test parsing, review warnings, permissions, unsupported model outputs and exact financial answers. `ai:verify` additionally uses the installed real OCR engine and model on synthetic printed English/Bangla receipts, then checks English/Bangla financial questions against an in-memory database. Its generated test images are under `server/.local-ai/verification`; it never modifies the production database.

Browser tests use an explicitly injected fixture provider so that UI checks remain repeatable and do not require model downloads:

```powershell
cd client
npm run test:e2e
npm run build
```

Local AI code lives in `server/local-ai-runtime.js`, `server/receipt-utils.js`, `server/ai-service.js` and `server/ai-routes.js`. The receipt review UI is `client/src/components/ReceiptScanner.jsx`; the assistant screen is `client/src/pages/AssistantPage.jsx`.
