import type { IDBPTransaction } from "idb";
import { DATABASE_VERSION, type LedgerDB, type LedgerSchema } from "./db";
import {
  categoryKind,
  normalizeName,
  type Category,
  type Merchant,
  type Transaction,
  type Preferences,
  type RecurringSchedule,
  type Occurrence,
  type Budget,
  type ImportReceipt,
} from "./model";
import { dateNumber } from "./calendar";
export const ALL_STORES = [
  "transactions",
  "categories",
  "merchants",
  "preferences",
  "metadata",
  "schedules",
  "occurrences",
  "budgets",
  "imports",
] as const;
export type Store = (typeof ALL_STORES)[number];
export interface BackupData {
  transactions: Transaction[];
  categories: Category[];
  merchants: Merchant[];
  preferences: Preferences[];
  metadata: { id: string; value: string | number }[];
  schedules: RecurringSchedule[];
  occurrences: Occurrence[];
  budgets: Budget[];
  imports: ImportReceipt[];
}
export interface Backup {
  format: "ledger-backup";
  formatVersion: 1;
  databaseVersion: number;
  exportedAt: string;
  data: BackupData;
}
function fail(message: string): never {
  throw new Error("Invalid backup: " + message);
}
function record(
  v: unknown,
  allowed: string[],
  required = allowed,
): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("expected an object.");
  const r = v as Record<string, unknown>;
  if (Object.keys(r).some((k) => !allowed.includes(k)))
    fail("unrecognized field.");
  if (required.some((k) => r[k] === undefined)) fail("missing required field.");
  return r;
}
function text(v: unknown, max = 1024, empty = false): asserts v is string {
  if (
    typeof v !== "string" ||
    (!empty && !v.trim()) ||
    v.length > max ||
    v.includes("\0")
  )
    fail("invalid text field.");
}
function bool(v: unknown) {
  if (typeof v !== "boolean") fail("invalid boolean.");
}
function one(v: unknown, options: readonly string[]) {
  if (typeof v !== "string" || !options.includes(v))
    fail("invalid enum value.");
}
function number(v: unknown, min = 0, max = 8640000000000000) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    fail("invalid number.");
}
function date(v: unknown) {
  text(v, 10);
  try {
    dateNumber(v);
  } catch {
    fail("invalid calendar date.");
  }
}
function optional(
  r: Record<string, unknown>,
  key: string,
  check: (v: unknown) => void,
) {
  if (r[key] !== undefined) check(r[key]);
}
const id = (v: unknown) => text(v, 1024);
const optionalId = (r: Record<string, unknown>, key: string) =>
  optional(r, key, id);
