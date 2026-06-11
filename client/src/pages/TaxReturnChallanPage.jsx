import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { 
  Printer, 
  Save, 
  RotateCcw, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  ChevronDown,
  History,
  FileText
} from "lucide-react";

const BANK_OPTIONS = [
  "বাংলাদেশ ব্যাংক",
  "সোনালী ব্যাংক",
  "জনতা ব্যাংক পিএলসি",
];

const COPY_OPTIONS = ["১ম", "২য়", "৩য়"];

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
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// Simple Bangla Number to Words
function numberToBanglaWords(num) {
  if (isNaN(num) || num === "" || num === 0) return "";
  const n = parseInt(num);
  
  const words = {
    0: 'শূন্য', 1: 'এক', 2: 'দুই', 3: 'তিন', 4: 'চার', 5: 'পাঁচ', 6: 'ছয়', 7: 'সাত', 8: 'আট', 9: 'নয়', 10: 'দশ',
    11: 'এগারো', 12: 'বারো', 13: 'তেরো', 14: 'চৌদ্দ', 15: 'পনেরো', 16: 'ষোলো', 17: 'সতেরো', 18: 'আঠারো', 19: 'ঊনিশ', 20: 'বিশ',
    21: 'একুশ', 22: 'বাইশ', 23: 'তেইশ', 24: 'চব্বিশ', 25: 'পঁচিশ', 26: 'ছাব্বিশ', 27: 'সাতাশ', 28: 'আটাশ', 29: 'ঊনত্রিশ', 30: 'ত্রিশ',
    31: 'একত্রিশ', 32: 'বত্রিশ', 33: 'তেত্রিশ', 34: 'চৌত্রিশ', 35: 'পঁয়ত্রিশ', 36: 'ছত্রিশ', 37: 'সাতত্রিশ', 38: 'আটত্রিশ', 39: 'ঊনচল্লিশ', 40: 'চল্লিশ',
    41: 'একচল্লিশ', 42: 'বিয়াল্লিশ', 43: 'তেতাল্লিশ', 44: 'চুয়াল্লিশ', 45: 'পঁয়তাল্লিশ', 46: 'ছেচল্লিশ', 47: 'সাতচল্লিশ', 48: 'আটচল্লিশ', 49: 'ঊনপঞ্চাশ', 50: 'পঞ্চাশ',
    51: 'একান্ন', 52: 'বায়ান্ন', 53: 'তিপ্পান্ন', 54: 'চুয়ান্ন', 55: 'পঞ্চান্ন', 56: 'ছাপ্পান্ন', 57: 'সাতান্ন', 58: 'আটান্ন', 59: 'ঊনষাট', 60: 'ষাট',
    61: 'একষট্টি', 62: 'বাষট্টি', 63: 'তেষট্টি', 64: 'চৌট্টি', 65: 'পঁয়ষট্টি', 66: 'ছেষট্টি', 67: 'সাতষট্টি', 68: 'আটষট্টি', 69: 'ঊনসত্তর', 70: 'সত্তর',
    71: 'একাত্তর', 72: 'বাহাত্তর', 73: 'তিয়াত্তর', 74: 'চুয়াত্তর', 75: 'পঁচাত্তর', 76: 'ছিয়াত্তর', 77: 'সাতাত্তর', 78: 'আটাত্তর', 79: 'ঊনআশি', 80: 'আশি',
    81: 'একাশি', 82: 'বিরাশি', 83: 'তিরাশি', 84: 'চুরাশি', 85: 'পঁচাশী', 86: 'ছিয়াশি', 87: 'সাতাশি', 88: 'অষ্টাশি', 89: 'ঊননব্বই', 90: 'নব্বই',
    91: 'একানব্বই', 92: 'বিরানব্বই', 93: 'তিরানব্বই', 94: 'চুরানব্বই', 95: 'পঁচানব্বই', 96: 'ছিয়ানব্বই', 97: 'সাতানব্বই', 98: 'আটানব্বই', 99: 'নিরানব্বই'
  };

  const convert = (n) => {
    if (n === 0) return "";
    if (n < 100) return words[n] || '';
    if (n < 1000) {
      const h = Math.floor(n / 100);
      const rem = n % 100;
      return words[h] + ' শত ' + convert(rem);
    }
    if (n < 100000) {
      const th = Math.floor(n / 1000);
      const rem = n % 1000;
      return convert(th) + ' হাজার ' + convert(rem);
    }
    if (n < 10000000) {
      const lakh = Math.floor(n / 100000);
      const rem = n % 100000;
      return convert(lakh) + ' লক্ষ ' + convert(rem);
    }
    const crore = Math.floor(n / 10000000);
    const rem = n % 10000000;
    return convert(crore) + ' কোটি ' + convert(rem);
  };

  return convert(n).trim() + " টাকা মাত্র";
}

