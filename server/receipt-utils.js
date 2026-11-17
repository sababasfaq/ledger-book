import { dateValue, moneyMinor } from "./finance.js";

export const toEnglishDigits = (value) =>
  String(value ?? "").replace(/[০-৯]/g, (char) =>
    String("০১২৩৪৫৬৭৮৯".indexOf(char)),
  );
const monthNames = [
  ["january", "jan", "জানুয়ারি", "জানুয়ারি"],
  ["february", "feb", "ফেব্রুয়ারি", "ফেব্রুয়ারি"],
  ["march", "mar", "মার্চ"],
  ["april", "apr", "এপ্রিল"],
  ["may", "মে"],
  ["june", "jun", "জুন"],
  ["july", "jul", "জুলাই"],
  ["august", "aug", "আগস্ট"],
  ["september", "sep", "sept", "সেপ্টেম্বর"],
  ["october", "oct", "অক্টোবর"],
  ["november", "nov", "নভেম্বর"],
  ["december", "dec", "ডিসেম্বর"],
];
const monthPattern = monthNames.flat().join("|");
export function receiptDate(value) {
  const raw = toEnglishDigits(value).trim();
  let parts = raw.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/),
    date;
  if (parts)
    date = `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
  else {
    parts = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
    if (parts) {
      const us = Number(parts[2]) > 12 && Number(parts[1]) <= 12;
      date = `${parts[3].length === 2 ? "20" + parts[3] : parts[3]}-${(us ? parts[1] : parts[2]).padStart(2, "0")}-${(us ? parts[2] : parts[1]).padStart(2, "0")}`;
    } else {
      const forward = raw.match(
        new RegExp(
          "(\\d{1,2})[\\s.,/-]*(" + monthPattern + ")[\\s.,/-]*(\\d{4})",
          "iu",
        ),
      );
      const reverse = raw.match(
        new RegExp(
          "(" + monthPattern + ")[\\s.,/-]*(\\d{1,2})[\\s.,/-]+(\\d{4})",
          "iu",
        ),
      );
      const match = forward || reverse;
      if (match) {
        const name = (forward ? match[2] : match[1]).toLowerCase(),
          month = monthNames.findIndex((names) => names.includes(name)) + 1,
          day = forward ? match[1] : match[2];
        date = `${match[3]}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
  }
  if (!date) return null;
  try {
    return dateValue(date);
  } catch {
    return null;
  }
}
export function amountString(value) {
  const normalized = toEnglishDigits(value)
    .replace(/[,\s৳]/g, "")
    .replace(/^(?:BDT|TK\.?)/i, "");
  try {
    if (!normalized) return null;
    const minor = moneyMinor(normalized);
    return minor > 0 ? (minor / 100).toFixed(2) : null;
  } catch {
    return null;
  }
}
function amountsIn(line) {
  return (
    toEnglishDigits(line)
      .replaceAll(",", "")
      .match(/(?<![\d.])-?\d+(?:\.\d{1,2})?(?![\d.])/g) || []
  )
    .map(amountString)
    .filter(Boolean);
}
const normalizedText = (text) =>
  toEnglishDigits(text).toLowerCase().replace(/\s+/g, " ").trim();
