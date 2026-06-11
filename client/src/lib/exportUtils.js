import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

export const exportToPDF = (title, rows, columns) => {
  const doc = new jsPDF("l", "mm", "a4");
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 14, 30);

  const tableData = rows.map((r, i) => [
    i + 1,
    r.date,
    r.voucher_no || r.voucherNo || "",
    r.description || "",
    r.deposit ? Number(r.deposit).toLocaleString() : "",
    r.cost ? Number(r.cost).toLocaleString() : "",
    r.netBalance ? Number(r.netBalance).toLocaleString() : "",
  ]);

  doc.autoTable({
    startY: 40,
    head: [["No", "Date", "Voucher No", "Description", "Deposit", "Cost", "Balance"]],
    body: tableData,
  });

  doc.save(`${title.replace(/\s+/g, "_")}_${new Date().getTime()}.pdf`);
};

export const exportToExcel = (title, rows) => {
  const data = rows.map((r, i) => ({
    No: i + 1,
    Date: r.date,
    "Voucher No": r.voucher_no || r.voucherNo || "",
    Description: r.description || "",
    Deposit: r.deposit || 0,
    Cost: r.cost || 0,
    Balance: r.netBalance || 0,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ledger");

  // Auto-fit columns
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.max(key.length, ...data.map(r => String(r[key] || "").length)) + 2
  }));
  ws["!cols"] = colWidths;

  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_${new Date().getTime()}.xlsx`);
};

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};