function buildPrefilledForm(selectedRows = []) {
  const today = new Date();
  const base = {
    ...initialForm,
    dateDay: String(today.getDate()).padStart(2, "0"),
    dateMonth: String(today.getMonth() + 1).padStart(2, "0"),
    dateYear: String(today.getFullYear()),
  };

  if (!selectedRows.length) return base;

  const voucherNos = selectedRows.map(r => r.voucherNo || r.voucher_no || "").filter(Boolean).join(", ");
  const taxTypes = [...new Set(selectedRows.map(r => r.taxTypeName || "").filter(Boolean))].join(", ");
  const totalAmount = selectedRows.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const descriptions = selectedRows.map(r => r.description || "").filter(Boolean).join(", ");

  return {
    ...base,
    challanNo: voucherNos,
    taxType: taxTypes,
    amount: String(totalAmount || ""),
    amountWords: numberToBanglaWords(totalAmount),
    note: descriptions,
  };
}

export default function TaxReturnChallanPage() {
  const location = useLocation();
  const selectedRows = location.state?.selectedRows || [];

  const [form, setForm] = useState(() => buildPrefilledForm(selectedRows));
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [saving, setSaving] = useState(false);
  const [savedChallans, setSavedChallans] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await api.getTaxReturnChallans();
      setSavedChallans(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === "amount") {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          next.amountWords = numberToBanglaWords(num);
        } else {
          next.amountWords = "";
        }
      }
      return next;
    });
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.challanNo.trim()) nextErrors.challanNo = "চালান নম্বর আবশ্যক";
    if (!form.dateDay.trim()) nextErrors.dateDay = "দিন আবশ্যক";
    if (!form.dateMonth.trim()) nextErrors.dateMonth = "মাস আবশ্যক";
    if (!form.dateYear.trim()) nextErrors.dateYear = "বছর আবশ্যক";
    if (!form.bankName.trim()) nextErrors.bankName = "ব্যাংক আবশ্যক";
    if (!form.taxType.trim()) nextErrors.taxType = "করের ধরন আবশ্যক";
    if (!form.amount || isNaN(form.amount)) nextErrors.amount = "সঠিক পরিমাণ লিখুন";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast("দয়া করে লাল চিহ্নিত ঘরগুলো পূরণ করুন।", "error");
      return false;
    }
    return true;
  };

  const handleClear = () => {
    if (window.confirm("আপনি কি ফর্মটি খালি করতে চান?")) {
      setForm(initialForm);
      setErrors({});
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = {
        ...form,
        date: { day: form.dateDay, month: form.dateMonth, year: form.dateYear },
        depositor: { name: form.depositorName, tin: form.depositorTin, address: form.depositorAddress, phone: form.phone },
        amount: Number(form.amount)
      };
      await api.createTaxReturnChallan(payload);
      showToast("চালান সফলভাবে সংরক্ষণ করা হয়েছে।");
      fetchHistory();
    } catch (e) {
      showToast(e.message || "সংরক্ষণ করা যায়নি।", "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!validate()) return;
    window.print();
  };

  const loadAndPrint = (challan) => {
    setForm({
      ...initialForm,
      challanNo: challan.challan_no,
      dateDay: challan.date_day,
      dateMonth: challan.date_month,
      dateYear: challan.date_year,
      zone: challan.zone || "",
      circle: challan.circle || "",
      taxType: challan.tax_type,
      taxPeriod: challan.tax_period || "",
      depositorName: challan.depositor_name || "",
      depositorTin: challan.depositor_tin || "",
      depositorAddress: challan.depositor_address || "",
      phone: challan.phone || "",
      bankName: challan.bank_name || "বাংলাদেশ ব্যাংক",
      bankBranch: challan.bank_branch || "",
      accountHead: challan.account_head || "",
      amountWords: challan.amount_words || "",
      amount: String(challan.amount || ""),
      officerName: challan.officer_name || "",
      note: challan.note || "",
      extraComment: challan.extra_comment || "",
      copyLabel: challan.copy_label || "১ম",
    });
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 print:bg-white print:pb-0 font-sans">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body * { visibility: hidden; }
          .challan-print-root, .challan-print-root * { visibility: visible; }
          .challan-print-root { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .print-hide { display: none !important; }
        }
      `}</style>

      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border animate-in slide-in-from-right duration-300 ${
          toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Top Bar */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print-hide">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="text-slate-400" />
              VAT Challan / চালান ফরম
            </h1>
            {selectedRows.length > 0 && (
              <p className="mt-1 text-sm font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full inline-block">
                {selectedRows.length} rows pre-filled from ledger
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleClear}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition"
            >
              <RotateCcw size={18} />
              Clear Form
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save Challan
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-lg shadow-slate-200 transition"
            >
              <Printer size={18} />
              Print
            </button>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-6 print-hide">
          <Section title="চালান তথ্য (Challan Info)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="চালান নং" name="challanNo" value={form.challanNo} onChange={handleChange} error={errors.challanNo} placeholder="e.g. 123/2024" />
              <Field label="কপি" name="copyLabel" type="select" value={form.copyLabel} onChange={handleChange} options={COPY_OPTIONS} />
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">তারিখ (Date)</label>
                <div className="flex gap-2">
                  <input name="dateDay" value={form.dateDay} onChange={handleChange} placeholder="DD" className={`w-16 px-3 py-2 rounded-xl border text-center outline-none focus:ring-4 transition ${errors.dateDay ? 'border-red-300 bg-red-50 focus:ring-red-100' : 'border-slate-200 focus:ring-slate-100'}`} />
                  <input name="dateMonth" value={form.dateMonth} onChange={handleChange} placeholder="MM" className={`w-16 px-3 py-2 rounded-xl border text-center outline-none focus:ring-4 transition ${errors.dateMonth ? 'border-red-300 bg-red-50 focus:ring-red-100' : 'border-slate-200 focus:ring-slate-100'}`} />
                  <input name="dateYear" value={form.dateYear} onChange={handleChange} placeholder="YYYY" className={`w-24 px-3 py-2 rounded-xl border text-center outline-none focus:ring-4 transition ${errors.dateYear ? 'border-red-300 bg-red-50 focus:ring-red-100' : 'border-slate-200 focus:ring-slate-100'}`} />
                </div>
              </div>
              <Field label="কর পর্ব (Tax Period)" name="taxPeriod" value={form.taxPeriod} onChange={handleChange} placeholder="e.g. July 2024" />
            </div>
          </Section>

          <Section title="ব্যাংক ও কর (Bank & Tax)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="ব্যাংকের নাম" name="bankName" type="select" value={form.bankName} onChange={handleChange} options={BANK_OPTIONS} error={errors.bankName} />
              <Field label="ব্যাংক শাখা" name="bankBranch" value={form.bankBranch} onChange={handleChange} placeholder="শাখার নাম" />
              <Field label="করের ধরন" name="taxType" value={form.taxType} onChange={handleChange} error={errors.taxType} placeholder="e.g. VAT" />
              <Field label="হিসাব খাত" name="accountHead" value={form.accountHead} onChange={handleChange} placeholder="Account Code" />
              <Field label="জোন (Zone)" name="zone" value={form.zone} onChange={handleChange} />
              <Field label="সার্কেল (Circle)" name="circle" value={form.circle} onChange={handleChange} />
            </div>
          </Section>

          <Section title="জমাদানকারী (Depositor)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="নাম (Name)" name="depositorName" value={form.depositorName} onChange={handleChange} />
              <Field label="টিআইএন (TIN)" name="depositorTin" value={form.depositorTin} onChange={handleChange} />
              <Field label="ফোন (Phone)" name="phone" value={form.phone} onChange={handleChange} placeholder="01XXX-XXXXXX" />
              <div className="md:col-span-2">
                <Field label="ঠিকানা (Address)" name="depositorAddress" type="textarea" value={form.depositorAddress} onChange={handleChange} rows={2} />
              </div>
            </div>
          </Section>

          <Section title="পরিমাণ ও বিবরণ (Amount & Details)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Field label="মোট টাকা (Amount)" name="amount" type="text" value={form.amount} onChange={handleChange} error={errors.amount} placeholder="0.00" />
                {form.amount && !isNaN(form.amount) && (
                  <div className="px-1 space-y-1">
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <span className="opacity-70 tracking-widest uppercase">Amount in Words:</span>
                      <span>{numberToBanglaWords(form.amount)}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-800">
                      ৳ {toBanglaDigits(formatAmount(form.amount))}
                    </div>
                  </div>
                )}
              </div>
              <Field label="টাকা কথায় (Editable)" name="amountWords" value={form.amountWords} onChange={handleChange} />
              <Field label="অফিসারের নাম" name="officerName" value={form.officerName} onChange={handleChange} />
              <div className="md:col-span-2">
                <Field label="বিবরণ (Description)" name="note" type="textarea" value={form.note} onChange={handleChange} rows={2} />
              </div>
              <div className="md:col-span-2">
                <Field label="অতিরিক্ত মন্তব্য" name="extraComment" type="textarea" value={form.extraComment} onChange={handleChange} rows={1} />
              </div>
            </div>
          </Section>
        </div>

        {/* Saved Challans List */}
        <div className="mt-12 space-y-6 print-hide">
          <div className="flex items-center gap-4">
            <History className="text-slate-400" />
            <h2 className="text-xl font-bold text-slate-900">Saved Challans (চালান ইতিহাস)</h2>
            <div className="h-px flex-1 bg-slate-200"></div>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            {loadingHistory ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin" />
                <span>Loading history...</span>
              </div>
            ) : savedChallans.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText size={48} className="mx-auto mb-4 opacity-20" />
                <p>No challans saved yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-6 py-4 font-bold text-slate-700">Challan No</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Date</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Tax Type</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Amount</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Saved At</th>
                      <th className="px-6 py-4 font-bold text-slate-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {savedChallans.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition duration-200">
                        <td className="px-6 py-4 font-semibold text-slate-900">{c.challan_no}</td>
                        <td className="px-6 py-4 text-slate-600">{`${c.date_day}/${c.date_month}/${c.date_year}`}</td>
                        <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold uppercase">{c.tax_type}</span></td>
                        <td className="px-6 py-4 font-bold text-emerald-700">৳ {formatAmount(c.amount)}</td>
                        <td className="px-6 py-4 text-slate-400 text-xs">{new Date(c.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => loadAndPrint(c)}
                            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition"
                            title="Print Again"
                          >
                            <Printer size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Printable Area */}
        <div className="challan-print-root">
          <div className="mx-auto w-[190mm] bg-white text-black leading-tight text-[12px]">
            <div className="border border-black p-0">
              <div className="flex items-start justify-between border-b border-black p-4">
                <div className="flex-1 text-center">
                  <h2 className="text-[20px] font-bold">চালান ফরম</h2>
                  <p className="mt-1 text-[13px]">টি, আর ফরম নং ৬ (এস, আর ও ৩৭ এ্যাক্ট)</p>
                </div>
                <div className="min-w-[120px] border border-black px-4 py-2 text-center text-[14px] font-bold">
                  {form.copyLabel} কপি
                </div>
              </div>

              <div className="px-4 py-3 text-[14px] border-b border-black">
                <div className="flex justify-between items-center w-full">
                  <div className="flex gap-2">
                    <span>চালান নং:</span>
                    <span className="font-bold underline">{form.challanNo || "........................"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span>তারিখ:</span>
                    <span className="font-bold underline">
                      {toBanglaDigits(form.dateDay)}/{toBanglaDigits(form.dateMonth)}/{toBanglaDigits(form.dateYear)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4 text-[14px] border-b border-black">
                <div className="flex flex-wrap gap-4 items-center">
                  {BANK_OPTIONS.map(bank => (
                    <div key={bank} className="flex items-center gap-2">
                      <div className={`w-4 h-4 border border-black rounded-sm flex items-center justify-center ${form.bankName === bank ? 'bg-black' : ''}`}>
                        {form.bankName === bank && <div className="w-2 h-2 bg-white" />}
                      </div>
                      <span className={form.bankName === bank ? 'font-bold underline' : 'opacity-60'}>{bank}</span>
                    </div>
                  ))}
                  <span className="ml-2">........................................ শাখায় টাকা জমা দেওয়ার চালান</span>
                </div>
              </div>

              <div className="flex items-center gap-6 px-4 py-3 border-b border-black">
                <div className="flex items-center gap-4">
                  <span className="text-[14px] font-bold">কোড নং-</span>
                  <CodeBoxes groups={["১", "১১৩৩", "০০২০", "০৩১১"]} />
                </div>
              </div>

              <table className="w-full border-collapse border-b border-black text-[12px]">
                <thead>
                  <tr className="text-center font-bold">
                    <th className="w-[18%] border-r border-black p-2">জমা প্রদানকারীর বিবরণ</th>
                    <th className="w-[22%] border-r border-black p-2">যে ব্যক্তি/প্রতিষ্ঠানের পক্ষে টাকা জমা</th>
                    <th className="w-[18%] border-r border-black p-2">বিবরণ</th>
                    <th className="w-[15%] border-r border-black p-2">মুদ্রা ও নোটের বিবরণ</th>
                    <th colSpan={2} className="w-[15%] border-r border-black p-2">টাকার অঙ্ক</th>
                    <th className="w-[12%] p-2">বিভাগীয় নাম</th>
                  </tr>
                </thead>
                <tbody className="text-center">
                  <tr className="h-[200px] border-t border-black">
                    <td className="border-r border-black p-3 align-top text-left leading-relaxed">
                      <div className="font-bold">{form.depositorName}</div>
                      <div>{form.depositorAddress}</div>
                      {form.depositorTin && <div className="mt-2 text-[11px]">TIN: {form.depositorTin}</div>}
                      {form.phone && <div className="text-[11px]">Mob: {form.phone}</div>}
                    </td>
                    <td className="border-r border-black p-3 align-top leading-relaxed">
                      {form.note || "বিভিন্ন প্রতিষ্ঠান থেকে কর্তনকৃত ভ্যাট প্রদান"}
                    </td>
                    <td className="border-r border-black p-3 align-top leading-relaxed font-bold">
                      {form.taxType}
                    </td>
                    <td className="border-r border-black p-3 align-middle">নগদ</td>
                    <td className="border-r border-black p-3 align-middle text-[16px] font-bold">
                      {toBanglaDigits(formatAmount(form.amount))}
                    </td>
                    <td className="border-r border-black p-3 align-middle">০০</td>
                    <td className="p-3 align-top leading-relaxed text-[11px]">
                      {form.officerName}
                    </td>
                  </tr>
                  <tr className="border-t border-black font-bold">
                    <td colSpan={4} className="border-r border-black p-2 text-right">মোট টাকা-</td>
                    <td className="border-r border-black p-2 text-[16px] underline">{toBanglaDigits(formatAmount(form.amount))}</td>
                    <td className="border-r border-black p-2">০০</td>
                    <td className="p-2"></td>
                  </tr>
                </tbody>
              </table>

              <div className="p-4 space-y-4">
                <div className="text-[14px]">
                  <span className="font-bold">টাকা কথায়:</span> {form.amountWords}
                </div>
                <div className="flex justify-between items-end pt-8">
                  <div className="space-y-12">
                    <div className="border-t border-black pt-1 w-48 text-center text-[12px]">জমাদানকারীর স্বাক্ষর</div>
                    <div className="text-[14px]">তারিখ: ............................</div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="mb-8">টাকা পাওয়া গেল</div>
                    <div className="font-bold">ব্যবস্থাপক</div>
                    <div className="underline">{form.bankName}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-black p-4 text-[11px] leading-relaxed italic opacity-80">
                <span className="font-bold underline not-italic">নোট:</span> <br />
                ১। সংশ্লিষ্ট ছকের সহিত যোগাযোগ করিয়া সঠিক কোড নম্বর জানিয়া নিবেন। <br />
                ২। * যে সকল ক্ষেত্রে কর্তৃপক্ষ কর্তৃক পৃষ্ঠাঙ্কন প্রযোজ্য সে সকল ক্ষেত্রে প্রযোজ্য হইবে।
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, name, value, onChange, error, type = "text", placeholder, options = [], rows = 3 }) {
  const baseClasses = `w-full px-4 py-2.5 rounded-xl border outline-none focus:ring-4 transition duration-200 ${
    error ? 'border-red-300 bg-red-50 focus:ring-red-100' : 'border-slate-200 focus:ring-slate-100'
  }`;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
      {type === "select" ? (
        <div className="relative">
          <select name={name} value={value} onChange={onChange} className={`${baseClasses} appearance-none pr-10 bg-white`}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
        </div>
      ) : type === "textarea" ? (
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} className={baseClasses} />
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className={baseClasses} />
      )}
      {error && <p className="text-[10px] font-bold text-red-500 uppercase px-1 tracking-tight">{error}</p>}
    </div>
  );
}

function CodeBoxes({ groups }) {
  return (
    <div className="flex items-center gap-4">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="flex items-center gap-[2px]">
          {String(group).split("").map((char, index) => (
            <div key={index} className="flex h-6 w-6 items-center justify-center border border-black text-[12px] font-bold bg-white">
              {char}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}