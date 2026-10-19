import { afterEach, describe, it, expect } from "vitest";
import { deleteDB } from "idb";
import {
  openLedger,
  deleteTransaction,
  saveTransaction,
  snapshot,
  saveCategory,
  saveMerchant,
  type LedgerDB,
} from "./db";
import { saveSchedule, reconcile, deleteSchedule } from "./recurrence";
import type { RecurringSchedule } from "./model";
const databases: LedgerDB[] = [];
async function fresh() {
  const db = await openLedger("recurrence-" + crypto.randomUUID());
  databases.push(db);
  return db;
}
function schedule(
  overrides: Partial<RecurringSchedule> = {},
): RecurringSchedule {
  return {
    id: crypto.randomUUID(),
    name: "Phone",
    type: "expense",
    amount: 25000,
    categoryId: "expense-4",
    description: "Plan",
    paymentMethod: "Debit card",
    frequency: "monthly",
    startDate: "2026-01-31",
    paused: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
afterEach(async () => {
  const names = new Set(databases.map((d) => d.name));
  for (const db of databases.splice(0)) db.close();
  for (const name of names) await deleteDB(name);
});
describe("exactly-once automatic recurrence", () => {
  it("backfills monthly dues, clamps without drift, and remains idempotent across reopen", async () => {
    const db = await fresh();
    const s = schedule();
    const added = await saveSchedule(db, s, false, "2026-04-30");
    expect(added.map((t) => t.localDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(
      added.every(
        (t) =>
          t.automatic && t.recurringScheduleId === s.id && t.amount === 25000,
      ),
    ).toBe(true);
    expect(await reconcile(db, "2026-04-30")).toHaveLength(0);
    db.close();
    const d = await openLedger(db.name);
    databases.push(d);
    expect(await reconcile(d, "2026-04-30")).toHaveLength(0);
    expect((await snapshot(d)).transactions).toHaveLength(4);
  });
  it("serializes simultaneous reconciliation across independent connections", async () => {
    const a = await fresh();
    await saveSchedule(a, schedule(), false, "2026-01-30");
    const b = await openLedger(a.name);
    databases.push(b);
    const [first, second] = await Promise.all([
      reconcile(a, "2026-04-30"),
      reconcile(b, "2026-04-30"),
    ]);
    expect(first.length + second.length).toBe(4);
    expect(await a.count("occurrences")).toBe(4);
    expect(await a.count("transactions")).toBe(4);
  });
  it("keeps a durable deletion tombstone, even if the cursor is replayed", async () => {
    const db = await fresh();
    const s = schedule();
    const [t] = await saveSchedule(db, s, false, "2026-01-31");
    await deleteTransaction(db, t.id);
    expect(await db.get("occurrences", t.occurrenceKey!)).toMatchObject({
      state: "deleted",
      date: "2026-01-31",
    });
    await db.put("schedules", {
      ...(await db.get("schedules", s.id))!,
      processedThrough: undefined,
    });
    expect(await reconcile(db, "2026-03-31")).toHaveLength(2);
    expect(
      (await snapshot(db)).transactions.map((t) => t.localDate).sort(),
    ).toEqual(["2026-02-28", "2026-03-31"]);
    expect(await db.get("schedules", s.id)).toBeDefined();
  });
  it("edits an individual occurrence without detaching its identity or changing schedule", async () => {
    const db = await fresh();
    const s = schedule();
    const [t] = await saveSchedule(db, s, false, "2026-01-31");
    await saveTransaction(
      db,
      {
        ...t,
        amount: 1200,
        localDate: "2026-02-01",
        localTime: "10:00",
        automatic: false,
        occurrenceKey: undefined,
        recurringScheduleId: undefined,
      },
      true,
    );
    const edited = await db.get("transactions", t.id);
    expect(edited).toMatchObject({
      amount: 1200,
      localDate: "2026-02-01",
      automatic: true,
      occurrenceKey: t.occurrenceKey,
      recurringScheduleId: s.id,
    });
    await deleteTransaction(db, t.id);
    expect((await db.get("occurrences", t.occurrenceKey!))?.date).toBe(
      "2026-01-31",
    );
    expect(await reconcile(db, "2026-02-28")).toHaveLength(1);
    expect((await db.get("schedules", s.id))?.amount).toBe(25000);
  });
  it("pause/resume skips paused dues including resume day and resumes the original anchor", async () => {
    const db = await fresh();
    const s = schedule();
    await saveSchedule(db, s, false, "2026-01-31");
    await saveSchedule(db, { ...s, paused: true }, true, "2026-02-01");
    expect(await reconcile(db, "2026-03-31")).toHaveLength(0);
    expect((await db.get("occurrences", s.id + ":2026-02-28"))?.state).toBe(
      "skipped",
    );
    await saveSchedule(db, { ...s, paused: false }, true, "2026-04-30");
    expect(await db.count("transactions")).toBe(1);
    const added = await reconcile(db, "2026-05-31");
    expect(added.map((t) => t.localDate)).toEqual(["2026-05-31"]);
  });
  it("initially paused backfills skips, never expenses", async () => {
    const db = await fresh();
    const s = schedule({ paused: true });
    expect(await saveSchedule(db, s, false, "2026-03-31")).toHaveLength(0);
    expect(await db.count("occurrences")).toBe(3);
    expect(await db.count("transactions")).toBe(0);
  });
  it("settles old terms before edit, applies new amounts prospectively and preserves generated entries", async () => {
    const db = await fresh();
    const s = schedule();
    await saveSchedule(db, s, false, "2026-01-30");
    const oldTerms = await saveSchedule(
      db,
      { ...s, amount: 10000 },
      true,
      "2026-02-28",
    );
    expect(oldTerms.map((t) => t.amount)).toEqual([25000, 25000]);
    const [future] = await reconcile(db, "2026-03-31");
    expect(future.amount).toBe(10000);
  });
  it("cadence/start changes never create newly introduced past occurrences", async () => {
    const db = await fresh();
    const s = schedule();
    await saveSchedule(db, s, false, "2026-03-31");
    expect(
      await saveSchedule(
        db,
        { ...s, frequency: "daily", startDate: "2026-01-01" },
        true,
        "2026-03-31",
      ),
    ).toHaveLength(0);
    expect((await reconcile(db, "2026-04-02")).map((t) => t.localDate)).toEqual(
      ["2026-04-01", "2026-04-02"],
    );
  });
  it("respects inclusive end dates and future starts; deletion preserves generated entries and receipts", async () => {
    const db = await fresh();
    const s = schedule({
      frequency: "daily",
      startDate: "2026-12-30",
      endDate: "2027-01-01",
    });
    expect(await saveSchedule(db, s, false, "2026-12-29")).toHaveLength(0);
    expect(await reconcile(db, "2027-02-01")).toHaveLength(3);
    await deleteSchedule(db, s.id);
    expect(await reconcile(db, "2028-01-01")).toHaveLength(0);
    expect(await db.count("transactions")).toBe(3);
    expect(await db.count("occurrences")).toBe(3);
  });
  it.each(["income", "refund"] as const)(
    "supports automatic %s without mixing categories",
    async (type) => {
      const db = await fresh();
      const added = await saveSchedule(
        db,
        schedule({
          type,
          categoryId: type === "income" ? "income-0" : "expense-0",
        }),
        false,
        "2026-01-31",
      );
      expect(added[0].type).toBe(type);
      expect(added[0].categoryId).toBe(
        type === "income" ? "income-0" : "expense-0",
      );
    },
  );
  it("continues existing schedules with archived entities, but disallows them for new schedules", async () => {
    const db = await fresh();
    await saveMerchant(db, {
      id: "phone",
      name: "Provider",
      normalizedName: "",
      archived: false,
    });
    const s = schedule({ merchantId: "phone" });
    await saveSchedule(db, s, false, "2026-01-31");
    await saveCategory(db, {
      ...(await db.get("categories", "expense-4"))!,
      archived: true,
    });
    await saveMerchant(db, {
      id: "phone",
      name: "Provider",
      normalizedName: "",
      archived: true,
    });
    expect(await reconcile(db, "2026-02-28")).toHaveLength(1);
    await expect(
      saveSchedule(db, schedule({ merchantId: "phone" }), false, "2026-02-28"),
    ).rejects.toThrow("active category");
  });
  it("rolls back the entire reconciliation on a relationship failure and can retry once repaired", async () => {
    const db = await fresh();
    const valid = schedule({ id: "a" }),
      broken = schedule({ id: "z" });
    await saveSchedule(db, valid, false, "2026-01-30");
    await db.put("schedules", { ...broken, categoryId: "missing" });
    await expect(reconcile(db, "2026-01-31")).rejects.toThrow("valid category");
    expect(await db.count("transactions")).toBe(0);
    expect(await db.count("occurrences")).toBe(0);
    expect((await db.get("schedules", "a"))?.processedThrough).toBe(
      "2026-01-30",
    );
    await db.put("schedules", broken);
    expect(await reconcile(db, "2026-01-31")).toHaveLength(2);
  });
  it("rejects invalid values without changing schedules or entries", async () => {
    const db = await fresh();
    for (const patch of [
      { amount: 0 },
      { amount: 1.5 },
      { endDate: "2025-01-01" },
      { startDate: "2026-02-30" },
      { categoryId: "income-0" },
    ])
      await expect(
        saveSchedule(db, schedule(patch), false, "2026-03-31"),
      ).rejects.toThrow();
    expect(await db.count("schedules")).toBe(0);
    expect(await db.count("transactions")).toBe(0);
  });
  it("does not roll back the cursor or duplicate entries when the device date moves backwards", async () => {
    const db = await fresh();
    await saveSchedule(db, schedule(), false, "2026-03-31");
    expect(await reconcile(db, "2026-01-31")).toHaveLength(0);
    expect(await reconcile(db, "2026-04-30")).toHaveLength(1);
    expect(await db.count("transactions")).toBe(4);
  });
  it("recovers a transaction receipt if a generated transaction already exists under the occurrence index", async () => {
    const db = await fresh();
    const s = schedule();
    const [t] = await saveSchedule(db, s, false, "2026-01-31");
    await db.delete("occurrences", t.occurrenceKey!);
    await db.put("schedules", {
      ...(await db.get("schedules", s.id))!,
      processedThrough: undefined,
    });
    expect(await reconcile(db, "2026-01-31")).toHaveLength(0);
    expect(await db.get("occurrences", t.occurrenceKey!)).toMatchObject({
      state: "generated",
      transactionId: t.id,
    });
    expect(await db.count("transactions")).toBe(1);
  });
});

it("generates leap-year yearly dates and weekly dues through year boundaries", async () => {
  const db = await fresh();
  expect(
    (
      await saveSchedule(
        db,
        schedule({ frequency: "yearly", startDate: "2024-02-29" }),
        false,
        "2028-02-29",
      )
    ).map((t) => t.localDate),
  ).toEqual([
    "2024-02-29",
    "2025-02-28",
    "2026-02-28",
    "2027-02-28",
    "2028-02-29",
  ]);
  expect(
    (
      await saveSchedule(
        db,
        schedule({
          frequency: "weekly",
          startDate: "2026-12-28",
          endDate: "2027-01-11",
        }),
        false,
        "2027-01-12",
      )
    ).map((t) => t.localDate),
  ).toEqual(["2026-12-28", "2027-01-04", "2027-01-11"]);
});
it("keeps daily civil dates stable through spring and autumn DST changes", async () => {
  const db = await fresh();
  const spring = await saveSchedule(
    db,
    schedule({
      frequency: "daily",
      startDate: "2026-03-07",
      endDate: "2026-03-09",
    }),
    false,
    "2026-03-09",
  );
  expect(spring.map((t) => [t.localDate, t.localTime])).toEqual([
    ["2026-03-07", "00:00"],
    ["2026-03-08", "00:00"],
    ["2026-03-09", "00:00"],
  ]);
  const fall = await saveSchedule(
    db,
    schedule({
      frequency: "daily",
      startDate: "2026-10-31",
      endDate: "2026-11-02",
    }),
    false,
    "2026-11-02",
  );
  expect(fall.map((t) => t.localDate)).toEqual([
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
  ]);
  if (process.env.TZ === "America/New_York") {
    expect(spring[2].occurredAt - spring[1].occurredAt).toBe(23 * 3600000);
    expect(fall[2].occurredAt - fall[1].occurredAt).toBe(25 * 3600000);
  }
});
