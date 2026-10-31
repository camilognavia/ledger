import { afterEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import {
  openLedger,
  snapshot,
  saveTransaction,
  saveMerchant,
  type LedgerDB,
} from "./db";
import {
  ALL_STORES,
  canonical,
  captureBackup,
  prepareRestore,
  restoreBackup,
  validateBackup,
} from "./backup";
import { transaction } from "./test-fixtures";
import { richDatabase } from "./backup-fixtures";
import { saveSchedule, reconcile } from "./recurrence";
import {
  emptyFilters,
  filterTransactions,
  merchantTotals,
  merchantFilterOptions,
  merchantLabel,
  type RecurringSchedule,
} from "./model";
import { previewImport, defaultMapping, commitImport } from "./imports";
import {
  readCSV,
  exportCSV,
  exportXLSX,
  readXLSX,
  workbook,
} from "./spreadsheets";
import { budgetUsage } from "./finance";
const dbs: LedgerDB[] = [];
async function fresh() {
  const d = await openLedger("release12-" + crypto.randomUUID());
  dbs.push(d);
  return d;
}
afterEach(async () => {
  const connections = dbs.splice(0);
  for (const d of connections) d.close();
  for (const name of new Set(connections.map((d) => d.name)))
    await deleteDB(name);
});

const schedule = (
  overrides: Partial<RecurringSchedule> = {},
): RecurringSchedule => ({
  id: "legacy",
  name: "Legacy plan",
  type: "expense",
  amount: 1000,
  categoryId: "expense-4",
  description: "",
  paymentMethod: "",
  frequency: "monthly",
  startDate: "2026-01-31",
  paused: false,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
describe("Ledger 1.2 merchant storage and payment policy", () => {
  it("records, edits and reopens one-time/blank merchants without creating entities or schedules", async () => {
    const d = await fresh(),
      t = transaction({ merchantName: "Street stall" });
    await saveTransaction(d, t);
    await saveTransaction(d, transaction({ description: "No merchant" }));
    await saveTransaction(
      d,
      { ...t, merchantName: "Other stall", description: "Edited" },
      true,
    );
    expect(await d.count("merchants")).toBe(0);
    expect(await d.count("schedules")).toBe(0);
    d.close();
    const reopened = await openLedger(d.name);
    dbs.push(reopened);
    expect(await reopened.get("transactions", t.id)).toMatchObject({
      merchantName: "Other stall",
      description: "Edited",
    });
    expect((await snapshot(reopened)).transactions).toHaveLength(2);
  });
  it("saves recurring merchants only explicitly, retains IDs/archives, and never converts same-name one-time rows", async () => {
    const d = await fresh(),
      t = transaction({ merchantName: "Cafe" });
    await saveTransaction(d, t);
    const m = {
      id: "cafe",
      name: "Cafe",
      normalizedName: "",
      archived: false,
      defaultCategoryId: "expense-1",
    };
    await saveMerchant(d, m);
    const saved = transaction({ merchantId: m.id });
    await saveTransaction(d, saved);
    await saveMerchant(d, { ...m, name: "Cafe renamed", archived: true });
    expect(await d.get("transactions", t.id)).toEqual(t);
    expect(await d.get("transactions", saved.id)).toEqual(saved);
    expect(merchantLabel(t, (await snapshot(d)).merchants)).toBe("Cafe");
    expect(merchantLabel(saved, (await snapshot(d)).merchants)).toBe(
      "Cafe renamed",
    );
    expect(await d.count("schedules")).toBe(0);
  });
  it("searches and filters saved/one-time names together without changing identities, with combined existing filters", () => {
    const merchants = [
      {
        id: "cafe",
        name: "Cafe Ciencias",
        normalizedName: "cafe ciencias",
        archived: true,
      },
    ];
    const a = transaction({ id: "saved", merchantId: "cafe" }),
      b = transaction({ id: "one", merchantName: " CAFE   Ciencias " }),
      c = transaction({ id: "different", merchantName: "Market" });
    const rows = [a, b, c],
      before = canonical(rows);
    const f = {
      ...emptyFilters,
      query: "cafe ciencias",
      merchantId: "cafe",
      categoryId: "expense-0",
      type: "expense",
      paymentMethod: "value:cash",
      from: a.localDate,
      to: a.localDate,
      min: "80",
      max: "90",
    };
    expect(
      filterTransactions(rows, merchants, f)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["one", "saved"]);
    expect(
      filterTransactions(rows, merchants, {
        ...emptyFilters,
        merchantId: "one-time:market",
      }),
    ).toEqual([c]);
    expect(merchantFilterOptions(merchants, rows)).toHaveLength(2);
    expect(canonical(rows)).toBe(before);
  });
  it("aggregates matching names only for analysis, keeps refunds/income accounting and budgets unchanged", () => {
    const merchants = [
      { id: "cafe", name: "Cafe", normalizedName: "cafe", archived: false },
    ];
    const rows = [
      transaction({ merchantId: "cafe", amount: 10000 }),
      transaction({ merchantName: " CAFE ", amount: 5000 }),
      transaction({ merchantName: "Cafe", type: "refund", amount: 2000 }),
      transaction({
        merchantName: "Cafe",
        type: "income",
        categoryId: "income-0",
        amount: 50000,
      }),
    ];
    const grouped = merchantTotals(rows, merchants);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      name: "Cafe",
      expenses: 15000,
      refunds: 2000,
      income: 50000,
      netSpending: 13000,
      netCashFlow: 37000,
    });
    expect(
      budgetUsage({ id: "overall", limit: 20000 }, rows, "2026-10"),
    ).toMatchObject({ used: 13000, available: 7000 });
  });
  it.each(["expense", "income", "refund"] as const)(
    "rejects methodless %s creates/edits without changing historical records",
    async (type) => {
      const d = await fresh(),
        t = transaction({
          type,
          categoryId: type === "income" ? "income-0" : "expense-0",
          paymentMethod: "",
        });
      await expect(saveTransaction(d, t)).rejects.toThrow("payment method");
      expect(await d.count("transactions")).toBe(0);
      await d.put("transactions", t);
      await expect(
        saveTransaction(d, { ...t, description: "Edited" }, true),
      ).rejects.toThrow("payment method");
      expect(await d.get("transactions", t.id)).toEqual(t);
      await saveTransaction(d, { ...t, paymentMethod: "Other" }, true);
      expect((await d.get("transactions", t.id))?.paymentMethod).toBe("Other");
    },
  );
  it("preserves unspecified historic records in reports, filters and exports; backup restores exact strings", async () => {
    const source = await fresh(),
      t = transaction({ paymentMethod: "", merchantName: "Old stall" });
    await source.put("transactions", t);
    const b = await captureBackup(source),
      dest = await fresh();
    await restoreBackup(dest, await prepareRestore(dest, b, "replace"));
    expect(await dest.get("transactions", t.id)).toEqual(t);
    expect(
      filterTransactions((await snapshot(dest)).transactions, [], {
        ...emptyFilters,
        paymentMethod: "unspecified",
      }),
    ).toEqual([t]);
    expect(readCSV(exportCSV(await snapshot(dest))).rows[0][7]).toBe("");
  });
  it.each(["", "   ", "\t"])(
    "requires a payment method on new/edited schedules (%j)",
    async (paymentMethod) => {
      const d = await fresh();
      await expect(
        saveSchedule(d, schedule({ paymentMethod }), false, "2026-01-31"),
      ).rejects.toThrow("payment method");
      await d.put("schedules", schedule());
      await expect(
        saveSchedule(d, schedule({ paymentMethod }), true, "2026-01-31"),
      ).rejects.toThrow("payment method");
      expect(await d.count("transactions")).toBe(0);
    },
  );
  it("holds legacy schedules without touching cursors/receipts, lets other schedules run, and catches up once under old terms", async () => {
    const d = await fresh();
    const legacy = schedule({ processedThrough: "2026-01-31" });
    await d.put("schedules", legacy);
    await d.put("occurrences", {
      id: "legacy:2026-01-31",
      scheduleId: "legacy",
      date: "2026-01-31",
      state: "deleted",
      transactionId: "removed",
    });
    await d.put("occurrences", {
      id: "legacy:2026-02-28",
      scheduleId: "legacy",
      date: "2026-02-28",
      state: "skipped",
    });
    // A valid old receipt may sit ahead of a replayed cursor; no regeneration is permitted.
    const receiptBefore = await d.getAll("occurrences");
    await saveSchedule(
      d,
      schedule({
        id: "healthy",
        paymentMethod: "Cash",
        startDate: "2026-03-31",
      }),
      false,
      "2026-03-31",
    );
    expect(await reconcile(d, "2026-04-30")).toHaveLength(1);
    expect(await d.get("schedules", "legacy")).toEqual(legacy);
    expect(await d.getAll("occurrences")).toEqual(
      expect.arrayContaining(receiptBefore),
    );
    const catchup = await saveSchedule(
      d,
      {
        ...legacy,
        paymentMethod: "Bank Transfer",
        amount: 9900,
        frequency: "daily",
        startDate: "2026-04-30",
      },
      true,
      "2026-04-30",
    );
    expect(
      catchup.map((t) => [t.localDate, t.amount, t.paymentMethod]),
    ).toEqual([
      ["2026-03-31", 1000, "Bank Transfer"],
      ["2026-04-30", 1000, "Bank Transfer"],
    ]);
    expect((await d.get("occurrences", "legacy:2026-01-31"))?.state).toBe(
      "deleted",
    );
    expect((await d.get("occurrences", "legacy:2026-02-28"))?.state).toBe(
      "skipped",
    );
    expect(await reconcile(d, "2026-04-30")).toEqual([]);
    const next = await reconcile(d, "2026-05-01");
    expect(
      next.filter((t) => t.recurringScheduleId === "legacy"),
    ).toMatchObject([
      { localDate: "2026-05-01", amount: 9900, paymentMethod: "Bank Transfer" },
    ]);
    expect(await reconcile(d, "2026-05-01")).toEqual([]);
  });
  it("restores a held legacy schedule, then concurrent corrections produce each leap/month-end occurrence once", async () => {
    const source = await fresh();
    await source.put(
      "schedules",
      schedule({ startDate: "2024-01-31", processedThrough: "2024-01-31" }),
    );
    const dest = await fresh();
    await restoreBackup(
      dest,
      await prepareRestore(dest, await captureBackup(source), "replace"),
    );
    const second = await openLedger(dest.name);
    dbs.push(second);
    const input = {
      ...(await dest.get("schedules", "legacy"))!,
      paymentMethod: "Cash",
    };
    const results = await Promise.all([
      saveSchedule(dest, input, true, "2024-03-31"),
      saveSchedule(second, input, true, "2024-03-31"),
    ]);
    expect(
      results
        .flat()
        .map((t) => t.localDate)
        .sort(),
    ).toEqual(["2024-02-29", "2024-03-31"]);
    expect(await dest.count("transactions")).toBe(2);
    expect(await reconcile(dest, "2024-03-31")).toEqual([]);
  });
  it("keeps held paused dates skipped when corrected and resumed, without charging them", async () => {
    const d = await fresh();
    await d.put(
      "schedules",
      schedule({ paused: true, startDate: "2026-01-31" }),
    );
    expect(await reconcile(d, "2026-02-28")).toEqual([]);
    expect(
      (await d.get("schedules", "legacy"))?.processedThrough,
    ).toBeUndefined();
    expect(
      await saveSchedule(
        d,
        schedule({ paused: false, paymentMethod: "Cash" }),
        true,
        "2026-02-28",
      ),
    ).toEqual([]);
    expect((await d.getAll("occurrences")).map((o) => o.state)).toEqual([
      "skipped",
      "skipped",
    ]);
    expect((await reconcile(d, "2026-03-31"))[0].localDate).toBe("2026-03-31");
  });
  it.each(["csv", "xlsx"])(
    "imports/exports one-time names as %s without adding or associating recurring merchants",
    async (kind) => {
      const source = await fresh();
      await saveMerchant(source, {
        id: "known",
        name: "Cafe",
        normalizedName: "",
        archived: false,
      });
      await saveTransaction(
        source,
        transaction({ merchantName: "Cafe", amount: 8529 }),
      );
      await saveTransaction(
        source,
        transaction({ merchantName: "Street stall", amount: 1234 }),
      );
      const data = await snapshot(source),
        table =
          kind === "csv"
            ? readCSV(exportCSV(data))
            : await readXLSX(new Uint8Array(await exportXLSX(data)).buffer);
      const d = await fresh();
      await saveMerchant(d, {
        id: "other-id",
        name: "Cafe",
        normalizedName: "",
        archived: false,
      });
      const plan = await previewImport(d, table, defaultMapping(table));
      expect(plan.merchants).toEqual([]);
      await commitImport(d, plan);
      expect(await d.count("merchants")).toBe(1);
      expect(
        (await snapshot(d)).transactions.every(
          (t) => !t.merchantId && !!t.merchantName,
        ),
      ).toBe(true);
      expect(
        (await previewImport(d, table, defaultMapping(table))).rows.every(
          (r) => r.status === "duplicate",
        ),
      ).toBe(true);
      expect(
        typeof (await workbook(await snapshot(d)))
          .getWorksheet("Transactions")!
          .getCell("G2").value,
      ).toBe("number");
    },
  );
  it("blocks missing import payments by default, allows explicit historical compatibility and rechecks tampered plans", async () => {
    const d = await fresh(),
      raw = readCSV("Date,Amount,Merchant\n2026-10-01,1,Old merchant"),
      mapping = defaultMapping(raw);
    const blocked = await previewImport(d, raw, mapping);
    expect(blocked.rows[0]).toMatchObject({
      status: "invalid",
      message: "Choose a payment method.",
    });
    await expect(commitImport(d, blocked)).rejects.toThrow("invalid rows");
    const legacy = await previewImport(d, raw, mapping, {
      allowMissingPaymentMethods: true,
    });
    expect(legacy.rows[0].message).toContain("Historical");
    legacy.allowMissingPaymentMethods = false;
    await expect(commitImport(d, legacy)).rejects.toThrow("payment method");
    expect(await d.count("transactions")).toBe(0);
    legacy.allowMissingPaymentMethods = true;
    await commitImport(d, legacy);
    expect((await snapshot(d)).transactions[0]).toMatchObject({
      paymentMethod: "",
      merchantName: "Old merchant",
    });
    expect(await d.count("merchants")).toBe(0);
  });
  it("round-trips both merchant types, historical payment gaps, recurring state and budgets atomically", async () => {
    const source = await fresh();
    await richDatabase(source);
    await saveTransaction(source, transaction({ merchantName: "One-off" }));
    await source.put(
      "transactions",
      transaction({ id: "historic", paymentMethod: "" }),
    );
    const b = await captureBackup(source),
      dest = await fresh();
    await restoreBackup(dest, await prepareRestore(dest, b, "replace"));
    expect(canonical((await captureBackup(dest)).data)).toBe(canonical(b.data));
    await restoreBackup(dest, await prepareRestore(dest, b, "merge"));
    expect(canonical((await captureBackup(dest)).data)).toBe(canonical(b.data));
    expect(await reconcile(dest, "2026-10-05")).toEqual([]);
  });
  it.each(["both", "long", "empty", "null"])(
    "rejects corrupt one-time merchant %s before writes",
    async (kind) => {
      const d = await fresh();
      await saveMerchant(d, {
        id: "saved",
        name: "Saved",
        normalizedName: "",
        archived: false,
      });
      await saveTransaction(d, transaction({ merchantName: "One-time" }));
      const b = await captureBackup(d),
        before = canonical(b.data),
        t = b.data.transactions[0];
      if (kind === "both") t.merchantId = "saved";
      if (kind === "long") t.merchantName = "a".repeat(81);
      if (kind === "empty") t.merchantName = "";
      if (kind === "null")
        (t as unknown as Record<string, unknown>).merchantName = null;
      await expect(prepareRestore(d, b, "replace")).rejects.toThrow(
        "Invalid backup",
      );
      expect(canonical((await captureBackup(d)).data)).toBe(before);
    },
  );
  it("upgrades an actual v4 fixture preserving all ten stores, old associations, method gaps and receipts", async () => {
    const source = await fresh();
    await richDatabase(source);
    await source.put(
      "transactions",
      transaction({
        id: "missing-payment",
        merchantId: "provider",
        paymentMethod: "",
      }),
    );
    await source.put("schedules", schedule({ id: "held" }));
    const b = await captureBackup(source),
      name = "schema4-" + crypto.randomUUID();
    const old = await openDB(name, 4, {
      upgrade(db) {
        for (const table of ALL_STORES) {
          const st = db.createObjectStore(table, { keyPath: "id" });
          if (table === "transactions")
            for (const [index, key] of [
              ["by-date", "localDate"],
              ["by-category", "categoryId"],
              ["by-merchant", "merchantId"],
              ["by-occurrence", "occurrenceKey"],
            ])
              st.createIndex(index, key, { unique: index === "by-occurrence" });
          if (table === "merchants" || table === "paymentMethods")
            st.createIndex("by-name", "normalizedName", { unique: true });
          if (table === "imports") {
            st.createIndex("by-fingerprint", "fingerprint");
            st.createIndex("by-source", "sourceId");
          }
          if (table === "occurrences")
            st.createIndex("by-schedule", "scheduleId");
        }
      },
    });
    for (const table of ALL_STORES)
      for (const row of b.data[table])
        await old.put(
          table,
          table === "metadata" && row.id === "schema"
            ? { ...row, value: 4 }
            : row,
        );
    old.close();
    const upgraded = await openLedger(name);
    dbs.push(upgraded);
    expect(canonical((await captureBackup(upgraded)).data)).toBe(
      canonical(b.data),
    );
    const legacy = JSON.parse(JSON.stringify(b));
    legacy.databaseVersion = 4;
    legacy.data.metadata.find((m: { id: string }) => m.id === "schema").value =
      4;
    expect(validateBackup(legacy).data).toEqual(b.data);
    const dest = await fresh();
    await restoreBackup(dest, await prepareRestore(dest, legacy, "replace"));
    expect(
      (await dest.get("transactions", "missing-payment"))?.paymentMethod,
    ).toBe("");
    expect(await reconcile(dest, "2026-10-05")).toEqual([]);
  });
});
