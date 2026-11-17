import { test, expect } from "@playwright/test";

test("batch receipt review, duplicate warnings, AI evidence and deadline reminders", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Email or Name", { exact: true }).fill("chairman@example.com");
  await page.getByLabel("Password", { exact: true }).fill("browser-test-admin-password");
  await page.getByRole("button", { name: "Submit login" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const headers = { Authorization: "Bearer " + token };
  const api = async (url, method = "get", data) => {
    const result = await page.request[method]("http://127.0.0.1:4174/api" + url, { headers, ...(data ? { data } : {}) });
    expect(result.ok(), await result.text()).toBeTruthy(); return result.json();
  };
  const category = await api("/categories", "post", { name: "Enhanced Receipts" });
  const periods = await api("/periods");
  let period = periods.find((item) => item.status === "open");
  if (!period) {
    const year = Number(periods[0].end_date.slice(0, 4)) + 1;
    period = await api("/periods", "post", { name: "Enhancement period", startDate: year + "-01-01", endDate: year + "-12-31" });
  }
  const postingDate = period.start_date;
  let scans = 0;
  await page.route("**/api/ai/receipt", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.fields.receiptNumber = "BATCH-" + (++scans);
    result.fields.date = postingDate;
    result.fields.categoryId = category.id;
    result.fields.categoryName = "Enhanced Receipts";
    result.duplicates = [];
    await route.fulfill({ response, json: result });
  });
  await page.getByRole("link", { name: "Batch Receipts", exact: true }).click();
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Receipt images (up to 10)").setInputFiles([
    { name: "batch-one.png", mimeType: "image/png", buffer: Buffer.concat([tinyPng, Buffer.from("batch-one")]) },
    { name: "batch-two.png", mimeType: "image/png", buffer: Buffer.concat([tinyPng, Buffer.from("batch-two")]) },
  ]);
  await page.getByRole("button", { name: "Read receipts", exact: true }).click();
  const first = page.getByRole("region", { name: "Receipt draft 1", exact: true });
  const second = page.getByRole("region", { name: "Receipt draft 2", exact: true });
  await expect(second.getByText("ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Post selected (0)", exact: true })).toBeDisabled();
  await first.getByLabel("Cost (BDT)", { exact: true }).fill("30");
  await second.getByLabel("Cost (BDT)", { exact: true }).fill("40");
  await first.getByLabel(/I reviewed this draft against the receipt/).check();
  await second.getByLabel(/I reviewed this draft against the receipt/).check();
  // Any financial edit invalidates the previous review.
  await second.getByLabel("Cost (BDT)", { exact: true }).fill("41");
  await expect(second.getByLabel(/I reviewed this draft against the receipt/)).not.toBeChecked();
  await second.getByLabel("Cost (BDT)", { exact: true }).fill("40");
  await second.getByLabel(/I reviewed this draft against the receipt/).check();
  await second.getByLabel("Select this expense to post", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Post selected (1)", exact: true }).click();
  await expect(first.getByRole("link", { name: "Open posted entry" })).toBeVisible();
  await expect(second.getByRole("link", { name: "Open posted entry" })).toHaveCount(0);
  await second.getByLabel("Select this expense to post", { exact: true }).check();
  await page.getByRole("button", { name: "Post selected (1)", exact: true }).click();
  await expect(second.getByRole("link", { name: "Open posted entry" })).toBeVisible();

  await page.getByRole("link", { name: "AI Assistant", exact: true }).click();
  await page.getByLabel("Financial period", { exact: true }).selectOption(String(period.id));
  await page.getByLabel("Ask the local assistant").fill("How much did we spend on Enhanced Receipts this period?");
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(page.getByText("৳ 70.00", { exact: true }).first()).toBeVisible();
  await page.getByText("View source entries (2)", { exact: true }).click();
  await page.getByRole("link", { name: /^BATCH-1 · General Ledger/ }).click();
  await expect(page.getByText(/Showing source entry #/)).toBeVisible();
  await expect(page.getByRole("table").getByText("BATCH-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show all entries", exact: true }).click();

  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Date", { exact: true }).fill(postingDate);
  await modal.getByLabel("Voucher number", { exact: true }).fill("BATCH-1");
  await modal.getByLabel("Cost (BDT)", { exact: true }).fill("30");
  await modal.getByLabel("Expense category", { exact: true }).selectOption(String(category.id));
  await modal.getByRole("button", { name: "Post entry", exact: true }).click();
  await expect(modal.getByRole("region", { name: "Possible duplicates" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Post entry", exact: true })).toBeDisabled();
  await modal.getByLabel("I reviewed the matches and this is a separate, valid transaction.").check();
  await modal.getByLabel("Reason for continuing despite duplicate warning").fill("A separate purchase with a reused department reference");
  await modal.getByRole("button", { name: "Post entry", exact: true }).click();
  await expect(modal).toBeHidden();

  await api("/signup", "post", { name: "Reminder Officer", email: "reminder-browser@example.com", password: "officer-browser-password" });
  const pending = await api("/admin/users/pending");
  const officer = pending.find((item) => item.email === "reminder-browser@example.com");
  await api(`/admin/users/${officer.id}/approve`, "post", {});
  await page.getByRole("link", { name: "Instructions", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Enhanced deadline task");
  await page.getByLabel("Description", { exact: true }).fill("Provide the equipment inventory.");
  await page.getByLabel("Instruction due date", { exact: true }).fill("2000-01-01");
  await page.getByRole("button", { name: "Add new instruction" }).click();
  await expect(page.getByRole("heading", { name: "Enhanced deadline task", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Reminders", exact: true }).click();
  const reminder = page.getByRole("region", { name: /^Instruction overdue: Enhanced deadline task/ });
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(reminder.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(reminder.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
  await reminder.getByRole("button", { name: "Snooze 24 hours", exact: true }).click();
  await expect(reminder).toBeHidden();
  await page.getByLabel("Include snoozed", { exact: true }).check();
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Unsnooze", exact: true }).click();
  await expect(reminder.getByRole("button", { name: "Snooze 24 hours", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("reminders-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Batch Receipts", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("batch-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
