// Common financial questions use known operations directly, including Bangla.
// Anything ambiguous still goes through the validated model planner.
export function groundedPlan(message, defaults, categories) {
  if (/email|translate|translation|programming|javascript|python|ইমেইল|অনুবাদ|কোড/i.test(message)) return null;
  if (/how (?:do|does|can|should)\b|how to\b|কীভাবে|কিভাবে|কোথায়/i.test(message)) return null;
  const category = categories.find((item) => {
    if (item.name.toLowerCase() === "other" && !/\b(?:on|for|category)\s+other\b/i.test(message)) return false;
    const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^\\p{L}\\p{N}])" + escaped + "(?:$|[^\\p{L}\\p{N}])", "iu").test(message);
  });
  if (/\b(?:on|for)\s+(?!this|the|all|last|our|my|a |an |\d)/i.test(message) && !category) return null;
  let operation;
  if (/missing.*receipt|without.*receipt|receipt.*missing|রসিদ.*নেই|রসিদ.*ছাড়া/i.test(message)) operation = "missing_receipts";
  else if (/budget|বাজেট/i.test(message) && /show|how|which|alert|spent|remaining|exceed|দেখ|কত|অবস্থা|বেশি/i.test(message)) operation = "budgets";
  else if (/pending.*(?:instruction|task)|(?:instruction|task).*pending|বাকি.*নির্দেশ|অসম্পূর্ণ.*কাজ/i.test(message)) operation = "instructions";
  else if (/expense report|spending report|ব্যয়ের প্রতিবেদন|খরচের রিপোর্ট/i.test(message)) operation = "report";
  else if (/how much.*(?:spen|cost|expense)|total.*(?:spen|cost|expense)|কত.*খরচ|মোট.*ব্যয়/i.test(message)) operation = "spending";
  if (!operation || /\b(?:post|delete|change|approve|reverse|restore)\b/i.test(message)) return null;
  const dates = message.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (dates.length === 1 || dates.length > 2) return null;
  const range = dates.length === 2 ? "custom" : /last month|গত মাস/i.test(message) ? "last_month"
    : /this month|এই মাস/i.test(message) ? "this_month" : /this year|এই বছর/i.test(message) ? "this_year"
    : /all time|all records|সব সময়/i.test(message) ? "all" : "period";
  const mentioned = [["unofficial", /\bunofficial\b/i], ["general", /\bgeneral\b/i],
    ["association", /\bassociation\b/i], ["departmental", /\bdepartment(?:al)? ledger\b|\bdepartmental\b/i]].filter(([, pattern]) => pattern.test(message)).map(([key]) => key);
  return { ...defaults, operation, range, categoryId: category?.id || null,
    ledgerTypes: mentioned.length ? mentioned : defaults.ledgerTypes,
    startDate: dates[0] || null, endDate: dates[1] || null, clarification: null, mode: "grounded" };
}

export function workflowHelp(message) {
  const bangla = /[\u0980-\u09ff]/.test(message);
  if (!/how|where|কীভাবে|কিভাবে|কোথায়/i.test(message)) return null;
  if (/budget|বাজেট/i.test(message) && /create|set|add|manage|তৈরি|নির্ধারণ/i.test(message)) return bangla
    ? "চেয়ারম্যান হিসেবে Budgets & Categories খুলুন। প্রয়োজনে New category দিয়ে বিভাগ তৈরি করুন। Set budget চাপুন, আর্থিক সময় ও বিভাগ বাছাই করে বরাদ্দ ও কারণ লিখুন। Save budget চাপুন। সতর্কতার শতাংশও নির্ধারণ করতে পারেন।"
    : "As Chairman, open Budgets & Categories. Use New category if needed, then Set budget. Choose the financial period and category, enter the allocation, alert percentage and reason, and save the budget.";
  if (/batch|multiple receipt|several receipt|একাধিক.*রসিদ/i.test(message)) return bangla
    ? "Batch Receipts খুলুন। সর্বোচ্চ ১০টি PNG, JPEG বা WebP রসিদ বাছাই করে Read receipts চাপুন। প্রতিটি খসড়ার তারিখ, ভাউচার, টাকা ও বিভাগ যাচাই করুন। সঠিক খসড়াগুলো Reviewed ও Selected করে Post selected চাপুন।"
    : "Open Batch Receipts, select up to 10 PNG, JPEG or WebP images and choose Read receipts. Check each draft's date, voucher, amount and category. Mark each draft reviewed, select the ones to post, and choose Post selected.";
  if (/add.*expense|post.*entry|scan.*receipt|খরচ.*যোগ|রসিদ.*স্ক্যান/i.test(message)) return bangla
    ? "একটি লেজার খুলে Add entry চাপুন। তারিখ, ভাউচার নম্বর, খরচ ও বিভাগ পূরণ করুন। রসিদ থাকলে Read receipt দিয়ে পড়ে তথ্য যাচাই করুন। খোলা আর্থিক সময়ের তারিখ ব্যবহার করুন। সব তথ্য ঠিক থাকলে Post entry চাপুন। সম্ভাব্য নকল এন্ট্রি দেখালে মিলগুলো যাচাই করুন।"
    : "Open a ledger and choose Add entry. Enter the date, voucher number, cost and category. You can use Read receipt to fill a draft, then review the fields. The date must be in an open financial period. Choose Post entry. If duplicate matches appear, review them before continuing.";
  if (/notification|reminder|deadline|বিজ্ঞপ্তি|সময়সীমা/i.test(message)) return bangla
    ? "Reminders পৃষ্ঠায় কাজের সময়সীমা, অনুপস্থিত রসিদ ও বাজেটের সতর্কতা দেখুন। একটি বিজ্ঞপ্তি পড়া হিসেবে চিহ্নিত করতে পারেন বা ২৪ ঘণ্টা পরে মনে করিয়ে দিতে পারেন। কাজ সম্পন্ন হলে সংশ্লিষ্ট বিজ্ঞপ্তি আর দেখাবে না।"
    : "Open Reminders to see instruction deadlines, missing receipts and budget alerts. Open the linked task or entry to resolve it. You can mark a reminder read or snooze it for 24 hours. Resolved reminders disappear automatically.";
  return null;
}
