import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";

test("budgets, ledgers, imports, audit history, closing and recovery", async ({
  page,
}) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const login = async () => {
    await page
      .getByLabel("Email or Name", { exact: true })
      .fill("chairman@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("browser-test-admin-password");
    await page.getByRole("button", { name: "Submit login" }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
  };
  await page.goto("/");
  await login();
  await test.step("create a category and a period budget", async () => {
    await page
      .getByRole("link", { name: "Budgets & Categories", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Budgets & Categories", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New category", exact: true })
      .click();
    let modal = page.getByRole("dialog");
    await modal.getByLabel("Category name").fill("Browser Travel");
    await modal
      .getByRole("button", { name: "Save category", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await page.getByRole("button", { name: "Set budget", exact: true }).click();
    modal = page.getByRole("dialog");
    await modal
      .getByLabel("Category", { exact: true })
      .selectOption({ label: "Browser Travel" });
    await modal.getByLabel("Allocation (BDT)", { exact: true }).fill("100");
    await modal
      .getByLabel("Reason for allocation or adjustment")
      .fill("Browser test allocation");
    await modal
      .getByRole("button", { name: "Save budget", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(page.getByText("Budget saved", { exact: true })).toBeVisible();
  });
  const post = async (voucher, deposit, cost) => {
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Voucher number", { exact: true }).fill(voucher);
    if (deposit)
      await modal.getByLabel("Deposit (BDT)", { exact: true }).fill(deposit);
    if (cost) {
      await modal.getByLabel("Cost (BDT)", { exact: true }).fill(cost);
      await modal
        .getByLabel("Expense category", { exact: true })
        .selectOption({ label: "Browser Travel" });
    }
    await modal
      .getByRole("button", { name: "Post entry", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(page.getByText(voucher, { exact: true })).toBeVisible();
  };
  await test.step("post and correct ledger entries", async () => {
    await page
      .getByRole("link", { name: "General Ledger", exact: true })
      .click();
    await post("UI-DEPOSIT", "1000", "");
    await post("UI-COST", "", "80");
    await page
      .getByRole("button", { name: "Edit details for UI-COST", exact: true })
      .click();
    let modal = page.getByRole("dialog");
    await modal
      .getByLabel("Description", { exact: true })
      .fill("Trip to campus");
    await modal.getByLabel("Reason for change").fill("Add travel context");
    await modal
      .getByRole("button", { name: "Save details", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await page
      .getByRole("button", { name: "Reverse UI-COST", exact: true })
      .click();
    modal = page.getByRole("dialog");
    await modal
      .getByLabel("Correction reason", { exact: true })
      .fill("Claim entered twice");
    await modal
      .getByRole("button", { name: "Post reversal", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(
      page.getByText(
        "Reversal posted. The original entry remains in the ledger.",
        { exact: true },
      ),
    ).toBeVisible();
  });
  await test.step("preview spreadsheet errors and import the valid selection", async () => {
    await page.getByRole("link", { name: "Import", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Data Tools", exact: true }),
    ).toBeVisible();
    const today = await page.evaluate(() => {
      const p = new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      return ["year", "month", "day"]
        .map((type) => p.find((part) => part.type === type).value)
        .join("-");
    });
    const csv = `Date,Voucher No,Deposit,Cost,Category,Description\n${today},CSV-1,,90,Browser Travel,Imported travel\n${today},UI-COST,,80,Browser Travel,Duplicate\nbad,BAD-ROW,,1,Browser Travel,Bad date\n`;
    await page
      .getByLabel("Spreadsheet (.xlsx, .xls or .csv, up to 5 MB)", {
        exact: true,
      })
      .setInputFiles({
        name: "travel.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
    await page
      .getByRole("button", { name: "Validate and preview", exact: true })
      .click();
    await expect(page.getByText("1 valid", { exact: true })).toBeVisible();
    await expect(
      page.getByText("2 invalid or duplicate", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Import 1 selected entries", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("1 entries imported");
    const [year, month, day] = today.split("-").map(Number);
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      [
        {
          Date: new Date(year, month - 1, day),
          "Voucher No": "XLSX-1",
          Cost: 20,
          Category: "Browser Travel",
        },
      ],
      { cellDates: true },
    );
    XLSX.utils.book_append_sheet(book, sheet, "Expenses");
    await page
      .getByLabel("Spreadsheet (.xlsx, .xls or .csv, up to 5 MB)", {
        exact: true,
      })
      .setInputFiles({
        name: "travel.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      });
    await page
      .getByRole("button", { name: "Validate and preview", exact: true })
      .click();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "XLSX-1" })
        .getByRole("cell", { name: today, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Import 1 selected entries", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("1 entries imported");
    await page
      .getByRole("link", { name: "General Ledger", exact: true })
      .click();
    await expect(page.getByText("CSV-1", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    const file = await download;
    expect(
      (await fs.readFile(await file.path())).subarray(0, 4).toString(),
    ).toBe("%PDF");
  });
  await test.step("view detailed audit changes", async () => {
    await page
      .getByRole("link", { name: "Audit History", exact: true })
      .click();
    await page.getByLabel("Action", { exact: true }).selectOption("EDIT");
    await page
      .getByLabel("Area", { exact: true })
      .selectOption("general_ledger");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    const row = page.getByRole("row").filter({ hasText: "Add travel context" });
    await expect(row).toBeVisible();
    await row
      .getByRole("button", { name: "View changes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Trip to campus");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  });

  await test.step("review receipt autofill and query the local assistant", async () => {
    await page
      .getByRole("link", { name: "General Ledger", exact: true })
      .click();
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal
      .getByLabel("Receipt image for autofill", { exact: true })
      .setInputFiles({
        name: "receipt.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await modal
      .getByRole("button", { name: "Read receipt", exact: true })
      .click();
    await expect(
      modal.getByText("OCR quality estimate: 94/100", { exact: true }),
    ).toBeVisible();
    const apply = modal.getByRole("button", {
      name: "Apply reviewed fields",
      exact: true,
    });
    await expect(apply).toBeDisabled();
    await modal
      .getByLabel(
        "I checked the selected fields against the receipt and confirmed BDT amounts.",
      )
      .check();
    await apply.click();
    await expect(
      modal.getByLabel("Voucher number", { exact: true }),
    ).toHaveValue("AI-RECEIPT-1");
    await expect(modal.getByLabel("Cost (BDT)", { exact: true })).toHaveValue(
      "250.00",
    );
    await expect(
      page.getByRole("table").getByText("AI-RECEIPT-1", { exact: true }),
    ).toHaveCount(0);
    await modal
      .getByRole("button", { name: "Post entry", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(
      page.getByRole("table").getByText("AI-RECEIPT-1", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "AI Assistant", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "AI Assistant", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Ask the local assistant", { exact: true })
      .fill("How much did we spend on equipment this period?");
    await page
      .getByRole("button", { name: "Ask assistant", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Assistant conversation" })
        .getByText("৳ 250.00", { exact: true })
        .first(),
    ).toBeVisible();
    await page
      .getByLabel("Ask the local assistant", { exact: true })
      .fill("এই মাসে কত টাকা খরচ হয়েছে?");
    await page
      .getByRole("button", { name: "Ask assistant", exact: true })
      .click();
    await expect(
      page.getByText(/নিচের অঙ্কগুলো সংরক্ষিত রেকর্ড থেকে গণনা করা হয়েছে/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Budget alerts", exact: true })
      .click();
    await expect(
      page.getByText("Computed report", { exact: true }).last(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Draft expense report", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download report draft", exact: true })
      .click();
    const file = await download;
    expect((await fs.readFile(await file.path())).toString()).toContain(
      "Department Expense Report",
    );
  });
  await test.step("create, download and restore a recovery copy", async () => {
    await page.getByRole("link", { name: "Data Tools", exact: true }).click();
    await page
      .getByRole("button", { name: "Backups & recovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create backup now", exact: true })
      .click();
    await expect(
      page.getByText("Backup created and integrity checked", { exact: true }),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "manual-" }).first();
    const download = page.waitForEvent("download");
    await row.getByRole("button", { name: /^Download / }).click();
    const file = await download;
    expect(
      (await fs.readFile(await file.path())).subarray(0, 15).toString(),
    ).toBe("SQLite format 3");
    await row.getByRole("button", { name: /^Restore / }).click();
    const modal = page.getByRole("dialog");
    await modal
      .getByLabel("Reason for recovery")
      .fill("Browser recovery verification");
    await modal
      .getByLabel("Your current password")
      .fill("browser-test-admin-password");
    await modal.getByLabel("Type RESTORE to confirm").fill("RESTORE");
    await modal
      .getByRole("button", { name: "Restore and sign out", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Submit login" }),
    ).toBeVisible();
    await login();
  });
  await test.step("close the period and enforce the lock", async () => {
    await page
      .getByRole("link", { name: "Financial Periods", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close period", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal
      .getByLabel("Closing note", { exact: true })
      .fill("Browser closing verification");
    await modal
      .getByText("I have reviewed the closing balances.", { exact: true })
      .click();
    await modal
      .getByRole("button", { name: "Close and lock period", exact: true })
      .click();
    await expect(modal).toBeHidden();
    await expect(
      page.getByText("Closed and locked", { exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download closing report", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(/Financial_period/);
    await page
      .getByRole("link", { name: "General Ledger", exact: true })
      .click();
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Post entry", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  });
  await test.step("new screens work at a mobile viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("link", { name: "Budgets & Categories", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Budgets & Categories", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
  expect(browserErrors).toEqual([]);
});