const cents = (v: unknown) => number(v, 1, 99999999999);
const types = ["expense", "income", "refund"];
function transactionFields(r: Record<string, unknown>) {
  id(r.id);
  one(r.type, types);
  cents(r.amount);
  id(r.categoryId);
  optionalId(r, "merchantId");
  text(r.description, 500, true);
  text(r.paymentMethod, 80, true);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
/** Full structural and referential validation. No database writes or timezone reinterpretation. */
export function validateBackup(input: unknown): Backup {
  const root = record(input, [
    "format",
    "formatVersion",
    "databaseVersion",
    "exportedAt",
    "data",
  ]);
  if (root.format !== "ledger-backup" || root.formatVersion !== 1)
    fail("unsupported format/version.");
  number(root.databaseVersion, 1, DATABASE_VERSION);
  text(root.exportedAt, 40);
  if (!Number.isFinite(Date.parse(root.exportedAt)))
    fail("invalid export timestamp.");
  const version = root.databaseVersion as number;
  const required = ALL_STORES.filter((s) =>
    version === 1
      ? !["schedules", "occurrences", "budgets", "imports"].includes(s)
      : version === 2
        ? s !== "imports"
        : true,
  );
  const raw = record(root.data, [...ALL_STORES], required);
  const data = clean({
    ...raw,
    ...Object.fromEntries(
      ALL_STORES.filter((k) => raw[k] === undefined).map((k) => [k, []]),
    ),
  }) as unknown as BackupData;
  let count = 0;
  for (const store of ALL_STORES) {
    const rows = data[store];
    if (!Array.isArray(rows)) fail("store must be an array.");
    count += rows.length;
    if (count > 1000000) fail("too many records.");
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        fail("invalid record.");
      id(row.id);
      if (ids.has(row.id)) fail(`duplicate identifier in ${store}.`);
      ids.add(row.id);
    }
  }
  for (const c of data.categories) {
    const r = record(
      c,
      ["id", "kind", "name", "icon", "color", "archived", "isFallback"],
      ["id", "kind", "name", "icon", "color", "archived"],
    );
    one(r.kind, ["expense", "income"]);
    text(r.name, 50);
    text(r.icon, 40);
    text(r.color, 20, true);
    if (r.color !== "" && !/^#[0-9a-f]{6}$/i.test(r.color as string))
      fail("invalid category color.");
    bool(r.archived);
    optional(r, "isFallback", bool);
  }
  for (const m of data.merchants) {
    const r = record(
      m,
      ["id", "name", "normalizedName", "defaultCategoryId", "archived"],
      ["id", "name", "normalizedName", "archived"],
    );
    text(r.name, 80);
    text(r.normalizedName, 2000);
    if (r.normalizedName !== normalizeName(m.name))
      fail("merchant normalization mismatch.");
    bool(r.archived);
    optionalId(r, "defaultCategoryId");
  }
  for (const t of data.transactions) {
    const r = record(
      t,
      [
        "id",
        "type",
        "amount",
        "categoryId",
        "merchantId",
        "description",
        "paymentMethod",
        "occurredAt",
        "localDate",
        "localTime",
        "createdAt",
        "updatedAt",
        "automatic",
        "originalExpenseId",
        "recurringScheduleId",
        "occurrenceKey",
      ],
      [
        "id",
        "type",
        "amount",
        "categoryId",
        "description",
        "paymentMethod",
        "occurredAt",
        "localDate",
        "localTime",
        "createdAt",
        "updatedAt",
        "automatic",
      ],
    );
    transactionFields(r);
    date(r.localDate);
    text(r.localTime, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.localTime))
      fail("invalid wall time.");
    number(r.occurredAt, -8640000000000000);
    number(r.createdAt);
    number(r.updatedAt);
    bool(r.automatic);
    for (const key of [
      "originalExpenseId",
      "recurringScheduleId",
      "occurrenceKey",
    ])
      optionalId(r, key);
  }
  for (const s of data.schedules) {
    const r = record(
      s,
      [
        "id",
        "name",
        "type",
        "amount",
        "categoryId",
        "merchantId",
        "description",
        "paymentMethod",
        "frequency",
        "startDate",
        "endDate",
        "paused",
        "processedThrough",
        "createdAt",
        "updatedAt",
      ],
      [
        "id",
        "name",
        "type",
        "amount",
        "categoryId",
        "description",
        "paymentMethod",
        "frequency",
        "startDate",
        "paused",
        "createdAt",
        "updatedAt",
      ],
    );
    transactionFields(r);
    text(r.name, 80);
    one(r.frequency, ["daily", "weekly", "monthly", "yearly"]);
    date(r.startDate);
    optional(r, "endDate", date);
    optional(r, "processedThrough", date);
    if (s.endDate && s.endDate < s.startDate)
      fail("schedule ends before start.");
    bool(r.paused);
    number(r.createdAt);
    number(r.updatedAt);
  }
  for (const o of data.occurrences) {
    const r = record(
      o,
      ["id", "scheduleId", "date", "transactionId", "state"],
      ["id", "scheduleId", "date", "state"],
    );
    id(r.scheduleId);
    date(r.date);
    one(r.state, ["generated", "deleted", "skipped"]);
    optionalId(r, "transactionId");
    if (o.id !== `${o.scheduleId}:${o.date}`) fail("occurrence key mismatch.");
    if (o.state === "generated" && !o.transactionId)
      fail("generated receipt needs a transaction.");
    if (o.state === "skipped" && o.transactionId)
      fail("skipped receipt cannot reference a transaction.");
  }
  for (const b of data.budgets) {
    const r = record(b, ["id", "categoryId", "limit"], ["id", "limit"]);
    optionalId(r, "categoryId");
    cents(r.limit);
    if (b.id !== (b.categoryId || "overall"))
      fail("budget identifier mismatch.");
  }
  for (const p of data.preferences) {
    const r = record(
      p,
      [
        "id",
        "appearance",
        "currency",
        "lastCategory",
        "summaryMode",
        "backupReminder",
        "lastBackupAt",
        "backupReminderDismissedMonth",
      ],
      ["id", "appearance", "currency", "lastCategory"],
    );
    if (r.id !== "user" || r.currency !== "MXN")
      fail("unsupported preferences.");
    one(r.appearance, ["light", "dark", "system"]);
    const last = record(r.lastCategory, types, []);
    Object.values(last).forEach(id);
    optional(r, "summaryMode", (v) => one(v, ["basic", "analytical"]));
    optional(r, "backupReminder", bool);
    optional(r, "lastBackupAt", (v) => number(v));
    optional(r, "backupReminderDismissedMonth", (v) => {
      text(v, 7);
      date(v + "-01");
    });
  }
  for (const m of data.metadata) {
    const r = record(m, ["id", "value"]);
    if (
      typeof r.value !== "string" &&
      (typeof r.value !== "number" || !Number.isFinite(r.value))
    )
      fail("invalid metadata value.");
  }
  for (const i of data.imports) {
    const r = record(
      i,
      ["id", "transactionId", "fingerprint", "sourceId", "importedAt"],
      ["id", "transactionId", "fingerprint", "importedAt"],
    );
    id(r.transactionId);
    text(r.fingerprint, 20000);
    optionalId(r, "sourceId");
    number(r.importedAt);
  }
  const cats = new Map(data.categories.map((c) => [c.id, c])),
    merchants = new Map(data.merchants.map((m) => [m.id, m])),
    transactions = new Map(data.transactions.map((t) => [t.id, t])),
    receipts = new Map(data.occurrences.map((o) => [o.id, o])),
    schedules = new Map(data.schedules.map((s) => [s.id, s]));
  const categoryNames = new Set<string>(),
    merchantNames = new Set<string>();
  for (const c of data.categories) {
    const name = c.kind + ":" + normalizeName(c.name);
    if (categoryNames.has(name)) fail("duplicate category name.");
    categoryNames.add(name);
  }
  for (const kind of ["expense", "income"])
    if (
      !data.categories.some(
        (c) => c.kind === kind && c.isFallback && !c.archived,
      )
    )
      fail("missing available fallback category.");
  for (const m of data.merchants) {
    if (merchantNames.has(m.normalizedName)) fail("duplicate merchant name.");
    merchantNames.add(m.normalizedName);
    if (m.defaultCategoryId && !cats.has(m.defaultCategoryId))
      fail("dangling merchant category.");
  }
  for (const row of [...data.transactions, ...data.schedules]) {
    if (cats.get(row.categoryId)?.kind !== categoryKind(row.type))
      fail("incompatible category relationship.");
    if (row.merchantId && !merchants.has(row.merchantId))
      fail("dangling merchant relationship.");
  }
  const occurrenceKeys = new Set<string>();
  for (const t of data.transactions) {
    if (
      t.originalExpenseId &&
      (t.type !== "refund" ||
        t.originalExpenseId === t.id ||
        transactions.get(t.originalExpenseId)?.type !== "expense")
    )
      fail("invalid original expense link.");
    if (t.automatic) {
      if (!t.occurrenceKey || !t.recurringScheduleId)
        fail("automatic entry needs its identity.");
      const receipt = receipts.get(t.occurrenceKey);
      if (
        receipt?.state !== "generated" ||
        receipt.transactionId !== t.id ||
        receipt.scheduleId !== t.recurringScheduleId
      )
        fail("automatic entry/receipt mismatch.");
    } else if (t.occurrenceKey || t.recurringScheduleId)
      fail("manual entry cannot own a recurring identity.");
    if (t.occurrenceKey) {
      if (occurrenceKeys.has(t.occurrenceKey))
        fail("duplicate recurring occurrence.");
      occurrenceKeys.add(t.occurrenceKey);
    }
  }
  for (const o of data.occurrences) {
    const t = o.transactionId ? transactions.get(o.transactionId) : undefined;
    if (
      o.state === "generated" &&
      (!t?.automatic ||
        t.occurrenceKey !== o.id ||
        t.recurringScheduleId !== o.scheduleId)
    )
      fail("generated receipt/entry mismatch.");
    if (o.state !== "generated" && (t || occurrenceKeys.has(o.id)))
      fail("deleted/skipped occurrence has a live entry.");
    const s = schedules.get(o.scheduleId);
    if (s && (!s.processedThrough || s.processedThrough < o.date))
      fail("schedule cursor precedes a receipt.");
  }
  for (const b of data.budgets)
    if (b.categoryId && cats.get(b.categoryId)?.kind !== "expense")
      fail("invalid budget category.");
  if (data.preferences.length !== 1)
    fail("exactly one preference record is required.");
  const prefs = data.preferences[0];
  for (const [type, category] of Object.entries(prefs.lastCategory))
    if (cats.get(category)?.kind !== categoryKind(type as Transaction["type"]))
      fail("invalid saved category preference.");
  const importSources = new Set<string>();
  for (const i of data.imports) {
    if (i.sourceId) {
      if (importSources.has(i.sourceId)) fail("duplicate import source ID.");
      importSources.add(i.sourceId);
    }
  }
  for (const i of data.imports)
    if (transactions.get(i.transactionId)?.automatic)
      fail("spreadsheet receipt references an automatic entry.");
  if (!data.metadata.some((m) => m.id === "initialized"))
    fail("missing initialization marker.");
  const schema = data.metadata.find((m) => m.id === "schema");
  if (!schema || schema.value !== version) fail("schema marker mismatch.");
  schema.value = DATABASE_VERSION;
  prefs.summaryMode ??= "basic";
  return {
    format: "ledger-backup",
    formatVersion: 1,
    databaseVersion: DATABASE_VERSION,
    exportedAt: root.exportedAt as string,
    data,
  };
}
export async function readData<M extends "readonly" | "readwrite">(
  tx: IDBPTransaction<LedgerSchema, Store[], M>,
): Promise<BackupData> {
  return Object.fromEntries(
    await Promise.all(
      ALL_STORES.map(async (name) => [
        name,
        await tx.objectStore(name).getAll(),
      ]),
    ),
  ) as unknown as BackupData;
}
export async function captureBackup(db: LedgerDB): Promise<Backup> {
  const tx = db.transaction([...ALL_STORES]);
  void tx.done.catch(() => {});
  const data = await readData(tx);
  await tx.done;
  return validateBackup({
    format: "ledger-backup",
    formatVersion: 1,
    databaseVersion: DATABASE_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  });
}
export interface RestorePlan {
  mode: "replace" | "merge";
  base: string;
  candidate: Backup;
}
export async function prepareRestore(
  db: LedgerDB,
  input: unknown,
  mode: RestorePlan["mode"],
): Promise<RestorePlan> {
  const incoming = validateBackup(input);
  if (mode !== "merge" && mode !== "replace")
    throw new Error("Choose replace or merge.");
  const current = await captureBackup(db);
  let candidate = incoming;
  if (mode === "merge") {
    const data = clean(current.data);
    for (const store of ALL_STORES) {
      if (store === "preferences" || store === "metadata") continue;
      const map = new Map<string, { id: string }>(
        data[store].map((row) => [row.id, row]),
      );
      for (const row of incoming.data[store]) {
        const old = map.get(row.id);
        if (old && canonical(old) !== canonical(row))
          throw new Error(
            `Merge conflict in ${store}: ${row.id}. No data changed. Use replacement only if you intend to return to that snapshot.`,
          );
        map.set(row.id, row);
      }
      Object.assign(data, {
        [store]: [...map.values()].sort((a, b) => a.id.localeCompare(b.id)),
      });
    }
    candidate = validateBackup({ ...incoming, data });
  }
  return { mode, base: canonical(current.data), candidate };
}
/** The stale-preview guard and all clears/puts are inside one all-store transaction. */
export async function restoreBackup(db: LedgerDB, plan: RestorePlan) {
  const candidate = validateBackup(plan.candidate);
  const tx = db.transaction([...ALL_STORES], "readwrite");
  void tx.done.catch(() => {});
  try {
    if (canonical(await readData(tx)) !== plan.base)
      throw new Error(
        "Ledger changed since preview. Review the backup again before restoring.",
      );
    for (const store of ALL_STORES) {
      await tx.objectStore(store).clear();
      for (const row of candidate.data[store])
        await tx.objectStore(store).put(row);
    }
    await tx.done;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      /* Already aborted. */
    }
    await tx.done.catch(() => {});
    throw e;
  }
}

export function serializeBackup(input: unknown) {
  const text = JSON.stringify(validateBackup(input), null, 2);
  if (new TextEncoder().encode(text).byteLength > 50 * 1024 * 1024)
    throw new Error(
      "Backup exceeds the 50 MiB in-app limit. No partial backup was created.",
    );
  return text;
}