function supportedText(value, raw, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return null;
  return normalizedText(raw).includes(normalizedText(value))
    ? value.trim()
    : null;
}
export function parseReceiptText(text) {
  const normalized = toEnglishDigits(text),
    lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const dateMatches = [
    ...normalized.matchAll(
      /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2}))\b/g,
    ),
    ...normalized.matchAll(
      new RegExp(
        "(?:\\d{1,2}[\\s.,/-]*(?:" +
          monthPattern +
          ")[\\s.,/-]*\\d{4}|(?:" +
          monthPattern +
          ")[\\s.,/-]*\\d{1,2}[\\s.,/-]+\\d{4})",
        "giu",
      ),
    ),
  ];
  const dateCandidates = dateMatches
    .map((match) => receiptDate(match[0]))
    .filter(Boolean);
  const scored = [];
  let receiptNumber = null,
    taxAmount = null,
    taxRate = null;
  for (const line of lines) {
    const receipt = line.match(
      /(?:receipt|invoice|bill|রসিদ|বিল|চালান)\s*(?:no\.?|number|নং|নম্বর|#)\s*[:#.\-]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{0,119})/i,
    );
    if (receipt && !receiptNumber) receiptNumber = receipt[1];
    const amounts = amountsIn(line);
    if (/(?:vat|tax|ভ্যাট|কর)\b|ভ্যাট|কর\s*[:=]/i.test(line)) {
      const rate = line.match(/(\d+(?:\.\d{1,2})?)\s*%/);
      if (rate && Number(rate[1]) <= 100) taxRate = Number(rate[1]);
      if (amounts.length && (!rate || amounts.length > 1))
        taxAmount = amounts.at(-1);
    }
    if (/sub\s*total|subtotal|উপমোট|discount|ছাড়|ছাড়/i.test(line)) continue;
    const priority =
      /grand\s*total|net\s*(?:amount|payable|total)|amount\s*(?:due|paid|payable)|সর্বমোট|পরিশোধযোগ্য/i.test(
        line,
      )
        ? 3
        : /\btotal\b|মোট/i.test(line)
          ? 2
          : 0;
    if (priority && amounts.length)
      scored.push({ priority, amount: amounts.at(-1) });
  }
  scored.sort((a, b) => b.priority - a.priority);
  const currency = /\bUSD\b|US\$|\$/i.test(normalized)
    ? "USD"
    : /\bEUR\b|€/i.test(normalized)
      ? "EUR"
      : /\bINR\b|₹/i.test(normalized)
        ? "INR"
        : /\bBDT\b|\bTK\b|৳|টাকা/i.test(normalized)
          ? "BDT"
          : null;
  const merchant =
    lines
      .find(
        (line) =>
          !/^(?:cash\s*memo|receipt|invoice|রসিদ|ক্যাশ\s*মেমো)\s*$/i.test(
            line,
          ) && !receiptDate(line),
      )
      ?.slice(0, 150) || null;
  return {
    merchant,
    receiptNumber,
    date: dateCandidates[0] || null,
    totalAmount: scored[0]?.amount || null,
    taxAmount,
    taxRate,
    currency,
    dateCandidates: [...new Set(dateCandidates)],
  };
}
export function mergeReceiptFields(
  rawText,
  candidate = {},
  categories = [],
  taxes = [],
) {
  const parsed = parseReceiptText(rawText);
  const allAmounts = new Set(amountsIn(rawText));
  const modelAmount = amountString(candidate.totalAmount);
  const modelTax = amountString(candidate.taxAmount);
  const date = receiptDate(candidate.date);
  const number = supportedText(candidate.receiptNumber, rawText, 120);
  const merchant = supportedText(candidate.merchant, rawText, 150);
  const totalAmount =
    parsed.totalAmount ||
    (modelAmount && allAmounts.has(modelAmount) ? modelAmount : null);
  const taxAmount =
    parsed.taxAmount ||
    (modelTax && allAmounts.has(modelTax) ? modelTax : null);
  const text = normalizedText(rawText);
  let category = categories.find(
    (c) => c.active && text.includes(normalizedText(c.name)),
  );
  if (!category) {
    const hints = [
      [
        /equipment|যন্ত্রপাতি/i,
        /computer|laptop|keyboard|mouse|printer|monitor|কম্পিউটার|প্রিন্টার|কিবোর্ড|ল্যাপটপ/i,
      ],
      [/maintenance|রক্ষণাবেক্ষণ|মেরামত/i, /repair|maintenance|মেরামত|সার্ভিসিং/i],
      [
        /utilities|ইউটিলিটি/i,
        /electricity|internet|water bill|বিদ্যুৎ|ইন্টারনেট|পানি/i,
      ],
      [/events|অনুষ্ঠান/i, /event|seminar|conference|অনুষ্ঠান|সেমিনার|সম্মেলন/i],
      [
        /travel|ভ্রমণ|যাতায়াত|যাতায়াত/i,
        /travel|bus fare|train|transport|যাতায়াত|যাতায়াত|ভাড়া|ভাড়া/i,
      ],
    ];
    category = categories.find(
      (c) =>
        c.active &&
        hints.some(([name, words]) => name.test(c.name) && words.test(rawText)),
    );
  }
  if (!category)
    category = categories.find(
      (c) =>
        c.active &&
        typeof candidate.categoryName === "string" &&
        normalizedText(c.name) === normalizedText(candidate.categoryName),
    );
  const matchingTaxes =
    parsed.taxRate == null
      ? []
      : taxes.filter(
          (t) =>
            Number(t.percentage) === parsed.taxRate &&
            /vat|tax|ভ্যাট|কর/i.test(t.name),
        );
  return {
    merchant: merchant || parsed.merchant,
    receiptNumber: number || parsed.receiptNumber,
    date: date && parsed.dateCandidates.includes(date) ? date : parsed.date,
    totalAmount,
    taxAmount,
    taxRate: parsed.taxRate,
    currency: parsed.currency,
    categoryId: category?.id || null,
    categoryName: category?.name || null,
    taxTypeId: matchingTaxes.length === 1 ? matchingTaxes[0].id : null,
    description: [
      merchant || parsed.merchant,
      supportedText(candidate.itemSummary, rawText, 400),
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 2000),
    warnings: [
      ...(parsed.dateCandidates.length > 1
        ? ["Several dates were found. Confirm the transaction date."]
        : []),
      ...(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|1[0-2])\/\d{2,4}\b/.test(
        toEnglishDigits(rawText),
      )
        ? [
            "An ambiguous slash date was read as day/month/year. Confirm the date.",
          ]
        : []),
    ],
  };
}
