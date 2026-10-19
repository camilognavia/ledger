import Papa from "papaparse";
import type ExcelJS from "exceljs";
import { amountInput, normalizeName, totals, type Snapshot } from "./model";
import { inRange } from "./finance";
export const EXPORT_HEADERS = [
  "Date",
  "Time",
  "Type",
  "Category",
  "Merchant",
  "Description",
  "Amount",
  "Payment method",
  "Automatic",
  "Transaction ID",
  "Recurring schedule ID",
  "Occurrence key",
  "Original expense ID",
];
const escapeMarker = "prefix-apostrophe-v1";
export function flatRows(data: Snapshot, from?: string, to?: string) {
  return [
    ...(from && to ? inRange(data.transactions, from, to) : data.transactions),
  ]
    .sort(
      (a, b) =>
        a.localDate.localeCompare(b.localDate) ||
        a.localTime.localeCompare(b.localTime) ||
        a.id.localeCompare(b.id),
    )
    .map((t) => [
      t.localDate,
      t.localTime,
      t.type,
      data.categories.find((c) => c.id === t.categoryId)?.name || "Other",
      data.merchants.find((m) => m.id === t.merchantId)?.name || "",
      t.description,
      t.amount / 100,
      t.paymentMethod,
      t.automatic ? "Automatic" : "Manual",
      t.id,
      t.recurringScheduleId || "",
      t.occurrenceKey || "",
      t.originalExpenseId || "",
    ]);
}
export function exportCSV(data: Snapshot, from?: string, to?: string) {
  return (
    "\ufeff" +
    Papa.unparse(
      {
        fields: [...EXPORT_HEADERS, "Text escaping"],
        data: flatRows(data, from, to).map((r) => [...r, escapeMarker]),
      },
      { escapeFormulae: /^[\s]*[=+\-@\t\r]/, newline: "\r\n" },
    )
  );
}
export async function workbook(data: Snapshot, from?: string, to?: string) {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  wb.creator = "Ledger";
  const sheet = wb.addWorksheet("Transactions");
  sheet.addRow(EXPORT_HEADERS);
  for (const row of flatRows(data, from, to)) sheet.addRow(row);
  sheet.getColumn(7).numFmt = "#,##0.00";
  sheet.columns.forEach((c, i) => {
    c.width = [13, 9, 12, 24, 24, 40, 18, 20, 13, 38, 38, 52, 38][i];
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: EXPORT_HEADERS.length },
  };
  const rows =
    from && to ? inRange(data.transactions, from, to) : data.transactions;
  const sum = totals(rows);
  const summary = wb.addWorksheet("Summary");
  summary.addRow(["Metric", "Amount MXN"]);
  for (const [label, value] of [
    ["Income", sum.income],
    ["Gross expenses", sum.expenses],
    ["Refunds", sum.refunds],
    ["Net spending", sum.netSpending],
    ["Net cash flow", sum.netCashFlow],
  ])
    summary.addRow([label, (value as number) / 100]);
  summary.addRow([
    "Range",
    from && to ? `${from} through ${to}` : "All transactions",
  ]);
  summary.addRow([]);
  summary.addRow([
    "Category",
    "Expenses MXN",
    "Refunds MXN",
    "Net spending MXN",
    "Income MXN",
  ]);
  for (const c of data.categories) {
    const selected = rows.filter((t) => t.categoryId === c.id);
    if (selected.length) {
      const s = totals(selected);
      summary.addRow([
        c.name,
        s.expenses / 100,
        s.refunds / 100,
        s.netSpending / 100,
        s.income / 100,
      ]);
    }
  }
  summary.addRow([]);
  summary.addRow([
    "Month",
    "Income MXN",
    "Expenses MXN",
    "Refunds MXN",
    "Net cash flow MXN",
  ]);
  for (const month of [
    ...new Set(rows.map((t) => t.localDate.slice(0, 7))),
  ].sort()) {
    const s = totals(rows.filter((t) => t.localDate.startsWith(month)));
    summary.addRow([
      month,
      s.income / 100,
      s.expenses / 100,
      s.refunds / 100,
      s.netCashFlow / 100,
    ]);
  }
  summary.getColumn(1).width = 30;
  for (let i = 2; i <= 5; i++) {
    summary.getColumn(i).width = 22;
    summary.getColumn(i).numFmt = "#,##0.00";
  }
  summary.getRow(1).font = { bold: true };
  return wb;
}
export async function exportXLSX(data: Snapshot, from?: string, to?: string) {
  return new Uint8Array(
    await (await workbook(data, from, to)).xlsx.writeBuffer(),
  );
}
export type Cell = string | number | boolean | Date | null;
export interface RawTable {
  name: string;
  headers: string[];
  rows: Cell[][];
}
function table(name: string, matrix: Cell[][]): RawTable {
  const [header, ...rows] = matrix;
  if (!header?.length) throw new Error("The file is empty.");
  if (header.length > 80 || rows.length > 50000)
    throw new Error("Use at most 50,000 rows and 80 columns per file.");
  const headers = header.map((h) => String(h ?? "").trim());
  if (
    headers.some((h) => !h || h.length > 100) ||
    new Set(headers.map(normalizeName)).size !== headers.length
  )
    throw new Error(
      "Use unique, nonempty column headers (maximum 100 characters).",
    );
  if (rows.some((r) => r.length > headers.length))
    throw new Error("A row has more fields than the header.");
  return {
    name,
    headers,
    rows: rows.map((r) => headers.map((_, i) => r[i] ?? "")),
  };
}
export function readCSV(text: string): RawTable {
  const parsed = Papa.parse<string[]>(text.replace(/^\ufeff/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length)
    throw new Error("Invalid CSV: " + parsed.errors[0].message);
  const result = table("CSV", parsed.data);
  const marker = result.headers.indexOf("Text escaping");
  if (marker >= 0)
    for (const row of result.rows) {
      if (row[marker] === escapeMarker)
        for (let i = 0; i < row.length; i++) {
          const v = row[i];
          if (typeof v === "string" && /^'[\s]*[=+\-@\t\r]/.test(v))
            row[i] = v.slice(1);
        }
    }
  return result;
}
function cellValue(cell: ExcelJS.Cell): Cell {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean" ||
    v instanceof Date
  )
    return v;
  throw new Error(
    `Cell ${cell.address} contains a formula, hyperlink, rich text, or unsupported value. Convert it to plain values first.`,
  );
}
export async function readXLSX(bytes: ArrayBuffer): Promise<RawTable> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(bytes as Parameters<typeof wb.xlsx.load>[0]);
  const sheet = wb.getWorksheet("Transactions") || wb.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheet.");
  if (sheet.rowCount > 50001 || sheet.columnCount > 80)
    throw new Error("Use at most 50,000 rows and 80 columns.");
  const matrix: Cell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: Cell[] = [];
    for (let c = 1; c <= sheet.columnCount; c++)
      values.push(cellValue(row.getCell(c)));
    matrix.push(values);
  });
  return table(
    sheet.name,
    matrix.filter((row) => row.some((v) => v !== "" && v !== null)),
  );
}
export function exportAmount(cents: number) {
  return amountInput(cents);
}
