import { afterEach, describe, it, expect } from "vitest";
import { openDB, deleteDB } from "idb";
import {
  openLedger,
  snapshot,
  saveBudget,
  deleteBudget,
  saveSummaryMode,
  saveTransaction,
  type LedgerDB,
} from "./db";
import { initialCategories, type Preferences } from "./model";
import { transaction } from "./test-fixtures";
import { reconcile } from "./recurrence";
const connections: { close: () => void }[] = [];
const names = new Set<string>();
afterEach(async () => {
  for (const d of connections.splice(0)) d.close();
  for (const name of names) await deleteDB(name);
  names.clear();
});
async function v1(name: string) {
  names.add(name);
  const d = await openDB(name, 1, {
    upgrade(db) {
      const t = db.createObjectStore("transactions", { keyPath: "id" });
      t.createIndex("by-date", "localDate");
      t.createIndex("by-category", "categoryId");
      t.createIndex("by-merchant", "merchantId");
      t.createIndex("by-occurrence", "occurrenceKey", { unique: true });
      db.createObjectStore("categories", { keyPath: "id" });
      const m = db.createObjectStore("merchants", { keyPath: "id" });
      m.createIndex("by-name", "normalizedName", { unique: true });
      db.createObjectStore("preferences", { keyPath: "id" });
      db.createObjectStore("metadata", { keyPath: "id" });
    },
  });
  connections.push(d);
  return d;
}
async function current() {
  const name = "migration-" + crypto.randomUUID();
  names.add(name);
  const d = await openLedger(name);
  connections.push(d);
  return d;
}
describe("non-destructive v1 → v2 migration", () => {
  it("preserves v1 rows, entity IDs, archived records, links, and all old preferences through upgrade and reopen", async () => {
    const name = "v1-" + crypto.randomUUID();
    const old = await v1(name);
    const merchant = {
      id: "provider",
      name: "Old Provider",
      normalizedName: "old provider",
      defaultCategoryId: "expense-4",
      archived: true,
    };
    const categories = initialCategories.map((c) =>
      c.id === "expense-4" ? { ...c, name: "Services", archived: true } : c,
    );
    const expense = transaction({
        id: "old-expense",
        categoryId: "expense-4",
        merchantId: "provider",
      }),
      refund = transaction({
        id: "old-refund",
        type: "refund",
        categoryId: "expense-4",
        merchantId: "provider",
        originalExpenseId: expense.id,
      }),
      income = transaction({
        id: "old-income",
        type: "income",
        categoryId: "income-2",
      });
    const prefs: Preferences = {
      id: "user",
      appearance: "dark",
      currency: "MXN",
      lastCategory: { expense: "expense-4", income: "income-2" },
    };
    const tx = old.transaction(
      ["categories", "merchants", "transactions", "preferences", "metadata"],
      "readwrite",
    );
    for (const c of categories) await tx.objectStore("categories").put(c);
    await tx.objectStore("merchants").put(merchant);
    for (const t of [expense, refund, income])
      await tx.objectStore("transactions").put(t);
    await tx.objectStore("preferences").put(prefs);
    await tx.objectStore("metadata").put({ id: "initialized", value: 1234 });
    await tx.objectStore("metadata").put({ id: "schema", value: 1 });
    await tx.done;
    old.close();
    const db = await openLedger(name);
    connections.push(db);
    const data = await snapshot(db);
    expect(data.transactions.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [expense, refund, income].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(data.categories.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      categories.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(data.merchants).toEqual([merchant]);
    expect(data.preferences).toEqual({ ...prefs, summaryMode: "basic" });
    expect(data.budgets).toEqual([]);
    expect(data.schedules).toEqual([]);
    expect(await db.get("metadata", "initialized")).toEqual({
      id: "initialized",
      value: 1234,
    });
    expect(await db.get("metadata", "schema")).toEqual({
      id: "schema",
      value: 4,
    });
    expect(await reconcile(db, "2026-10-19")).toEqual([]);
    await saveTransaction(
      db,
      { ...expense, description: "Updated after migration" },
      true,
    );
    db.close();
    const reopened = await openLedger(name);
    connections.push(reopened);
    expect((await reopened.get("transactions", expense.id))?.description).toBe(
      "Updated after migration",
    );
    expect((await snapshot(reopened)).categories).toHaveLength(12);
  });
  it("rolls back an interrupted version upgrade without altering v1 data, then upgrades successfully", async () => {
    const name = "abort-" + crypto.randomUUID();
    const old = await v1(name);
    await old.put("metadata", { id: "custom", value: "retained" });
    old.close();
    await expect(
      openDB(name, 2, {
        upgrade(db, _old, _new, tx) {
          db.createObjectStore("temporary");
          void tx.done.catch(() => {});
          tx.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const unchanged = await openDB(name, 1);
    connections.push(unchanged);
    expect(unchanged.version).toBe(1);
    expect(unchanged.objectStoreNames.contains("temporary")).toBe(false);
    expect(await unchanged.get("metadata", "custom")).toEqual({
      id: "custom",
      value: "retained",
    });
    unchanged.close();
    const upgraded = await openLedger(name);
    connections.push(upgraded);
    expect(upgraded.version).toBe(4);
    expect(await upgraded.get("metadata", "custom")).toEqual({
      id: "custom",
      value: "retained",
    });
  });
  it("does not destroy data when an obsolete v1 client tries to reopen after migration", async () => {
    const d = await current();
    await d.put("metadata", { id: "marker", value: "keep" });
    d.close();
    await expect(openDB(d.name, 1)).rejects.toMatchObject({
      name: "VersionError",
    });
    const reopened = await openLedger(d.name);
    connections.push(reopened);
    expect(await reopened.get("metadata", "marker")).toEqual({
      id: "marker",
      value: "keep",
    });
  });
});
describe("v2 settings persistence", () => {
  it("saves, updates, removes budgets without touching transactions; persists analytical mode and old theme fields", async () => {
    const d: LedgerDB = await current();
    const t = transaction();
    await saveTransaction(d, t);
    await saveBudget(d, { id: "overall", limit: 10000 });
    await saveBudget(d, {
      id: "expense-0",
      categoryId: "expense-0",
      limit: 5000,
    });
    await saveBudget(d, { id: "overall", limit: 20000 });
    await saveSummaryMode(d, "analytical");
    d.close();
    const reopened = await openLedger(d.name);
    connections.push(reopened);
    expect((await snapshot(reopened)).preferences).toMatchObject({
      appearance: "system",
      summaryMode: "analytical",
      currency: "MXN",
      lastCategory: { expense: "expense-0" },
    });
    expect((await snapshot(reopened)).budgets).toHaveLength(2);
    expect(await reopened.get("budgets", "overall")).toEqual({
      id: "overall",
      limit: 20000,
    });
    await deleteBudget(reopened, "overall");
    expect(await reopened.count("budgets")).toBe(1);
    expect(await reopened.get("transactions", t.id)).toEqual(t);
  });
  it("rejects invalid or income-category limits", async () => {
    const d = await current();
    for (const b of [
      { id: "overall", limit: 0 },
      { id: "overall", limit: 1.1 },
      { id: "overall", limit: -1 },
      { id: "income-0", categoryId: "income-0", limit: 100 },
      { id: "wrong", limit: 100 },
    ])
      await expect(saveBudget(d, b)).rejects.toThrow();
    expect(await d.count("budgets")).toBe(0);
  });
});
