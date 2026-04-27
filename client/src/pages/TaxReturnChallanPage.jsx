import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";

const BANK_OPTIONS = [
  "বাংলাদেশ ব্যাংক",
  "সোনালী ব্যাংক",
  "জনতা ব্যাংক পিএলসি",
];

const COPY_OPTIONS = ["১ম", "২য়", "৩য়"];

const MONTHS_BN = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const initialForm = {
  challanNo: "",
  dateDay: "",
  dateMonth: "",
  dateYear: "",
  zone: "",
  circle: "",
  taxType: "",
  taxPeriod: "",
  depositorName: "",
  depositorTin: "",
  depositorAddress: "",
  bankName: "বাংলাদেশ ব্যাংক",
  bankBranch: "",
  accountHead: "",
  amountWords: "",
  amount: "",
  phone: "",
  officerName: "",
  note: "",
  extraComment: "",
  copyLabel: "১ম",
};

function toBanglaDigits(value) {
  return String(value ?? "").replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[d]);
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function amountToWordsBn(amount) {
  const number = Number(amount || 0);
  if (!number) return "";
  return `${toBanglaDigits(formatAmount(number))} টাকা মাত্র`;
}

function buildPrefilledForm(selectedRows = []) {
  const today = new Date();

  const base = {
    ...initialForm,
    dateDay: String(today.getDate()).padStart(2, "0"),
    dateMonth: String(today.getMonth() + 1).padStart(2, "0"),
    dateYear: String(today.getFullYear()),
  };

  if (!selectedRows.length) {
    return {
      ...base,
      amountWords: amountToWordsBn(""),
    };
  }

  const voucherNos = selectedRows
    .map((row) => row.voucherNo || row.voucher_no || "")
    .filter(Boolean)
    .join(", ");

  const taxTypes = [
    ...new Set(selectedRows.map((row) => row.taxTypeName || "").filter(Boolean)),
  ].join(", ");

  const totalAmount = selectedRows.reduce(
    (sum, row) => sum + Number(row.cost || 0),
    0
  );

  const descriptions = selectedRows
    .map((row) => row.description || "")
    .filter(Boolean)
    .join(", ");

  return {
    ...base,
    challanNo: voucherNos,
    taxType: taxTypes,
    amount: String(totalAmount || ""),
    amountWords: amountToWordsBn(totalAmount),
    note: descriptions,
    extraComment: "",
  };
}

