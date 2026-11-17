import { test, expect } from "@playwright/test";

async function login(page) {
  await page.goto("/");
  await page.getByLabel("Email or Name", { exact: true }).fill("chairman@example.com");
  await page.getByLabel("Password", { exact: true }).fill("browser-test-admin-password");
  await page.getByRole("button", { name: "Submit login" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("AI chat remembers follow-ups across pages, expands, clears and resets on sign-out", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open AI chat", exact: true })).toBeHidden();
  await login(page);
  await page.getByRole("button", { name: "Open AI chat", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "AI Chat", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Ask the local assistant").fill("Draft an email requesting stationery.");
  await expect(dialog.getByRole("button", { name: "Ask assistant", exact: true })).toBeEnabled();
  await dialog.getByLabel("Ask the local assistant").press("Enter");
  await expect(dialog.getByText(/Please approve our stationery request/)).toBeVisible();

  const followup = page.waitForRequest((request) => request.url().endsWith("/api/ai/assistant") && request.method() === "POST");
  await dialog.getByLabel("Ask the local assistant").fill("Make it shorter.");
  await dialog.getByRole("button", { name: "Ask assistant", exact: true }).click();
  const payload = (await followup).postDataJSON();
  expect(payload.history.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(payload.history[0].content).toContain("stationery");
  await expect(dialog.getByText(/Please approve our stationery request/)).toHaveCount(2);

  await dialog.getByLabel("Ask the local assistant").press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Open AI chat", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "General Ledger", exact: true }).click();
  await page.getByRole("button", { name: "Open AI chat", exact: true }).click();
  await expect(dialog.getByText(/Please approve our stationery request/)).toHaveCount(2);
  await dialog.getByRole("link", { name: "Open full AI assistant" }).click();
  await expect(page.getByRole("heading", { name: "AI Assistant", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open AI chat", exact: true })).toBeHidden();
  await expect(page.getByText(/Please approve our stationery request/)).toHaveCount(2);
  await page.getByRole("button", { name: "Clear conversation", exact: true }).click();
  await expect(page.getByText(/Please approve our stationery request/)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Open AI chat", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "AI Chat", exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath("ai-chat-mobile.png") });
  await dialog.getByRole("button", { name: "Add an expense", exact: true }).click();
  await dialog.getByRole("button", { name: "Minimize AI chat", exact: true }).click();
  await page.getByRole("button", { name: "Log out of Ledger Book" }).click();
  await expect(page.getByRole("button", { name: "Open AI chat", exact: true })).toBeHidden();
  await login(page);
  await page.getByRole("button", { name: "Open AI chat", exact: true }).click();
  await expect(page.getByLabel("Ask the local assistant")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("AI chat handles an offline model, failed requests and cancellation", async ({ page }) => {
  let ready = false;
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: {
    ocr: { ready: true }, model: { ready, runtimeAvailable: ready, reason: "Local AI is offline" },
  } }));
  await login(page);
  await page.getByRole("button", { name: "Open AI chat", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI Chat", exact: true });
  await expect(dialog.getByText("Local AI is offline", { exact: true })).toBeVisible();
  await dialog.getByLabel("Ask the local assistant").fill("Hello");
  await expect(dialog.getByRole("button", { name: "Ask assistant", exact: true })).toBeEnabled();
  ready = true;
  await dialog.getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Ask assistant", exact: true })).toBeEnabled();
  await page.route("**/api/ai/assistant", (route) => route.fulfill({ status: 503, json: { error: "The local model is busy. Try again shortly." } }));
  await dialog.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(dialog.getByText("The local model is busy. Try again shortly.")).toBeVisible();
  await dialog.getByRole("button", { name: "Clear conversation", exact: true }).click();
  await page.unroute("**/api/ai/assistant");
  let pendingRoute;
  await page.route("**/api/ai/assistant", (route) => { pendingRoute = route; });
  await dialog.getByLabel("Ask the local assistant").fill("Write an email");
  await dialog.getByRole("button", { name: "Ask assistant", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Cancel request", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel request", exact: true }).click();
  await expect(dialog.getByText("Request stopped.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Ask assistant", exact: true })).toBeVisible();
  await pendingRoute?.abort().catch(() => {});
});
