import { afterEach, describe, it, expect } from "vitest";
import { deleteDB, openDB } from "idb";
import {
  openLedger,
  snapshot,
  saveTransaction,
  deleteTransaction,
  saveCategory,
  saveMerchant,
  saveAppearance,
  type LedgerDB,
  DATABASE_VERSION,
} from "./db";
import { transaction } from "./test-fixtures";
const opened: { name: string; db: LedgerDB }[] = [];
async function fresh() {
  const name = "ledger-test-" + crypto.randomUUID();
  const db = await openLedger(name);
  opened.push({ name, db });
  return db;
}
afterEach(async () => {
  for (const { db, name } of opened.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
describe("IndexedDB schema and data integrity", () => {
  it("initializes schema v2 and seeds exactly once across reopen", async () => {
    const db = await fresh();
    expect(db.version).toBe(DATABASE_VERSION);
    expect((await snapshot(db)).categories).toHaveLength(12);
    const name = db.name;
    db.close();
    const reopened = await openLedger(name);
    opened.push({ name, db: reopened });
    expect((await snapshot(reopened)).categories).toHaveLength(12);
    expect(await reopened.get("metadata", "schema")).toEqual({
      id: "schema",
      value: DATABASE_VERSION,
    });
  });
  it("creates, persists, edits and deletes transactions", async () => {
    const db = await fresh();
    const t = transaction();
    await saveTransaction(db, t);
    db.close();
    const reopened = await openLedger(db.name);
    opened.push({ db: reopened, name: db.name });
    expect((await snapshot(reopened)).transactions[0]).toEqual(t);
    await saveTransaction(
      reopened,
      { ...t, amount: 10025, description: "Lunch" },
      true,
    );
    expect((await reopened.get("transactions", t.id))?.amount).toBe(10025);
    await deleteTransaction(reopened, t.id);
    expect((await snapshot(reopened)).transactions).toHaveLength(0);
  });
  it("rejects duplicate submission ID and wrong category without partial changes", async () => {
    const db = await fresh();
    const t = transaction();
    await saveTransaction(db, t);
    await expect(saveTransaction(db, t)).rejects.toThrow();
    expect((await snapshot(db)).transactions).toHaveLength(1);
    await expect(
      saveTransaction(
        db,
        transaction({ type: "income", categoryId: "expense-0" }),
      ),
    ).rejects.toThrow("category");
    expect((await snapshot(db)).transactions).toHaveLength(1);
  });
  it("keeps category and merchant relationships through rename/archive; blocks new archived use", async () => {
    const db = await fresh();
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe",
      normalizedName: "",
      archived: false,
    });
    const t = transaction({ merchantId: "cafe" });
    await saveTransaction(db, t);
    const c = (await db.get("categories", "expense-0"))!;
    await saveCategory(db, { ...c, name: "Dining", archived: true });
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe Ciencias",
      normalizedName: "",
      archived: true,
    });
    const s = await snapshot(db);
    expect(s.transactions[0].merchantId).toBe("cafe");
    expect(s.categories.find((x) => x.id === t.categoryId)?.name).toBe(
      "Dining",
    );
    await saveTransaction(db, { ...t, description: "New text" }, true);
    await expect(
      saveTransaction(db, transaction({ categoryId: c.id })),
    ).rejects.toThrow("active category");
  });
  it("prevents duplicate merchant names, even archived, and category names within kind", async () => {
    const db = await fresh();
    await saveMerchant(db, {
      id: "a",
      name: " Cafe   Ciencias ",
      normalizedName: "",
      archived: true,
    });
    await expect(
      saveMerchant(db, {
        id: "b",
        name: "cafe ciencias",
        normalizedName: "",
        archived: false,
      }),
    ).rejects.toThrow("already exists");
    await expect(
      saveCategory(db, {
        id: "new",
        name: "Food & Drinks",
        kind: "expense",
        icon: "circle",
        color: "",
        archived: false,
      }),
    ).rejects.toThrow("already exists");
  });
  it("protects Other and rejects unknown merchant or deleted edit target", async () => {
    const db = await fresh();
    const fallback = (await db.get("categories", "expense-7"))!;
    await expect(
      saveCategory(db, { ...fallback, archived: true }),
    ).rejects.toThrow("Other");
    await expect(
      saveTransaction(db, transaction({ merchantId: "unknown" })),
    ).rejects.toThrow("merchant");
    await expect(saveTransaction(db, transaction(), true)).rejects.toThrow(
      "removed",
    );
  });
  it("links refund, removes dangling link when original is deleted and keeps refund intact", async () => {
    const db = await fresh();
    const expense = transaction();
    await saveTransaction(db, expense);
    const refund = transaction({
      type: "refund",
      originalExpenseId: expense.id,
    });
    await saveTransaction(db, refund);
    await deleteTransaction(db, expense.id);
    expect(
      (await db.get("transactions", refund.id))?.originalExpenseId,
    ).toBeUndefined();
    expect((await db.get("transactions", refund.id))?.amount).toBe(8500);
  });
  it("persists theme, currency, and per-type last category", async () => {
    const db = await fresh();
    await saveAppearance(db, "dark");
    await saveTransaction(db, transaction({ categoryId: "expense-2" }));
    await saveTransaction(
      db,
      transaction({ type: "refund", categoryId: "expense-1" }),
    );
    expect((await snapshot(db)).preferences).toMatchObject({
      appearance: "dark",
      currency: "MXN",
      lastCategory: { expense: "expense-2", refund: "expense-1" },
    });
  });
  it("refuses a newer database rather than silently downgrading or wiping", async () => {
    const name = "future-" + crypto.randomUUID();
    const newer = await openDB(name, DATABASE_VERSION + 1);
    newer.close();
    await expect(openLedger(name)).rejects.toMatchObject({
      name: "VersionError",
    });
    await deleteDB(name);
  });
  it("installs sparse unique occurrence index for future recurrence without rejecting manual entries", async () => {
    const db = await fresh();
    await saveTransaction(db, transaction());
    await saveTransaction(db, transaction());
    const t = transaction({ occurrenceKey: "future:2026-10-01" });
    await saveTransaction(db, t);
    await expect(
      saveTransaction(db, { ...t, id: crypto.randomUUID() }),
    ).rejects.toThrow();
    expect((await snapshot(db)).transactions).toHaveLength(3);
  });
});

it("clears refund links if an original expense changes type and rejects self-links", async () => {
  const db = await fresh();
  const expense = transaction();
  await saveTransaction(db, expense);
  const refund = transaction({ type: "refund", originalExpenseId: expense.id });
  await saveTransaction(db, refund);
  await saveTransaction(
    db,
    { ...expense, type: "income", categoryId: "income-0" },
    true,
  );
  expect(
    (await db.get("transactions", refund.id))?.originalExpenseId,
  ).toBeUndefined();
  const other = transaction();
  await saveTransaction(db, other);
  await expect(
    saveTransaction(
      db,
      { ...other, type: "refund", originalExpenseId: other.id },
      true,
    ),
  ).rejects.toThrow("linked expense");
  expect((await db.get("transactions", other.id))?.type).toBe("expense");
});
