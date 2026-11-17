import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { LocalOcr, LocalModel, localAiDirectory } from "../local-ai-runtime.js";
import { AiService } from "../ai-service.js";
import { FinanceService } from "../finance.js";

process.env.DB_PATH = ":memory:";
const { db } = await import("../db.js");
db.prepare(
  "INSERT INTO users(name,email,role,approved,password_hash) VALUES('AI check','test@example.com','super_admin',1,'unused')",
).run();
const actor = db.prepare("SELECT id,name,role FROM users LIMIT 1").get();
const finance = new FinanceService(db),
  ocr = new LocalOcr(),
  model = new LocalModel();
const ai = new AiService({ db, finance, ocr, model });
const directory = path.join(localAiDirectory, "verification");
await fs.mkdir(directory, { recursive: true });
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const bn = (value) =>
  String(value).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
const [year, month, day] = date.split("-");
const examples = [
  {
    name: "english",
    lines: [
      "Campus Supplies",
      "Receipt No: EN-1001",
      "Date: " + date,
      "Computer keyboard",
      "Grand Total: BDT 1250.50",
    ],
  },
  {
    name: "bangla",
    lines: [
      "ঢাকা কম্পিউটার",
      "রসিদ নং: BN-1001",
      "তারিখ: " + bn(`${day}/${month}/${year}`),
      "কম্পিউটার কিবোর্ড",
      "মোট টাকা: ১,২৫০.৫০",
    ],
  },
];
try {
  console.log(
    "Checking real local OCR and model. No production database is used.",
  );
  for (const example of examples) {
    const escape = (value) =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="600"><rect width="100%" height="100%" fill="white"/>${example.lines.map((line, i) => `<text x="50" y="${80 + i * 90}" font-family="Nirmala UI, Arial, sans-serif" font-size="40" fill="black">${escape(line)}</text>`).join("")}</svg>`;
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
    await fs.writeFile(path.join(directory, example.name + ".png"), bytes);
    const start = Date.now();
    const result = await ai.scan(actor, {
      ledgerType: "general",
      image: "data:image/png;base64," + bytes.toString("base64"),
    });
    console.log(
      JSON.stringify({
        language: example.name,
        seconds: Math.round((Date.now() - start) / 1000),
        method: result.method,
        quality: result.quality,
        fields: result.fields,
        warnings: result.warnings,
        sourceText: result.ocrText,
      }),
    );
    assert.equal(result.fields.totalAmount, "1250.50", example.name + " total");
    assert.equal(result.fields.date, date, example.name + " date");
    assert.equal(
      result.fields.categoryName,
      "Equipment",
      example.name + " category",
    );
    assert.equal(
      result.method,
      "local-ocr+model",
      example.name + " local model",
    );
  }
  const period = finance
    .periods()
    .find((p) => p.start_date <= date && p.end_date >= date);
  finance.addEntry(actor, "general", {
    date,
    voucherNo: "VERIFY-COST",
    cost: "1250.50",
    categoryId: finance.categories().find((c) => c.name === "Equipment").id,
  });
  for (const message of [
    "How much did we spend on equipment in the current financial period?",
    "এই মাসে কত টাকা খরচ হয়েছে?",
  ]) {
    const start = Date.now();
    const response = await ai.ask(actor, {
      message,
      periodId: period.id,
      ledgerType: "general",
    });
    console.log(
      JSON.stringify({
        assistantSeconds: Math.round((Date.now() - start) / 1000),
        question: message,
        answer: response.answer,
        operation: response.operation,
        metrics: response.metrics,
        scope: response.scope,
      }),
    );
    assert.equal(response.operation, "spending");
    assert.equal(
      response.metrics.find((m) => m.label === "Net category spending")?.value,
      1250.5,
    );
  }
  console.log("Live local OCR and assistant checks passed.");
} finally {
  await ocr.close();
  db.close();
}
