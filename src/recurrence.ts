import type { IDBPTransaction } from "idb";
import { addDays, dateNumber, dueDates } from "./calendar";
import {
  requirePaymentMethod,
  categoryKind,
  localParts,
  type RecurringSchedule,
  type Transaction,
} from "./model";
import type { LedgerDB, LedgerSchema } from "./db";
type Stores =
  | "schedules"
  | "occurrences"
  | "transactions"
  | "categories"
  | "merchants"
  | "metadata";
const stores: Stores[] = [
  "schedules",
  "occurrences",
  "transactions",
  "categories",
  "merchants",
  "metadata",
];
type Tx = IDBPTransaction<LedgerSchema, Stores[], "readwrite">;
async function processSchedule(tx: Tx, s: RecurringSchedule, today: string) {
  const added: Transaction[] = [];
  // Legacy methodless schedules hold their cursor and receipts until explicitly corrected.
  if (!s.paymentMethod.trim()) return { added, schedule: s };
  const from = s.processedThrough
    ? addDays(s.processedThrough, 1)
    : s.startDate;
  const to = s.endDate && s.endDate < today ? s.endDate : today;
  for (const date of dueDates(s.startDate, s.frequency, from, to)) {
    const key = `${s.id}:${date}`;
    if (await tx.objectStore("occurrences").get(key)) continue;
    const existing = await tx
      .objectStore("transactions")
      .index("by-occurrence")
      .get(key);
    if (existing) {
      await tx.objectStore("occurrences").add({
        id: key,
        scheduleId: s.id,
        date,
        state: "generated",
        transactionId: existing.id,
      });
      continue;
    }
    if (s.paused) {
      await tx
        .objectStore("occurrences")
        .add({ id: key, scheduleId: s.id, date, state: "skipped" });
      continue;
    }
    const c = await tx.objectStore("categories").get(s.categoryId);
    if (!c || c.kind !== categoryKind(s.type))
      throw new Error(`Recurring schedule “${s.name}” needs a valid category.`);
    if (s.merchantId && !(await tx.objectStore("merchants").get(s.merchantId)))
      throw new Error(`Recurring schedule “${s.name}” needs a valid merchant.`);
    const instant = new Date(date + "T00:00:00");
    const local = localParts(instant);
    // Some historical zones skipped an entire civil day. Keep a skipped receipt instead of inventing a date.
    if (local.localDate !== date) {
      await tx
        .objectStore("occurrences")
        .add({ id: key, scheduleId: s.id, date, state: "skipped" });
      continue;
    }
    const now = Date.now();
    const t: Transaction = {
      id: crypto.randomUUID(),
      type: s.type,
      amount: s.amount,
      categoryId: s.categoryId,
      merchantId: s.merchantId,
      description: s.description,
      paymentMethod: s.paymentMethod,
      occurredAt: instant.getTime(),
      localDate: date,
      localTime: local.localTime,
      createdAt: now,
      updatedAt: now,
      automatic: true,
      recurringScheduleId: s.id,
      occurrenceKey: key,
    };
    await tx.objectStore("transactions").add(t);
    await tx.objectStore("occurrences").add({
      id: key,
      scheduleId: s.id,
      date,
      state: "generated",
      transactionId: t.id,
    });
    added.push(t);
  }
  if (!s.processedThrough || s.processedThrough < today) {
    s = { ...s, processedThrough: today };
    await tx.objectStore("schedules").put(s);
  }
  return { added, schedule: s };
}
async function atomic<T>(db: LedgerDB, work: (tx: Tx) => Promise<T>) {
  const tx = db.transaction(stores, "readwrite");
  void tx.done.catch(() => {});
  try {
    const result = await work(tx);
    await tx.done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* May have auto-aborted. */
    }
    await tx.done.catch(() => {});
    throw e;
  }
}
/** All reads, receipts, transactions and cursor writes share the same IndexedDB lock and commit. */
export async function reconcile(db: LedgerDB, today = localParts().localDate) {
  dateNumber(today);
  return atomic(db, async (tx) => {
    const added: Transaction[] = [];
    for (const s of await tx.objectStore("schedules").getAll())
      added.push(...(await processSchedule(tx, s, today)).added);
    await tx
      .objectStore("metadata")
      .put({ id: "lastReconciliation", value: today });
    return added;
  });
}
export async function saveSchedule(
  db: LedgerDB,
  input: RecurringSchedule,
  editing = false,
  today = localParts().localDate,
) {
  dateNumber(today);
  dateNumber(input.startDate);
  requirePaymentMethod(input.paymentMethod);
  if (input.endDate) {
    dateNumber(input.endDate);
    if (input.endDate < input.startDate)
      throw new Error("End date must not precede start date.");
  }
  if (!input.name.trim() || input.name.trim().length > 80)
    throw new Error("Use a schedule name of 1–80 characters.");
  if (
    !["daily", "weekly", "monthly", "yearly"].includes(input.frequency) ||
    !["expense", "income", "refund"].includes(input.type)
  )
    throw new Error("Invalid recurrence settings.");
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > 99999999999
  )
    throw new Error("Invalid recurring amount.");
  if (input.description.length > 500 || input.paymentMethod.length > 80)
    throw new Error("Description or payment method is too long.");
  return atomic(db, async (tx) => {
    let old = await tx.objectStore("schedules").get(input.id);
    if (editing && !old)
      throw new Error("This schedule was removed in another window.");
    if (!editing && old) throw new Error("This schedule already exists.");
    const c = await tx.objectStore("categories").get(input.categoryId);
    if (
      !c ||
      c.kind !== categoryKind(input.type) ||
      (c.archived && old?.categoryId !== c.id)
    )
      throw new Error("Choose an active category.");
    if (input.merchantId) {
      const m = await tx.objectStore("merchants").get(input.merchantId);
      if (!m || (m.archived && old?.merchantId !== m.id))
        throw new Error("Choose an active merchant.");
    }
    const added: Transaction[] = [];
    // First settle using the old terms. Edits cannot rewrite existing occurrences or charge new past dates.
    if (old) {
      const result = await processSchedule(
        tx,
        old.paymentMethod.trim()
          ? old
          : { ...old, paymentMethod: input.paymentMethod.trim() },
        today,
      );
      old = result.schedule;
      added.push(...result.added);
    }
    const now = Date.now();
    const next: RecurringSchedule = {
      ...input,
      name: input.name.trim(),
      description: input.description.trim(),
      paymentMethod: input.paymentMethod.trim(),
      processedThrough: old?.processedThrough,
      createdAt: old?.createdAt || now,
      updatedAt: now,
    };
    await tx.objectStore("schedules").put(next);
    added.push(...(await processSchedule(tx, next, today)).added);
    return added;
  });
}
export async function deleteSchedule(db: LedgerDB, id: string) {
  await db.delete(
    "schedules",
    id,
  ); /* Receipts and generated entries survive. */
}
