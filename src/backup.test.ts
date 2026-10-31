import { afterEach, describe, it, expect, vi } from "vitest";
import { deleteDB, openDB } from "idb";
import {
  openLedger,
  saveTransaction,
  deleteTransaction,
  type LedgerDB,
} from "./db";
import {
  ALL_STORES,
  captureBackup,
  canonical,
  validateBackup,
  prepareRestore,
  restoreBackup,
  type Backup,
} from "./backup";
import { richDatabase } from "./backup-fixtures";
import { reconcile, saveSchedule } from "./recurrence";
import { transaction } from "./test-fixtures";
const dbs: LedgerDB[] = [];
const extraNames: string[] = [];
async function fresh() {
  const d = await openLedger("backup-" + crypto.randomUUID());
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await deleteDB(d.name);
  }
  for (const n of extraNames.splice(0)) await deleteDB(n);
});
const clone = (b: Backup) => JSON.parse(JSON.stringify(b)) as Backup;
describe("complete backup and atomic restore", () => {
  it("round-trips every store, optional preference, identity, cursor and deletion/skip receipt", async () => {
    const source = await fresh();
    await richDatabase(source);
    const backup = await captureBackup(source);
    expect(backup.data.occurrences.some((o) => o.state === "deleted")).toBe(
      true,
    );
    expect(
      backup.data.occurrences.filter((o) => o.state === "skipped"),
    ).toHaveLength(2);
    expect(backup.data.imports).toHaveLength(1);
    const destination = await fresh();
    await saveTransaction(destination, transaction({ id: "remove-me" }));
    await restoreBackup(
      destination,
      await prepareRestore(
        destination,
        JSON.parse(JSON.stringify(backup)),
        "replace",
      ),
    );
    expect(canonical((await captureBackup(destination)).data)).toBe(
      canonical(backup.data),
    );
    expect(await destination.get("transactions", "remove-me")).toBeUndefined();
    destination.close();
    const reopened = await openLedger(destination.name);
    dbs.push(reopened);
    expect(canonical((await captureBackup(reopened)).data)).toBe(
      canonical(backup.data),
    );
  });
  it("does not regenerate deleted/skipped occurrences after restore, cursor replay, or schedule resume", async () => {
    const source = await fresh();
    const { schedule, deletedId } = await richDatabase(source);
    const d = await fresh();
    await restoreBackup(
      d,
      await prepareRestore(d, await captureBackup(source), "replace"),
    );
    expect(await reconcile(d, "2026-10-05")).toEqual([]);
    const restored = (await d.get("schedules", "plan"))!;
    await d.put("schedules", { ...restored, processedThrough: undefined });
    expect(await reconcile(d, "2026-10-05")).toEqual([]);
    expect(await d.get("transactions", deletedId)).toBeUndefined();
    expect((await d.get("occurrences", "plan:2026-10-01"))?.state).toBe(
      "deleted",
    );
    await saveSchedule(d, { ...schedule, paused: false }, true, "2026-10-07");
    expect((await reconcile(d, "2026-10-08")).map((t) => t.localDate)).toEqual([
      "2026-10-08",
    ]);
  });
  it("rejects corrupt backup before touching destination stores", async () => {
    const source = await fresh();
    await richDatabase(source);
    const valid = await captureBackup(source),
      destination = await fresh();
    await saveTransaction(destination, transaction({ id: "keep-me" }));
    const before = canonical((await captureBackup(destination)).data);
    const bad = clone(valid);
    bad.data.transactions[0].categoryId = "missing";
    await expect(prepareRestore(destination, bad, "replace")).rejects.toThrow(
      "category",
    );
    expect(canonical((await captureBackup(destination)).data)).toBe(before);
  });
  it("aborts and rolls back a real restore write failure after stores have been cleared", async () => {
    const source = await fresh();
    await richDatabase(source);
    const d = await fresh();
    await saveTransaction(d, transaction({ id: "keep-me" }));
    const before = canonical((await captureBackup(d)).data),
      plan = await prepareRestore(d, await captureBackup(source), "replace");
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (
          this.name === "categories" &&
          (value as { id: string }).id === "expense-1"
        )
          throw new DOMException(
            "Simulated storage failure",
            "QuotaExceededError",
          );
        return original.call(this, value, key);
      });
    await expect(restoreBackup(d, plan)).rejects.toThrow("Simulated");
    spy.mockRestore();
    expect(canonical((await captureBackup(d)).data)).toBe(before);
  });
  it("rejects stale restore previews and tampered candidates without partial writes", async () => {
    const d = await fresh(),
      source = await fresh();
    await richDatabase(source);
    const plan = await prepareRestore(
      d,
      await captureBackup(source),
      "replace",
    );
    await saveTransaction(d, transaction({ id: "arrived-later" }));
    await expect(restoreBackup(d, plan)).rejects.toThrow(
      "changed since preview",
    );
    expect(await d.get("transactions", "arrived-later")).toBeDefined();
    const current = await prepareRestore(
      d,
      await captureBackup(source),
      "replace",
    );
    current.candidate.data.preferences[0].currency = "USD" as "MXN";
    await expect(restoreBackup(d, current)).rejects.toThrow("preferences");
    expect(await d.get("transactions", "arrived-later")).toBeDefined();
  });
  it("merges compatible unions, retains current preferences/metadata, and is idempotent", async () => {
    const source = await fresh();
    await saveTransaction(source, transaction({ id: "incoming" }));
    const d = await fresh();
    await saveTransaction(
      d,
      transaction({ id: "existing", description: "different" }),
    );
    await d.put("metadata", { id: "custom", value: "current" });
    const backup = await captureBackup(source);
    await restoreBackup(d, await prepareRestore(d, backup, "merge"));
    expect(await d.count("transactions")).toBe(2);
    expect(await d.get("metadata", "custom")).toEqual({
      id: "custom",
      value: "current",
    });
    await restoreBackup(d, await prepareRestore(d, backup, "merge"));
    expect(await d.count("transactions")).toBe(2);
  });
  it("blocks merge conflicts and never resurrects a locally deleted recurring occurrence", async () => {
    const d = await fresh();
    await richDatabase(d);
    const older = await captureBackup(d);
    const automatic = older.data.transactions.find((t) => t.automatic)!;
    await deleteTransaction(d, automatic.id);
    const before = canonical((await captureBackup(d)).data);
    await expect(prepareRestore(d, older, "merge")).rejects.toThrow(
      "Merge conflict",
    );
    expect(canonical((await captureBackup(d)).data)).toBe(before);
    expect(await d.get("transactions", automatic.id)).toBeUndefined();
  });
  it("normalizes old schema backup shapes without discarding their original records", async () => {
    const d = await fresh();
    await saveTransaction(d, transaction({ id: "v1-record" }));
    const b = await captureBackup(d);
    const legacy = JSON.parse(JSON.stringify(b));
    legacy.databaseVersion = 1;
    legacy.data.metadata.find((m: { id: string }) => m.id === "schema").value =
      1;
    delete legacy.data.schedules;
    delete legacy.data.occurrences;
    delete legacy.data.budgets;
    delete legacy.data.imports;
    delete legacy.data.preferences[0].summaryMode;
    const validated = validateBackup(legacy);
    expect(validated.databaseVersion).toBe(5);
    expect(validated.data.transactions[0].id).toBe("v1-record");
    expect(validated.data.preferences[0].summaryMode).toBe("basic");
    expect(validated.data.imports).toEqual([]);
  });
  it("migrates an actual schema-2 database with tombstones/cursors to schema 4 without reseeding", async () => {
    const source = await fresh();
    await richDatabase(source);
    const b = await captureBackup(source);
    const name = "v2-" + crypto.randomUUID();
    extraNames.push(name);
    const old = await openDB(name, 2, {
      upgrade(db) {
        for (const s of ALL_STORES.filter(
          (s) => s !== "imports" && s !== "paymentMethods",
        )) {
          const store = db.createObjectStore(s, { keyPath: "id" });
          if (s === "transactions") {
            store.createIndex("by-date", "localDate");
            store.createIndex("by-category", "categoryId");
            store.createIndex("by-merchant", "merchantId");
            store.createIndex("by-occurrence", "occurrenceKey", {
              unique: true,
            });
          }
          if (s === "merchants")
            store.createIndex("by-name", "normalizedName", { unique: true });
          if (s === "occurrences")
            store.createIndex("by-schedule", "scheduleId");
        }
      },
    });
    for (const store of ALL_STORES.filter(
      (s) => s !== "imports" && s !== "paymentMethods",
    ))
      for (const r of b.data[store])
        await old.put(store, r.id === "schema" ? { ...r, value: 2 } : r);
    old.close();
    const upgraded = await openLedger(name);
    dbs.push(upgraded);
    const migrated = await captureBackup(upgraded);
    expect(migrated.data.occurrences).toEqual(b.data.occurrences);
    expect(migrated.data.schedules).toEqual(b.data.schedules);
    expect(migrated.data.transactions).toEqual(b.data.transactions);
    expect(migrated.data.imports).toEqual([]);
    expect(await reconcile(upgraded, "2026-10-05")).toEqual([]);
  });
});
describe("whole-backup validation", () => {
  const corruptions: [string, (b: Backup) => void][] = [
    ["version", (b) => (b.formatVersion = 9 as 1)],
    ["future schema", (b) => (b.databaseVersion = 99)],
    [
      "duplicate transaction",
      (b) => b.data.transactions.push(b.data.transactions[0]),
    ],
    ["decimal centavos", (b) => (b.data.transactions[0].amount = 1.5)],
    [
      "missing category",
      (b) => (b.data.transactions[0].categoryId = "missing"),
    ],
    ["merchant link", (b) => (b.data.transactions[0].merchantId = "missing")],
    [
      "refund link",
      (b) =>
        (b.data.transactions.find(
          (t) => t.type === "refund",
        )!.originalExpenseId = "missing"),
    ],
    ["invalid date", (b) => (b.data.transactions[0].localDate = "2026-02-30")],
    ["invalid time", (b) => (b.data.transactions[0].localTime = "25:00")],
    [
      "bad preference",
      (b) => (b.data.preferences[0].lastCategory.income = "expense-0"),
    ],
    [
      "missing fallback",
      (b) =>
        (b.data.categories.find(
          (c) => c.isFallback && c.kind === "income",
        )!.archived = true),
    ],
    [
      "duplicate merchant",
      (b) => b.data.merchants.push({ ...b.data.merchants[0], id: "other" }),
    ],
    [
      "bad schedule",
      (b) => (b.data.schedules[0].frequency = "hourly" as "daily"),
    ],
    ["bad end", (b) => (b.data.schedules[0].endDate = "1900-01-01")],
    [
      "cursor rollback",
      (b) => (b.data.schedules[0].processedThrough = "1900-01-01"),
    ],
    [
      "missing receipt",
      (b) =>
        (b.data.occurrences = b.data.occurrences.filter(
          (o) => o.state !== "generated",
        )),
    ],
    ["receipt identity", (b) => (b.data.occurrences[0].id = "wrong")],
    [
      "deleted live entry",
      (b) =>
        (b.data.occurrences.find((o) => o.state === "generated")!.state =
          "deleted"),
    ],
    [
      "skip with transaction",
      (b) =>
        (b.data.occurrences.find((o) => o.state === "skipped")!.transactionId =
          b.data.transactions[0].id),
    ],
    ["missing store", (b) => delete (b.data as Partial<typeof b.data>).imports],
    [
      "bad metadata",
      (b) => (b.data.metadata.find((m) => m.id === "schema")!.value = 1),
    ],
    [
      "automatic import receipt",
      (b) =>
        (b.data.imports[0].transactionId = b.data.transactions.find(
          (t) => t.automatic,
        )!.id),
    ],
  ];
  it.each(corruptions)("rejects %s", async (_name, mutate) => {
    const d = await fresh();
    await richDatabase(d);
    const b = await captureBackup(d);
    mutate(b);
    expect(() => validateBackup(b)).toThrow("Invalid backup");
  });
});
