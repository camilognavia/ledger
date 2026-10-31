import { unwrap, openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  requirePaymentMethod,
  initialPaymentMethods,
  type PaymentMethod,
  categoryKind,
  defaultPreferences,
  initialCategories,
  normalizeName,
  parseLocal,
  type ImportReceipt,
  type Budget,
  type RecurringSchedule,
  type Occurrence,
  type Category,
  type Merchant,
  type Preferences,
  type Snapshot,
  type Transaction,
} from "./model";
export const DATABASE_VERSION = 5;
export const DATABASE_NAME = "ledger";
export interface LedgerSchema extends DBSchema {
  paymentMethods: {
    key: string;
    value: PaymentMethod;
    indexes: { "by-name": string };
  };
  imports: {
    key: string;
    value: ImportReceipt;
    indexes: { "by-fingerprint": string; "by-source": string };
  };
  schedules: { key: string; value: RecurringSchedule };
  occurrences: {
    key: string;
    value: Occurrence;
    indexes: { "by-schedule": string };
  };
  budgets: { key: string; value: Budget };
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      "by-date": string;
      "by-category": string;
      "by-merchant": string;
      "by-occurrence": string;
    };
  };
  categories: { key: string; value: Category };
  merchants: { key: string; value: Merchant; indexes: { "by-name": string } };
  preferences: { key: string; value: Preferences };
  metadata: { key: string; value: { id: string; value: string | number } };
}
export type LedgerDB = IDBPDatabase<LedgerSchema>;
export async function openLedger(name = DATABASE_NAME) {
  const db = await openDB<LedgerSchema>(name, DATABASE_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      void tx.done.catch(() => {});
      // Increment DATABASE_VERSION and add successive oldVersion checks for future migrations.
      if (oldVersion < 1) {
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
      }
      if (oldVersion < 2) {
        db.createObjectStore("schedules", { keyPath: "id" });
        const o = db.createObjectStore("occurrences", { keyPath: "id" });
        o.createIndex("by-schedule", "scheduleId");
        db.createObjectStore("budgets", { keyPath: "id" });
        // Native upgrade requests keep this migration inside the versionchange transaction.
        const native = unwrap(tx);
        const request = native.objectStore("preferences").get("user");
        request.onsuccess = () => {
          const p = request.result as Preferences | undefined;
          if (p)
            native
              .objectStore("preferences")
              .put({ ...p, summaryMode: p.summaryMode ?? "basic" });
        };
        native.objectStore("metadata").put({ id: "schema", value: 2 });
      }
      if (oldVersion < 3) {
        const store = db.createObjectStore("imports", { keyPath: "id" });
        store.createIndex("by-fingerprint", "fingerprint");
        store.createIndex("by-source", "sourceId");
        unwrap(tx).objectStore("metadata").put({ id: "schema", value: 3 });
      }
      if (oldVersion < 4) {
        const store = db.createObjectStore("paymentMethods", { keyPath: "id" });
        store.createIndex("by-name", "normalizedName", { unique: true });
        for (const method of initialPaymentMethods) store.put(method);
        // Populate choices from old text without rewriting a single financial row.
        const known = new Set(
          initialPaymentMethods.map((m) => m.normalizedName),
        );
        const native = unwrap(tx);
        for (const table of ["transactions", "schedules"] as const) {
          const request = native.objectStore(table).getAll();
          request.onsuccess = () => {
            for (const row of request.result as { paymentMethod: string }[]) {
              const name = row.paymentMethod.trim().replace(/\s+/g, " ");
              const normalizedName = normalizeName(name);
              if (normalizedName && !known.has(normalizedName)) {
                known.add(normalizedName);
                native.objectStore("paymentMethods").put({
                  id: `legacy:${name}`,
                  name,
                  normalizedName,
                  archived: false,
                });
              }
            }
          };
        }
      }
      // Schema 5 adds optional transaction merchantName; no existing row/store is rewritten.
      if (oldVersion < 5)
        unwrap(tx)
          .objectStore("metadata")
          .put({ id: "schema", value: DATABASE_VERSION });
    },
    blocking() {
      db.close();
      window.dispatchEvent(new Event("ledger-versionchange"));
    },
    blocked() {
      window.dispatchEvent(new Event("ledger-blocked"));
    },
  });
  const tx = db.transaction(
    ["categories", "preferences", "metadata"],
    "readwrite",
  );
  void tx.done.catch(() => {});
  if (!(await tx.objectStore("metadata").get("initialized"))) {
    for (const c of initialCategories)
      await tx.objectStore("categories").add(c);
    await tx
      .objectStore("preferences")
      .put(structuredClone(defaultPreferences));
    await tx
      .objectStore("metadata")
      .put({ id: "initialized", value: Date.now() });
    await tx
      .objectStore("metadata")
      .put({ id: "schema", value: DATABASE_VERSION });
  }
  await tx.done;
  return db;
}
export async function snapshot(db: LedgerDB): Promise<Snapshot> {
  const tx = db.transaction([
    "transactions",
    "categories",
    "merchants",
    "preferences",
    "schedules",
    "budgets",
    "paymentMethods",
  ]);
  void tx.done.catch(() => {});
  const [
    transactions,
    categories,
    merchants,
    preferences,
    schedules,
    budgets,
    paymentMethods,
  ] = await Promise.all([
    tx.objectStore("transactions").getAll(),
    tx.objectStore("categories").getAll(),
    tx.objectStore("merchants").getAll(),
    tx.objectStore("preferences").get("user"),
    tx.objectStore("schedules").getAll(),
    tx.objectStore("budgets").getAll(),
    tx.objectStore("paymentMethods").getAll(),
  ]);
  await tx.done;
  if (!preferences)
    throw new Error("Preferences are missing. Please reopen Ledger.");
  return {
    paymentMethods,
    transactions,
    categories,
    merchants,
    preferences,
    schedules,
    budgets,
  };
}
export async function saveTransaction(
  db: LedgerDB,
  t: Transaction,
  editing = false,
) {
  if (
    !Number.isSafeInteger(t.amount) ||
    t.amount <= 0 ||
    t.amount > 99999999999
  )
    throw new Error("Invalid amount.");
  if (!["expense", "income", "refund"].includes(t.type))
    throw new Error("Invalid transaction type.");
  parseLocal(t.localDate, t.localTime);
  requirePaymentMethod(t.paymentMethod);
  if (
    t.merchantName !== undefined &&
    (t.merchantId ||
      !t.merchantName.trim() ||
      t.merchantName.length > 80 ||
      t.merchantName.includes("\0"))
  )
    throw new Error(
      "Use a one-time merchant name of 1–80 characters without a recurring merchant selection.",
    );
  const tx = db.transaction(
    ["transactions", "categories", "merchants", "preferences"],
    "readwrite",
  );
  void tx.done.catch(() => {});
  try {
    const existing = await tx.objectStore("transactions").get(t.id);
    if (editing && !existing)
      throw new Error("This transaction was removed in another window.");
    const c = await tx.objectStore("categories").get(t.categoryId);
    if (
      !c ||
      c.kind !== categoryKind(t.type) ||
      (c.archived && existing?.categoryId !== c.id)
    )
      throw new Error("Choose an active category.");
    if (t.merchantId) {
      const m = await tx.objectStore("merchants").get(t.merchantId);
      if (!m || (m.archived && existing?.merchantId !== m.id))
        throw new Error("Choose an active merchant.");
    }
    if (t.originalExpenseId) {
      const original = await tx
        .objectStore("transactions")
        .get(t.originalExpenseId);
      if (
        t.originalExpenseId === t.id ||
        t.type !== "refund" ||
        original?.type !== "expense"
      )
        throw new Error("The linked expense no longer exists.");
    }
    if (t.description.length > 500 || t.paymentMethod.length > 80)
      throw new Error("Description or payment method is too long.");
    if (editing)
      await tx.objectStore("transactions").put({
        ...t,
        createdAt: existing!.createdAt,
        automatic: existing!.automatic,
        occurrenceKey: existing!.occurrenceKey,
        recurringScheduleId: existing!.recurringScheduleId,
      });
    else await tx.objectStore("transactions").add(t);
    if (existing?.type === "expense" && t.type !== "expense") {
      for await (const cursor of tx.objectStore("transactions")) {
        if (cursor.value.originalExpenseId === t.id)
          await cursor.update({
            ...cursor.value,
            originalExpenseId: undefined,
          });
      }
    }

    const prefs = await tx.objectStore("preferences").get("user");
    if (prefs) {
      prefs.lastCategory[t.type] = t.categoryId;
      await tx.objectStore("preferences").put(prefs);
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Request failures may already have aborted the transaction. */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function deleteTransaction(db: LedgerDB, id: string) {
  const tx = db.transaction(["transactions", "occurrences"], "readwrite");
  void tx.done.catch(() => {});
  const t = await tx.objectStore("transactions").get(id);
  if (t?.occurrenceKey) {
    const old = await tx.objectStore("occurrences").get(t.occurrenceKey);
    await tx.objectStore("occurrences").put({
      id: t.occurrenceKey,
      scheduleId: t.recurringScheduleId || old?.scheduleId || "",
      date: old?.date || t.localDate,
      state: "deleted",
      transactionId: id,
    });
  }
  await tx.objectStore("transactions").delete(id);
  for await (const cursor of tx.objectStore("transactions")) {
    if (cursor.value.originalExpenseId === id)
      await cursor.update({ ...cursor.value, originalExpenseId: undefined });
  }
  await tx.done;
}
export async function saveCategory(db: LedgerDB, c: Category) {
  if (!c.name.trim() || c.name.trim().length > 50)
    throw new Error("Use a category name of 1–50 characters.");
  const tx = db.transaction("categories", "readwrite");
  void tx.done.catch(() => {});
  const old = await tx.store.get(c.id);
  const categories = await tx.store.getAll();
  if (old && old.kind !== c.kind)
    throw new Error("Category type cannot change.");
  if (
    categories.some(
      (x) =>
        x.id !== c.id &&
        x.kind === c.kind &&
        normalizeName(x.name) === normalizeName(c.name),
    )
  )
    throw new Error("A category with this name already exists.");
  if (old?.isFallback && (c.archived || c.name !== old.name))
    throw new Error("The Other category must remain available.");
  await tx.store.put({
    ...c,
    name: c.name.trim(),
    isFallback: old?.isFallback ?? false,
  });
  await tx.done;
}
export async function saveMerchant(db: LedgerDB, m: Merchant) {
  const name = m.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80)
    throw new Error("Use a merchant name of 1–80 characters.");
  if (m.defaultCategoryId && !(await db.get("categories", m.defaultCategoryId)))
    throw new Error("Category no longer exists.");
  try {
    await db.put("merchants", {
      ...m,
      name,
      normalizedName: normalizeName(name),
    });
  } catch (error) {
    if ((error as DOMException).name === "ConstraintError")
      throw new Error(
        "This merchant already exists, including archived merchants.",
      );
    throw error;
  }
}
export async function saveAppearance(
  db: LedgerDB,
  appearance: Preferences["appearance"],
) {
  const tx = db.transaction("preferences", "readwrite");
  void tx.done.catch(() => {});
  const p = await tx.store.get("user");
  if (!p) throw new Error("Preferences are missing.");
  await tx.store.put({ ...p, appearance });
  await tx.done;
}

export async function saveLastCategory(
  db: LedgerDB,
  type: Transaction["type"],
  id: string,
) {
  const tx = db.transaction(["categories", "preferences"], "readwrite");
  void tx.done.catch(() => {});
  const c = await tx.objectStore("categories").get(id);
  const p = await tx.objectStore("preferences").get("user");
  if (c && !c.archived && c.kind === categoryKind(type) && p) {
    p.lastCategory[type] = id;
    await tx.objectStore("preferences").put(p);
  }
  await tx.done;
}

export async function saveSummaryMode(
  db: LedgerDB,
  summaryMode: "basic" | "analytical",
) {
  const tx = db.transaction("preferences", "readwrite");
  void tx.done.catch(() => {});
  const p = await tx.store.get("user");
  if (!p) throw new Error("Preferences are missing.");
  await tx.store.put({ ...p, summaryMode });
  await tx.done;
}
export async function saveBudget(db: LedgerDB, budget: Budget) {
  if (
    !Number.isSafeInteger(budget.limit) ||
    budget.limit <= 0 ||
    budget.limit > 99999999999
  )
    throw new Error("Enter a positive budget limit.");
  const tx = db.transaction(["budgets", "categories"], "readwrite");
  void tx.done.catch(() => {});
  if (budget.categoryId) {
    const c = await tx.objectStore("categories").get(budget.categoryId);
    if (!c || c.kind !== "expense")
      throw new Error("Budgets require an expense category.");
  }
  if (budget.id !== (budget.categoryId || "overall"))
    throw new Error("Invalid budget identifier.");
  await tx.objectStore("budgets").put(budget);
  await tx.done;
}
export async function deleteBudget(db: LedgerDB, id: string) {
  await db.delete("budgets", id);
}

export async function saveBackupPreference(
  db: LedgerDB,
  patch: Pick<
    Preferences,
    "backupReminder" | "lastBackupAt" | "backupReminderDismissedMonth"
  >,
) {
  const tx = db.transaction("preferences", "readwrite");
  void tx.done.catch(() => {});
  const p = await tx.store.get("user");
  if (!p) throw new Error("Preferences are missing.");
  await tx.store.put({ ...p, ...patch });
  await tx.done;
}

export async function savePaymentMethod(db: LedgerDB, method: PaymentMethod) {
  const name = method.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80 || name.includes("\0"))
    throw new Error("Use a payment method name of 1–80 characters.");
  try {
    await db.put("paymentMethods", {
      ...method,
      name,
      normalizedName: normalizeName(name),
    });
  } catch (error) {
    if ((error as DOMException).name === "ConstraintError")
      throw new Error(
        "This payment method already exists, including archived methods.",
      );
    throw error;
  }
}
