import { AiService } from "../ai-service.js";

export function browserAiFixture(db, finance) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const ocr = {
    status: () => ({ ready: true, languages: ["eng", "ben"], busy: false }),
    recognize: async () => ({
      text: `Local Computer Shop\nReceipt No: AI-RECEIPT-1\nDate: ${date}\nComputer keyboard\nGrand Total: BDT 250.00`,
      quality: 94,
    }),
    close: async () => {},
  };
  const model = {
    status: async () => ({
      ready: true,
      runtimeAvailable: true,
      modelInstalled: true,
      model: "browser-test-fixture",
      reason: null,
    }),
    text: async (messages) => /email|stationery|shorter/i.test(messages.at(-1).content)
      ? "Subject: Department supplies request\nPlease approve our stationery request. Thank you."
      : "Open a ledger and choose Add entry. You can read a receipt locally, review the fields, and then post the entry.",
    json: async (messages, schema) => {
      const category = finance.categories().find((c) => c.name === "Equipment");
      if (schema.properties.merchant)
        return {
          merchant: "Local Computer Shop",
          receiptNumber: "AI-RECEIPT-1",
          date,
          totalAmount: "250.00",
          taxAmount: null,
          currency: "BDT",
          categoryName: "Equipment",
          itemSummary: "Computer keyboard",
        };
      if (schema.properties.answer)
        return {
          answer: /email|stationery|shorter/i.test(messages.at(-1).content)
            ? "Subject: Department supplies request\nPlease approve our stationery request. Thank you."
            : "Open a ledger and choose Add entry. You can read a receipt locally, review the fields, and then post the entry.",
        };
      const message = messages.at(-1).content;
      return {
        operation: /email|stationery|shorter/i.test(message)
          ? "chat"
          : /how do|how to|কীভাবে/i.test(message)
          ? "help"
          : /budget|বাজেট/i.test(message)
            ? "budgets"
            : "spending",
        range: /month|মাস/i.test(message) ? "this_month" : "period",
        periodId: finance
          .periods()
          .find((p) => p.start_date <= date && p.end_date >= date)?.id,
        ledgerTypes: ["general"],
        categoryId: /equipment/i.test(message) ? category.id : null,
        startDate: null,
        endDate: null,
        clarification: null,
      };
    },
  };
  return new AiService({ db, finance, model, ocr });
}
