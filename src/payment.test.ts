import { afterEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  openLedger,
  snapshot,
  savePaymentMethod,
  saveTransaction,
  type LedgerDB,
} from "./db";
import {
  ALL_STORES,
  canonical,
  captureBackup,
  prepareRestore,
  restoreBackup,
  type Backup,
} from "./backup";
import { transaction } from "./test-fixtures";
import { richDatabase } from "./backup-fixtures";
import { reconcile } from "./recurrence";
import { emptyFilters, filterTransactions, normalizeName } from "./model";
import { paymentOptions } from "./PaymentField";
import {
  exportCSV,
  exportXLSX,
  readCSV,
  readXLSX,
  workbook,
} from "./spreadsheets";
import { previewImport, defaultMapping, commitImport } from "./imports";
const dbs: LedgerDB[] = [],
  names: string[] = [];
async function fresh() {
  const d = await openLedger("payment-" + crypto.randomUUID());
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await deleteDB(d.name);
  }
  for (const n of names.splice(0)) await deleteDB(n);
});
const method = (name: string) => ({
  id: crypto.randomUUID(),
  name,
  normalizedName: "",
  archived: false,
});
describe("payment metadata and compatibility", () => {
  it("creates, renames, archives, reopens; never rewrites recorded payment text", async () => {
    const d = await fresh();
    const t = transaction({ paymentMethod: "  Wallet cash  " });
    await saveTransaction(d, t);
    const m = method("Wallet cash");
    await savePaymentMethod(d, m);
    await savePaymentMethod(d, { ...m, name: "Petty cash", archived: true });
    expect(await d.get("transactions", t.id)).toEqual(t);
    d.close();
    const reopened = await openLedger(d.name);
    dbs.push(reopened);
    expect(await reopened.get("paymentMethods", m.id)).toMatchObject({
      name: "Petty cash",
      normalizedName: "petty cash",
      archived: true,
    });
    await expect(
      savePaymentMethod(reopened, method("  PETTY   CASH ")),
    ).rejects.toThrow("already exists");
    await expect(savePaymentMethod(reopened, method(" "))).rejects.toThrow(
      "1–80",
    );
  });
  it("migrates an actual schema-3 database, preserving all nine stores and recurrence state", async () => {
    const source = await fresh();
    await richDatabase(source);
    await saveTransaction(
      source,
      transaction({ paymentMethod: "  My   Wallet  " }),
    );
    const b = await captureBackup(source);
    const name = "v3-" + crypto.randomUUID();
    names.push(name);
    const stores = ALL_STORES.filter((s) => s !== "paymentMethods");
    const old = await openDB(name, 3, {
      upgrade(db) {
        for (const s of stores) {
          const st = db.createObjectStore(s, { keyPath: "id" });
          if (s === "transactions")
            for (const [key, path] of [
              ["by-date", "localDate"],
              ["by-category", "categoryId"],
              ["by-merchant", "merchantId"],
              ["by-occurrence", "occurrenceKey"],
            ])
              st.createIndex(key, path, { unique: key === "by-occurrence" });
          if (s === "merchants")
            st.createIndex("by-name", "normalizedName", { unique: true });
          if (s === "occurrences") st.createIndex("by-schedule", "scheduleId");
          if (s === "imports") {
            st.createIndex("by-fingerprint", "fingerprint");
            st.createIndex("by-source", "sourceId");
          }
        }
      },
    });
    for (const s of stores)
      for (const r of b.data[s])
        await old.put(
          s,
          s === "metadata" && r.id === "schema" ? { ...r, value: 3 } : r,
        );
    old.close();
    const upgraded = await openLedger(name);
    dbs.push(upgraded);
    const result = await captureBackup(upgraded);
    for (const s of stores.filter((s) => s !== "metadata"))
      expect(canonical(result.data[s])).toBe(canonical(b.data[s]));
    expect(result.data.metadata).toEqual(b.data.metadata);
    expect(result.data.paymentMethods).toHaveLength(6);
    expect(
      result.data.paymentMethods.find((m) => m.name === "My Wallet"),
    ).toBeDefined();
    expect(await reconcile(upgraded, "2026-10-05")).toEqual([]);
    expect(await upgraded.get("metadata", "schema")).toEqual({
      id: "schema",
      value: 4,
    });
  });
  it("round-trips payment metadata atomically with all existing recurrence and import receipts", async () => {
    const source = await fresh();
    await richDatabase(source);
    const m = method("Wallet");
    await savePaymentMethod(source, { ...m, archived: true });
    const b = await captureBackup(source),
      dest = await fresh();
    await restoreBackup(dest, await prepareRestore(dest, b, "replace"));
    expect(canonical((await captureBackup(dest)).data)).toBe(canonical(b.data));
    expect(await reconcile(dest, "2026-10-05")).toEqual([]);
    await restoreBackup(dest, await prepareRestore(dest, b, "merge"));
    expect(canonical((await captureBackup(dest)).data)).toBe(canonical(b.data));
  });
  it("restores old schema-3 backups and derives choices without altering legacy strings", async () => {
    const source = await fresh();
    await saveTransaction(
      source,
      transaction({ paymentMethod: "Legacy wallet" }),
    );
    const b = await captureBackup(source);
    b.databaseVersion = 3;
    b.data.metadata.find((m) => m.id === "schema")!.value = 3;
    delete (b.data as Partial<Backup["data"]>).paymentMethods;
    const dest = await fresh();
    await restoreBackup(dest, await prepareRestore(dest, b, "replace"));
    expect((await snapshot(dest)).transactions[0].paymentMethod).toBe(
      "Legacy wallet",
    );
    expect(
      (await snapshot(dest)).paymentMethods.some(
        (m) => m.name === "Legacy wallet",
      ),
    ).toBe(true);
  });
  it.each([
    "null",
    "duplicate",
    "normalization",
    "boolean",
    "missing",
    "unknown",
  ])("rejects %s payment metadata before any write", async (kind) => {
    const d = await fresh(),
      b = await captureBackup(d),
      before = canonical(b.data);
    const raw = b.data as unknown as Record<string, unknown>;
    if (kind === "null") raw.paymentMethods = null;
    if (kind === "duplicate")
      b.data.paymentMethods.push({
        ...b.data.paymentMethods[0],
        id: "duplicate",
      });
    if (kind === "normalization")
      b.data.paymentMethods[0].normalizedName = "wrong";
    if (kind === "boolean")
      (
        b.data.paymentMethods[0] as unknown as Record<string, unknown>
      ).archived = "yes";
    if (kind === "missing") delete raw.paymentMethods;
    if (kind === "unknown")
      (b.data.paymentMethods[0] as unknown as Record<string, unknown>).balance =
        100;
    await expect(prepareRestore(d, b, "replace")).rejects.toThrow(
      "Invalid backup",
    );
    expect(canonical((await captureBackup(d)).data)).toBe(before);
  });
  it("deduplicates filter choices and retains referenced archives/custom/legacy values", async () => {
    const d = await fresh(),
      cash = (await d.get("paymentMethods", "payment-0"))!;
    await savePaymentMethod(d, { ...cash, archived: true });
    const choices = paymentOptions(
      (await snapshot(d)).paymentMethods,
      ["cash", " CASH  ", "Custom wallet", " Legacy   transfer "],
      true,
    );
    expect(choices.filter(([k]) => k === "cash")).toHaveLength(1);
    expect(choices).toContainEqual(["legacy transfer", "Legacy transfer"]);
    expect(choices).toContainEqual(["custom wallet", "Custom wallet"]);
    expect(
      paymentOptions((await snapshot(d)).paymentMethods).some(
        ([k]) => k === "cash",
      ),
    ).toBe(false);
  });
  it("combines payment, type, category, merchant, range, amount and text filters without mutation", () => {
    const selected = transaction({
      id: "yes",
      paymentMethod: "  CREDIT   card ",
      merchantId: "shop",
      description: "Shoes",
      amount: 5000,
    });
    const rows = [
      selected,
      transaction({ ...selected, id: "no-payment", paymentMethod: "" }),
      transaction({ ...selected, id: "refund", type: "refund" }),
      transaction({ ...selected, id: "different", merchantId: "else" }),
    ];
    const before = canonical(rows);
    const f = {
      ...emptyFilters,
      paymentMethod: "value:credit card",
      type: "expense",
      categoryId: selected.categoryId,
      merchantId: "shop",
      from: selected.localDate,
      to: selected.localDate,
      min: "50",
      max: "50",
      query: "shoes",
    };
    expect(filterTransactions(rows, [], f).map((t) => t.id)).toEqual(["yes"]);
    expect(
      filterTransactions(rows, [], {
        ...emptyFilters,
        paymentMethod: "unspecified",
      }).map((t) => t.id),
    ).toEqual(["no-payment"]);
    expect(canonical(rows)).toBe(before);
  });
  it.each(["csv", "xlsx"])(
    "preserves recorded payment strings and numeric amounts through %s export/import after rename",
    async (kind) => {
      const source = await fresh();
      await saveTransaction(
        source,
        transaction({ paymentMethod: "Legacy wallet", amount: 8529 }),
      );
      const m = method("Legacy wallet");
      await savePaymentMethod(source, m);
      await savePaymentMethod(source, {
        ...m,
        name: "Renamed wallet",
        archived: true,
      });
      const data = await snapshot(source);
      const table =
        kind === "csv"
          ? readCSV(exportCSV(data))
          : await readXLSX(new Uint8Array(await exportXLSX(data)).buffer);
      expect(table.rows[0][7]).toBe("Legacy wallet");
      const wb = await workbook(data);
      expect(wb.getWorksheet("Transactions")!.getCell("G2").value).toBe(85.29);
      const dest = await fresh();
      await commitImport(
        dest,
        await previewImport(dest, table, defaultMapping(table)),
      );
      expect((await snapshot(dest)).transactions[0]).toMatchObject({
        paymentMethod: "Legacy wallet",
        amount: 8529,
        automatic: false,
      });
      expect(
        (await previewImport(dest, table, defaultMapping(table))).rows[0]
          .status,
      ).toBe("duplicate");
    },
  );
  it("preserves approved CSS and transaction type/amount controls byte-for-byte", () => {
    const css = readFileSync("src/style.css");
    expect(createHash("sha256").update(css).digest("hex")).toBe(
      "6ffd609730e71adab2d45fd06c0c780323bd61b29862d158c75cf83a17c1f339",
    );
    const form = readFileSync("src/TransactionForm.tsx", "utf8");
    const controls = form.slice(
      form.indexOf('      <div className="segmented"'),
      form.indexOf('      <div className="optional-fields"'),
    );
    expect(controls).toBe(
      readFileSync("tests/fixtures/entry-controls-v1.txt", "utf8"),
    );
    expect(normalizeName("  CASH ")).toBe("cash");
  });
});