export default function TaxReturnChallanPage() {
  const location = useLocation();
  const selectedRows = location.state?.selectedRows || [];

  const [form, setForm] = useState(() => buildPrefilledForm(selectedRows));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "amount") {
        next.amountWords = amountToWordsBn(value);
      }

      return next;
    });

    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!form.challanNo.trim()) nextErrors.challanNo = "চালান নম্বর আবশ্যক";
    if (!form.dateDay.trim()) nextErrors.dateDay = "দিন লিখুন";
    if (!form.dateMonth.trim()) nextErrors.dateMonth = "মাস লিখুন";
    if (!form.dateYear.trim()) nextErrors.dateYear = "বছর লিখুন";
    if (!form.bankName.trim()) nextErrors.bankName = "ব্যাংকের নাম নির্বাচন করুন";
    if (!form.taxType.trim()) nextErrors.taxType = "করের ধরন লিখুন";
    if (!form.amount.trim()) nextErrors.amount = "পরিমাণ লিখুন";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const challanRows = useMemo(() => {
    if (!selectedRows.length) {
      return [
        {
          id: "manual-row",
          depositor: form.depositorName || "",
          source: form.note || "",
          description: form.taxType || "",
          paymentType: "নগদ",
          amount: form.amount || "",
          comment: form.extraComment || "",
        },
      ];
    }

    return selectedRows.map((row, index) => ({
      id: `${row._src || "row"}-${row.id || index}`,
      depositor: form.depositorName || "",
      source: "বিভিন্ন প্রতিষ্ঠান থেকে কর্তনকৃত ভ্যাট প্রদান",
      description: row.description || form.taxType || "",
      paymentType: "নগদ",
      amount: row.cost || "",
      comment: row.taxTypeName || "",
    }));
  }, [
    selectedRows,
    form.depositorName,
    form.note,
    form.taxType,
    form.amount,
    form.extraComment,
  ]);

  const totalAmount = useMemo(() => {
    if (selectedRows.length) {
      return selectedRows.reduce((sum, row) => sum + Number(row.cost || 0), 0);
    }
    return Number(form.amount || 0);
  }, [selectedRows, form.amount]);

  const payload = useMemo(
    () => ({
      challanNo: form.challanNo,
      date: {
        day: form.dateDay,
        month: form.dateMonth,
        year: form.dateYear,
      },
      zone: form.zone,
      circle: form.circle,
      taxType: form.taxType,
      taxPeriod: form.taxPeriod,
      depositor: {
        name: form.depositorName,
        tin: form.depositorTin,
        address: form.depositorAddress,
        phone: form.phone,
      },
      bankName: form.bankName,
      bankBranch: form.bankBranch,
      accountHead: form.accountHead,
      amountWords: form.amountWords,
      amount: totalAmount || form.amount,
      officerName: form.officerName,
      note: form.note,
      extraComment: form.extraComment,
      items: challanRows,
      selectedRows,
      copyLabel: form.copyLabel,
    }),
    [form, totalAmount, challanRows, selectedRows]
  );

  const handlePrint = () => {
    if (!validateForm()) return;
    window.print();
  };

  const handleSave = async () => {
    try {
      setMsg("");
      if (!validateForm()) return;
      setSaving(true);
      await api.createTaxReturnChallan(payload);
      setMsg("চালান সফলভাবে সংরক্ষণ করা হয়েছে।");
    } catch (e) {
      setMsg(e.message || "সংরক্ষণ করা যায়নি।");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 print:bg-white print:p-0">
      <style>{`
        @media screen {
          .challan-print-root {
            display: block;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body * {
            visibility: hidden !important;
          }

          .challan-print-root,
          .challan-print-root * {
            visibility: visible !important;
          }

          .challan-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .print-hide {
            display: none !important;
          }

          .print-wrap {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            width: 100% !important;
          }

          .print-sheet {
            width: 100% !important;
            max-width: 190mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print-hide">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">VAT Challan</h1>
            <p className="text-sm text-slate-600">
              নতুন ফরম্যাট + ব্যাংক নির্বাচন + প্রিন্ট + সেভ
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Print
            </button>
          </div>
        </div>

        {msg ? (
          <div className="mb-4 rounded-md border bg-white px-4 py-3 text-sm text-slate-700 print-hide">
            {msg}
          </div>
        ) : null}

        <div className="mb-4 rounded-lg border bg-white p-4 shadow-sm print-hide">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormControl label="ব্যাংকের নাম" error={errors.bankName}>
              <select
                name="bankName"
                value={form.bankName}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500"
              >
                {BANK_OPTIONS.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </FormControl>

            <FormControl label="কপি">
              <select
                name="copyLabel"
                value={form.copyLabel}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500"
              >
                {COPY_OPTIONS.map((copy) => (
                  <option key={copy} value={copy}>
                    {copy} কপি
                  </option>
                ))}
              </select>
            </FormControl>

            <FormControl label="চালান নং" error={errors.challanNo}>
              <input
                name="challanNo"
                value={form.challanNo}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="ব্যাংক শাখা">
              <input
                name="bankBranch"
                value={form.bankBranch}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                placeholder="শাখার নাম"
              />
            </FormControl>

            <FormControl label="দিন" error={errors.dateDay}>
              <input
                name="dateDay"
                value={form.dateDay}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="মাস" error={errors.dateMonth}>
              <input
                name="dateMonth"
                value={form.dateMonth}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="বছর" error={errors.dateYear}>
              <input
                name="dateYear"
                value={form.dateYear}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="করের ধরন" error={errors.taxType}>
              <input
                name="taxType"
                value={form.taxType}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="কর পর্ব">
              <input
                name="taxPeriod"
                value={form.taxPeriod}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="জোন">
              <input
                name="zone"
                value={form.zone}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="সার্কেল">
              <input
                name="circle"
                value={form.circle}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="হিসাব খাত">
              <input
                name="accountHead"
                value={form.accountHead}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="জমাদানকারীর নাম">
              <input
                name="depositorName"
                value={form.depositorName}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="টিআইএন">
              <input
                name="depositorTin"
                value={form.depositorTin}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="ফোন">
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <FormControl label="অফিসারের নাম">
              <input
                name="officerName"
                value={form.officerName}
                onChange={handleChange}
                className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </FormControl>

            <div className="md:col-span-2 xl:col-span-4">
              <FormControl label="জমাদানকারীর ঠিকানা">
                <textarea
                  name="depositorAddress"
                  value={form.depositorAddress}
                  onChange={handleChange}
                  rows={2}
                  className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                />
              </FormControl>
            </div>

            <div className="md:col-span-2 xl:col-span-2">
              <FormControl label="টাকা কথায়">
                <input
                  name="amountWords"
                  value={form.amountWords}
                  onChange={handleChange}
                  className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                />
              </FormControl>
            </div>

            <div className="md:col-span-2 xl:col-span-2">
              <FormControl label="মোট টাকা" error={errors.amount}>
                <input
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                />
              </FormControl>
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <FormControl label="বিবরণ">
                <textarea
                  name="note"
                  value={form.note}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                />
              </FormControl>
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <FormControl label="অতিরিক্ত মন্তব্য">
                <textarea
                  name="extraComment"
                  value={form.extraComment}
                  onChange={handleChange}
                  rows={2}
                  className="w-full rounded border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                />
              </FormControl>
            </div>
          </div>
        </div>

        <div className="challan-print-root">
          <div className="print-wrap overflow-hidden rounded-lg border bg-white shadow-sm">
            <div className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-4 text-[12px] leading-tight text-black sm:p-5">
              <div className="mx-auto border border-black">
                <div className="flex items-start justify-between gap-3 px-4 pt-3">
                  <div className="flex-1 text-center">
                    <h2 className="text-[20px] font-bold">চালান ফরম</h2>
                    <p className="mt-1 text-[13px]">
                      টি, আর ফরম নং ৬ (এস, আর ও ৩৭ এ্যাক্ট)
                    </p>
                  </div>

                  <div className="min-w-[118px] border border-black px-3 py-2 text-center text-[12px] leading-none">
                    {form.copyLabel} / ২য় / ৩য় কপি
                  </div>
                </div>

                <div className="px-4 pt-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>চালান নং.................................</span>
                    <span className="font-medium">{form.challanNo || " "}</span>
                    <span className="ml-auto">
                      তারিখ :
                      <span className="font-medium">
                        {" "}
                        {toBanglaDigits(form.dateDay || "")}/
                        {toBanglaDigits(form.dateMonth || "")}/
                        {toBanglaDigits(form.dateYear || "")}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="px-4 py-4 text-[13px]">
                  <p className="leading-6">
                    {form.bankName || "বাংলাদেশ ব্যাংক"} / সোনালী ব্যাংক / জনতা ব্যাংক
                    পিএলসি ............পাড়া..........জেলা................পাড়া................শাখায়
                    টাকা জমা দেওয়ার চালান
                  </p>
                </div>

                <div className="flex items-center gap-6 px-4 pb-4 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span>কোড নং-</span>
                    <CodeBoxes
                      groups={["১", "১১৩৩", "০০২০", "০৩১১"]}
                    />
                  </div>
                </div>

                <div className="border-t border-black">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        <th className="w-[17%] border-r border-b border-black px-2 py-2 text-left align-top font-normal">
                          জমা প্রদানকারীর কর্তৃক পূরণ করিতে হইবে
                        </th>
                        <th className="w-[22%] border-r border-b border-black px-2 py-2 text-left align-top font-normal">
                          যে ব্যক্তির / প্রতিষ্ঠানের পক্ষ হইতে টাকা জমা হইতেছে তাহার
                          নাম ও ঠিকানা ।
                        </th>
                        <th className="w-[18%] border-r border-b border-black px-2 py-2 text-left align-top font-normal">
                          কি বাবদ জমা দেওয়া হইল তাহার বিবরণ ।
                        </th>
                        <th className="w-[17%] border-r border-b border-black px-2 py-2 text-left align-top font-normal">
                          মুদ্রা ও নোটের বিবরণ / ড্রাফট, পে-অর্ডার ও চেকের বিবরণ ।
                        </th>
                        <th
                          colSpan={2}
                          className="w-[15%] border-r border-b border-black px-2 py-2 text-center align-top font-normal"
                        >
                          টাকার অঙ্ক
                        </th>
                        <th className="w-[16%] border-b border-black px-2 py-2 text-left align-top font-normal">
                          বিভাগীয় নাম এবং চালানের গ্রহণকারী কর্মকর্তার নাম পদবী ও দফতর ।
                        </th>
                      </tr>
                      <tr>
                        <th className="border-r border-b border-black px-2 py-1"></th>
                        <th className="border-r border-b border-black px-2 py-1"></th>
                        <th className="border-r border-b border-black px-2 py-1"></th>
                        <th className="border-r border-b border-black px-2 py-1"></th>
                        <th className="border-r border-b border-black px-2 py-1 text-center font-normal">
                          টাকা
                        </th>
                        <th className="border-r border-b border-black px-2 py-1 text-center font-normal">
                          পয়সা
                        </th>
                        <th className="border-b border-black px-2 py-1"></th>
                      </tr>
                    </thead>

                    <tbody>
                      {challanRows.map((row, index) => {
                        const isFirst = index === 0;
                        const amountText = formatAmount(row.amount || 0);

                        return (
                          <tr key={row.id}>
                            <td className="border-r border-b border-black px-2 py-3 align-top">
                              {isFirst ? (
                                <div className="whitespace-pre-wrap leading-5">
                                  {form.depositorName || ""}
                                  {form.depositorName ? "\n" : ""}
                                  {form.depositorAddress || ""}
                                </div>
                              ) : (
                                ""
                              )}
                            </td>
                            <td className="border-r border-b border-black px-2 py-3 align-middle text-center">
                              <div className="whitespace-pre-wrap text-[13px] leading-5">
                                {row.source || "বিভিন্ন প্রতিষ্ঠান থেকে কর্তনকৃত ভ্যাট প্রদান"}
                              </div>
                            </td>
                            <td className="border-r border-b border-black px-2 py-3 align-middle text-center">
                              <div className="whitespace-pre-wrap text-[13px] leading-5">
                                {row.description || form.taxType || "ভ্যাট প্রদান"}
                              </div>
                            </td>
                            <td className="border-r border-b border-black px-2 py-3 align-middle text-center">
                              {row.paymentType || "নগদ"}
                            </td>
                            <td className="border-r border-b border-black px-2 py-3 align-middle text-center text-[14px]">
                              {toBanglaDigits(amountText)}
                            </td>
                            <td className="border-r border-b border-black px-2 py-3 align-middle text-center"></td>
                            <td className="border-b border-black px-2 py-3 align-top">
                              {isFirst ? (
                                <div className="whitespace-pre-wrap leading-5">
                                  {form.officerName || ""}
                                  {form.officerName ? "\n" : ""}
                                  {form.extraComment || ""}
                                </div>
                              ) : (
                                ""
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      <tr>
                        <td colSpan={4} className="border-r border-b border-black px-2 py-2 text-right">
                          মোট টাকা-
                        </td>
                        <td className="border-r border-b border-black px-2 py-2 text-center text-[14px]">
                          {toBanglaDigits(formatAmount(totalAmount))}
                        </td>
                        <td className="border-r border-b border-black px-2 py-2"></td>
                        <td className="border-b border-black px-2 py-2"></td>
                      </tr>

                      <tr>
                        <td colSpan={4} className="border-r border-b border-black px-2 py-1.5">
                          টাকা কথায়: {form.amountWords || amountToWordsBn(totalAmount)}
                        </td>
                        <td colSpan={3} rowSpan={2} className="align-top px-2 py-2">
                          <div className="mt-10 text-right">
                            <div className="mb-3">ম্যানেজার</div>
                            <div>{form.bankName || "বাংলাদেশ ব্যাংক/সোনালী ব্যাংক"}</div>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td colSpan={4} className="border-r border-b border-black px-2 py-1.5">
                          টাকা পাওয়া গেল
                        </td>
                      </tr>

                      <tr>
                        <td colSpan={4} className="border-r border-black px-2 py-10 align-bottom">
                          <div>তারিখ : </div>
                        </td>
                        <td colSpan={3} className="px-2 py-10 align-bottom"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="px-4 pb-2 pt-3 text-[12px]">
                  <div className="flex justify-between gap-4">
                    <div>
                      <span className="underline">নোট:</span>
                      <div className="mt-1 leading-5">
                        ১। সংশ্লিষ্ট ছকের সহিত যোগাযোগ করিয়া সঠিক কোড নম্বর জানিয়া
                        নিবেন।
                        <br />
                        ২। * যে সকল ক্ষেত্রে কর্তৃপক্ষ কর্তৃক পৃষ্ঠাঙ্কন প্রযোজ্য সে সকল
                        ক্ষেত্রে প্রযোজ্য হইবে।
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md border bg-white p-4 print-hide">
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  API Payload Preview
                </h2>
                <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-800">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormControl({ label, children, error }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function CodeBoxes({ groups }) {
  return (
    <div className="flex items-center gap-7">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex items-center gap-[2px]">
          {String(group).split("").map((char, index) => (
            <div
              key={`${groupIndex}-${index}`}
              className="flex h-7 w-7 items-center justify-center border border-black text-[14px]"
            >
              {char}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}