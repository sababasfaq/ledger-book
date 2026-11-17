export function balanceRows(rows, opening = 0) {
  let balance = Math.round(Number(opening || 0) * 100);
  return [...rows]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        String(a._src || "").localeCompare(String(b._src || "")) ||
        a.id - b.id,
    )
    .map((row) => {
      balance +=
        (row.deposit_minor ?? Math.round(Number(row.deposit || 0) * 100)) -
        (row.cost_minor ?? Math.round(Number(row.cost || 0) * 100));
      return { ...row, netBalance: balance / 100 };
    });
}
