import { afterEach, describe, it, expect, vi } from "vitest";
import { deleteDB } from "idb";
import Excel from "exceljs";
import {
  openLedger,
  snapshot,
  saveTransaction,
  deleteTransaction,
  saveMerchant,
  type LedgerDB,
} from "./db";
import {
  captureBackup,
  canonical,
  prepareRestore,
  restoreBackup,
} from "./backup";
import {
  readCSV,
  exportCSV,
  exportXLSX,
  workbook,
  readXLSX,
  type RawTable,
} from "./spreadsheets";
import { defaultMapping, previewImport, commitImport } from "./imports";
import { transaction } from "./test-fixtures";
import { saveSchedule, reconcile } from "./recurrence";
const dbs: LedgerDB[] = [];
async function fresh() {
  const d = await openLedger("transfer-" + crypto.randomUUID());
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await deleteDB(d.name);
  }
});
const csv = (
  body = "2026-10-01,12:30,expense,School,Cafe Ciencias,Latte,85.29,Cash,source-1",
) =>
  readCSV(
    "Date,Time,Type,Category,Merchant,Description,Amount,Payment method,Transaction ID\n" +
      body,
  );
async function addSchedule(d: LedgerDB) {
  return saveSchedule(
    d,
    {
      id: "auto-plan",
      name: "Auto",
      type: "expense",
      amount: 1000,
      categoryId: "expense-4",
      description: "Recurring",
      paymentMethod: "Cash",
      frequency: "monthly",
      startDate: "2026-10-01",
      paused: false,
      createdAt: 0,
      updatedAt: 0,
    },
    false,
    "2026-10-01",
  );
}
describe("CSV and real XLSX encoding", () => {
  it("exports flat numeric Excel rows, independent date/time, and numeric Summary category/month totals", async () => {
    const d = await fresh();
    await saveTransaction(d, transaction({ amount: 8529 }));
    await saveTransaction(
      d,
      transaction({ type: "income", categoryId: "income-0", amount: 100000 }),
    );
    await saveTransaction(d, transaction({ type: "refund", amount: 2000 }));
    const wb = await workbook(await snapshot(d));
    const sheet = wb.getWorksheet("Transactions")!,
      sum = wb.getWorksheet("Summary")!;
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getCell("A2").value).toBe("2026-10-01");
    expect(sheet.getCell("B2").value).toBe("12:30");
    expect(typeof sheet.getCell("G2").value).toBe("number");
    const values: unknown[][] = [];
    sum.eachRow((row) => values.push((row.values as unknown[]).slice(1)));
    expect(values).toContainEqual(["Income", 1000]);
    expect(values).toContainEqual(["Gross expenses", 85.29]);
    expect(values).toContainEqual(["Refunds", 20]);
    expect(values).toContainEqual(["Net cash flow", 934.71]);
    expect(values.some((r) => r[0] === "2026-10" && r[4] === 934.71)).toBe(
      true,
    );
    expect(JSON.stringify(sheet.model.merges || [])).toBe("[]");
    const bytes = await exportXLSX(await snapshot(d));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const decoded = await readXLSX(new Uint8Array(bytes).buffer);
    expect(decoded.headers[6]).toBe("Amount");
    expect(typeof decoded.rows[0][6]).toBe("number");
  });
  it("exports only inclusive selected dates in CSV and XLSX", async () => {
    const d = await fresh();
    await saveTransaction(
      d,
      transaction({ localDate: "2026-09-30", amount: 100 }),
    );
    await saveTransaction(
      d,
      transaction({ localDate: "2026-10-01", amount: 200 }),
    );
    await saveTransaction(
      d,
      transaction({ localDate: "2026-10-02", amount: 300 }),
    );
    const data = await snapshot(d);
    expect(
      readCSV(exportCSV(data, "2026-10-01", "2026-10-01")).rows,
    ).toHaveLength(1);
    const wb = await workbook(data, "2026-10-01", "2026-10-01");
    expect(wb.getWorksheet("Transactions")!.rowCount).toBe(2);
    expect(wb.getWorksheet("Summary")!.getCell("B3").value).toBe(2);
  });
  it("round-trips commas, quotes, newlines, Unicode and protected formula-looking text in CSV", async () => {
    const d = await fresh();
    await saveMerchant(d, {
      id: "cafe",
      name: "Cafe, Ciencias",
      normalizedName: "",
      archived: false,
    });
    const description = '=HYPERLINK("x")\n café, "latte"';
    await saveTransaction(
      d,
      transaction({ merchantId: "cafe", description, amount: 29 }),
    );
    const text = exportCSV(await snapshot(d));
    expect(text).toContain("'=HYPERLINK");
    const raw = readCSV(text);
    expect(raw.rows[0][5]).toBe(description);
    expect(raw.rows[0][4]).toBe("Cafe, Ciencias");
    const destination = await fresh();
    await commitImport(
      destination,
      await previewImport(destination, raw, defaultMapping(raw)),
    );
    expect((await snapshot(destination)).transactions[0]).toMatchObject({
      description,
      amount: 29,
      automatic: false,
    });
  });
  it("exports Excel formula-looking descriptions as literal strings and rejects formula/hyperlink cells on import", async () => {
    const d = await fresh();
    await saveTransaction(d, transaction({ description: "=1+1" }));
    const wb = await workbook(await snapshot(d));
    expect(wb.getWorksheet("Transactions")!.getCell("F2").value).toBe("=1+1");
    const invalid = new Excel.Workbook();
    const sheet = invalid.addWorksheet("Data");
    sheet.addRow(["Date", "Amount"]);
    sheet.addRow(["2026-10-01", { formula: "1+1", result: 2 }]);
    await expect(
      readXLSX(new Uint8Array(await invalid.xlsx.writeBuffer()).buffer),
    ).rejects.toThrow("formula");
    sheet.getCell("B2").value = {
      text: "Click",
      hyperlink: "https://example.com",
    };
    await expect(
      readXLSX(new Uint8Array(await invalid.xlsx.writeBuffer()).buffer),
    ).rejects.toThrow("hyperlink");
  });
  it("reads genuine Excel date/time cells and preserves centavos from numeric cells", async () => {
    const wb = new Excel.Workbook(),
      sheet = wb.addWorksheet("Transactions");
    sheet.addRow(["Date", "Time", "Amount"]);
    sheet.addRow([
      new Date("2026-10-01T00:00:00Z"),
      new Date("1899-12-30T12:30:00Z"),
      0.29,
    ]);
    sheet.getCell("A2").numFmt = "yyyy-mm-dd";
    sheet.getCell("B2").numFmt = "hh:mm";
    const raw = await readXLSX(
      new Uint8Array(await wb.xlsx.writeBuffer()).buffer,
    );
    const d = await fresh();
    const plan = await previewImport(d, raw, defaultMapping(raw), {
      allowMissingPaymentMethods: true,
    });
    expect(plan.rows[0].transaction).toMatchObject({
      localDate: "2026-10-01",
      localTime: "12:30",
      amount: 29,
    });
    await commitImport(d, plan);
    expect((await snapshot(d)).transactions[0].amount).toBe(29);
  });
  it.each([
    'Date,Amount\n"unterminated,1',
    "Date,Date\n2026-10-01,1",
    ",Amount\n2026-10-01,1",
  ])("rejects malformed CSV %s", (text) =>
    expect(() => readCSV(text)).toThrow(),
  );
});
describe("mapped preview and safe append-only import", () => {
  it("requires a preview, does not write while previewing, maps reordered columns and creates independent entities", async () => {
    const d = await fresh();
    const raw = readCSV(
      "Paid,Day,Who,Kind,Group,Details,Payment method\n12.29,2026-10-01,Cafe,income,Consulting,Tutoring,Cash",
    );
    const m = defaultMapping(raw);
    Object.assign(m, {
      amount: 0,
      date: 1,
      merchant: 2,
      type: 3,
      category: 4,
      description: 5,
    });
    const plan = await previewImport(d, raw, m);
    expect(await d.count("transactions")).toBe(0);
    expect(plan.rows[0].status).toBe("valid");
    expect(plan.categories[0].kind).toBe("income");
    await commitImport(d, plan);
    const data = await snapshot(d);
    expect(data.transactions[0]).toMatchObject({
      amount: 1229,
      type: "income",
      description: "Tutoring",
      automatic: false,
    });
    expect(data.merchants).toEqual([]);
    expect(data.transactions[0].merchantName).toBe("Cafe");
    expect(await d.count("imports")).toBe(1);
  });
  it("detects existing, in-file and previous-import duplicates, including deleted imports", async () => {
    const d = await fresh();
    const raw = csv();
    const plan = await previewImport(
      d,
      { ...raw, rows: [raw.rows[0], raw.rows[0]] },
      defaultMapping(raw),
    );
    expect(plan.rows.map((r) => r.status)).toEqual(["valid", "duplicate"]);
    await commitImport(d, plan);
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("duplicate");
    const [t] = (await snapshot(d)).transactions;
    await deleteTransaction(d, t.id);
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("duplicate");
    expect(await d.count("imports")).toBe(1);
  });
  it("does not reimport an edited exported record when its original source ID still exists", async () => {
    const d = await fresh();
    const t = transaction();
    await saveTransaction(d, t);
    const raw = readCSV(exportCSV(await snapshot(d)));
    await saveTransaction(
      d,
      { ...t, amount: 10000, description: "Edited" },
      true,
    );
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("duplicate");
  });
  it("excludes automatic rows and metadata even if the mapped Automatic field is removed; never recreates a deleted due", async () => {
    const source = await fresh();
    const [automatic] = await addSchedule(source);
    await saveTransaction(
      source,
      transaction({ description: "Manual beside auto" }),
    );
    const raw = readCSV(exportCSV(await snapshot(source)));
    const destination = await fresh();
    const m = defaultMapping(raw);
    m.automatic = -1;
    const plan = await previewImport(destination, raw, m);
    expect(plan.rows.filter((r) => r.status === "excluded")).toHaveLength(1);
    expect(plan.rows.filter((r) => r.status === "valid")).toHaveLength(1);
    await commitImport(destination, plan);
    expect(
      (await snapshot(destination)).transactions.every(
        (t) => !t.automatic && !t.occurrenceKey && !t.recurringScheduleId,
      ),
    ).toBe(true);
    await deleteTransaction(source, automatic.id);
    const later = await previewImport(source, raw, m);
    expect(later.rows.filter((r) => r.status === "excluded")).toHaveLength(1);
    expect(await reconcile(source, "2026-10-01")).toHaveLength(0);
    expect(await source.get("transactions", automatic.id)).toBeUndefined();
  });
  it("deduplicates against existing automatic transaction content when external rows have no identities", async () => {
    const d = await fresh();
    await addSchedule(d);
    const raw = readCSV(
      "Date,Time,Type,Category,Description,Amount,Payment method\n2026-10-01,00:00,expense,Subscriptions,Recurring,10,Cash",
    );
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("duplicate");
  });
  it.each([
    "2026-02-30,12:00,expense,Other,,,1,Cash,x",
    "2026-10-01,25:00,expense,Other,,,1,Cash,x",
    "2026-10-01,12:00,expense,Other,,,1.234,Cash,x",
    "2026-10-01,12:00,expense,Other,,,-1,Cash,x",
    "2026-10-01,12:00,transfer,Other,,,1,Cash,x",
  ])("blocks invalid rows atomically: %s", async (row) => {
    const d = await fresh(),
      raw = csv(row);
    const plan = await previewImport(d, raw, defaultMapping(raw));
    expect(plan.rows[0].status).toBe("invalid");
    await expect(commitImport(d, plan)).rejects.toThrow("invalid rows");
    expect(await d.count("transactions")).toBe(0);
    expect(await d.count("imports")).toBe(0);
  });
  it("rejects ambiguous mapping, stale previews and edited occurrence identities", async () => {
    const d = await fresh(),
      raw = csv(),
      m = defaultMapping(raw);
    await expect(
      previewImport(d, raw, { ...m, amount: m.date }),
    ).rejects.toThrow("at most once");
    const plan = await previewImport(d, raw, m);
    await saveTransaction(d, transaction({ description: "Arrived meanwhile" }));
    await expect(commitImport(d, plan)).rejects.toThrow(
      "changed since preview",
    );
    const freshPlan = await previewImport(d, raw, m);
    freshPlan.rows[0].transaction!.automatic = true;
    freshPlan.rows[0].transaction!.occurrenceKey = "plan:2026-10-01";
    await expect(commitImport(d, freshPlan)).rejects.toThrow("backup");
    expect(await d.count("imports")).toBe(0);
  });
  it("rolls back entity and transaction writes if committing an import fails", async () => {
    const d = await fresh(),
      raw = csv();
    const plan = await previewImport(d, raw, defaultMapping(raw));
    const before = canonical((await captureBackup(d)).data);
    const original = IDBObjectStore.prototype.add;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === "imports")
          throw new DOMException(
            "Simulated import quota",
            "QuotaExceededError",
          );
        return original.call(this, value, key);
      });
    await expect(commitImport(d, plan)).rejects.toThrow("Simulated");
    spy.mockRestore();
    expect(canonical((await captureBackup(d)).data)).toBe(before);
  });
  it("preserves import deduplication receipts across backup/restore and supports refund categories separately", async () => {
    const source = await fresh();
    const raw = csv(
      "2026-10-01,12:30,refund,School,Cafe,Refund,85.29,Cash,refund-source",
    );
    await commitImport(
      source,
      await previewImport(source, raw, defaultMapping(raw)),
    );
    const d = await fresh();
    await restoreBackup(
      d,
      await prepareRestore(d, await captureBackup(source), "replace"),
    );
    expect((await snapshot(d)).transactions[0].type).toBe("refund");
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("duplicate");
  });
  it("rejects fractional numeric cents rather than silently rounding spreadsheet data", async () => {
    const d = await fresh();
    const raw: RawTable = {
      name: "numeric",
      headers: ["Date", "Amount"],
      rows: [["2026-10-01", 1.005]],
    };
    expect(
      (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
    ).toBe("invalid");
  });
});

it("recognizes deleted automatic transaction IDs even in an external manual-looking file", async () => {
  const d = await fresh();
  const [auto] = await addSchedule(d);
  await deleteTransaction(d, auto.id);
  const raw = readCSV(`Date,Amount,Transaction ID\n2026-10-01,10,${auto.id}`);
  expect(
    (await previewImport(d, raw, defaultMapping(raw))).rows[0].status,
  ).toBe("duplicate");
  expect(await d.count("transactions")).toBe(0);
  expect(await reconcile(d, "2026-10-01")).toEqual([]);
});
