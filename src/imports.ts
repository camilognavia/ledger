import {
  ALL_STORES,
  canonical,
  readData,
  validateBackup,
  type BackupData,
} from "./backup";
import { DATABASE_VERSION, type LedgerDB } from "./db";
import {
  categoryKind,
  normalizeName,
  parseLocal,
  parseMoney,
  type Category,
  type Merchant,
  type Transaction,
  type ImportReceipt,
} from "./model";
import { dateNumber } from "./calendar";
import type { Cell, RawTable } from "./spreadsheets";
export const importFields = [
  "date",
  "time",
  "type",
  "category",
  "merchant",
  "description",
  "amount",
  "paymentMethod",
  "sourceId",
  "automatic",
] as const;
export type ImportField = (typeof importFields)[number];
export type Mapping = Record<ImportField, number>;
export const mappingLabels: Record<ImportField, string> = {
  date: "Date",
  time: "Time",
  type: "Type",
  category: "Category",
  merchant: "Merchant",
  description: "Description",
  amount: "Amount",
  paymentMethod: "Payment method",
  sourceId: "Transaction ID",
  automatic: "Automatic",
};
export function defaultMapping(table: RawTable): Mapping {
  return Object.fromEntries(
    importFields.map((f) => [
      f,
      table.headers.findIndex(
        (h) => normalizeName(h) === normalizeName(mappingLabels[f]),
      ),
    ]),
  ) as Mapping;
}
const str = (v: Cell | undefined) =>
  v === null || v === undefined
    ? ""
    : v instanceof Date
      ? v.toISOString()
      : String(v);
function amount(v: Cell | undefined) {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0)
      throw new Error("Amount must be positive.");
    const cents = Math.round(v * 100);
    if (
      Math.abs(v - cents / 100) >
      Number.EPSILON * Math.max(1, Math.abs(v)) * 4
    )
      throw new Error("Amount has more than two decimal places.");
    return parseMoney((cents / 100).toFixed(2));
  }
  return parseMoney(str(v));
}
export function fingerprint(
  t: Pick<
    Transaction,
    | "type"
    | "localDate"
    | "localTime"
    | "amount"
    | "description"
    | "paymentMethod"
  >,
  category: string,
  merchant: string,
) {
  return JSON.stringify([
    t.type,
    t.localDate,
    t.localTime,
    t.amount,
    normalizeName(category),
    normalizeName(merchant),
    normalizeName(t.description),
    normalizeName(t.paymentMethod),
  ]);
}
export function existingFingerprints(data: BackupData) {
  const cats = new Map(data.categories.map((c) => [c.id, c.name])),
    merchants = new Map(data.merchants.map((m) => [m.id, m.name]));
  return new Set(
    data.transactions.map((t) =>
      fingerprint(
        t,
        cats.get(t.categoryId) || "",
        merchants.get(t.merchantId || "") || "",
      ),
    ),
  );
}
class RecurringRowError extends Error {}
export interface PreviewRow {
  row: number;
  status: "valid" | "duplicate" | "invalid" | "excluded";
  message: string;
  transaction?: Transaction;
  receipt?: ImportReceipt;
}
export interface ImportPlan {
  base: string;
  rows: PreviewRow[];
  categories: Category[];
  merchants: Merchant[];
}
export async function previewImport(
  db: LedgerDB,
  table: RawTable,
  mapping: Mapping,
): Promise<ImportPlan> {
  if (table.rows.length > 50000) throw new Error("Maximum 50,000 import rows.");
  if (mapping.date < 0 || mapping.amount < 0)
    throw new Error("Map Date and Amount before previewing.");
  const assigned = Object.values(mapping).filter((n) => n >= 0);
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.some((n) => !Number.isInteger(n) || n >= table.headers.length)
  )
    throw new Error("Map each source column at most once.");
  const tx = db.transaction([...ALL_STORES]);
  void tx.done.catch(() => {});
  const data = await readData(tx);
  await tx.done;
  const base = canonical(data);
  const cats = [...data.categories],
    merchants = [...data.merchants];
  const seen = existingFingerprints(data);
  for (const r of data.imports) seen.add(r.fingerprint);
  const sources = new Set([
    ...data.transactions.map((t) => t.id),
    ...data.occurrences
      .map((o) => o.transactionId)
      .filter((id): id is string => !!id),
    ...data.imports.map((r) => r.transactionId),
    ...data.imports.map((r) => r.sourceId).filter((v): v is string => !!v),
  ]);
  const rows: PreviewRow[] = [];
  for (let i = 0; i < table.rows.length; i++) {
    try {
      const row = table.rows[i],
        get = (f: ImportField) => (mapping[f] >= 0 ? row[mapping[f]] : "");
      // Source recurrence metadata is blocked even if the user maps away the Automatic column.
      for (let c = 0; c < table.headers.length; c++) {
        const header = normalizeName(table.headers[c]);
        const value = str(row[c]).trim();
        if (
          ["occurrence key", "recurring schedule id"].includes(header) &&
          value
        )
          throw new RecurringRowError(
            "Recurring identities require a complete JSON backup, not spreadsheet import.",
          );
        if (
          header === "automatic" &&
          !["", "manual", "false", "0", "no"].includes(normalizeName(value))
        )
          throw new RecurringRowError(
            "Automatic rows must be restored using JSON backup.",
          );
      }
      if (
        !["", "manual", "false", "0", "no"].includes(
          normalizeName(str(get("automatic"))),
        )
      )
        throw new RecurringRowError(
          "Automatic rows must be restored using JSON backup.",
        );
      const type = (str(get("type")).trim().toLowerCase() ||
        "expense") as Transaction["type"];
      if (!["expense", "income", "refund"].includes(type))
        throw new Error("Type must be expense, income, or refund.");
      const dateCell = get("date");
      const localDate =
        dateCell instanceof Date
          ? dateCell.toISOString().slice(0, 10)
          : str(dateCell).trim();
      dateNumber(localDate);
      const timeCell = get("time");
      let localTime =
        timeCell instanceof Date
          ? timeCell.toISOString().slice(11, 16)
          : str(timeCell).trim() || "00:00";
      if (typeof timeCell === "number") {
        if (timeCell < 0 || timeCell >= 1)
          throw new Error("Time must be HH:mm.");
        const minutes = Math.round(timeCell * 1440);
        if (minutes >= 1440) throw new Error("Time is outside the day.");
        localTime =
          String(Math.floor(minutes / 60)).padStart(2, "0") +
          ":" +
          String(minutes % 60).padStart(2, "0");
      }
      const occurredAt = parseLocal(localDate, localTime);
      const kind = categoryKind(type);
      const categoryName =
        str(get("category")).trim() ||
        (kind === "income" ? "Other Income" : "Other");
      const merchantName = str(get("merchant")).trim().replace(/\s+/g, " ");
      const description = str(get("description")).trim(),
        paymentMethod = str(get("paymentMethod")).trim(),
        sourceId = str(get("sourceId")).trim() || undefined;
      if (
        categoryName.length > 50 ||
        merchantName.length > 80 ||
        description.length > 500 ||
        paymentMethod.length > 80 ||
        (sourceId && sourceId.length > 256)
      )
        throw new Error("A text field exceeds its supported length.");
      if (
        [
          categoryName,
          merchantName,
          description,
          paymentMethod,
          sourceId || "",
        ].some((s) => s.includes("\0"))
      )
        throw new Error("Text fields cannot contain null characters.");
      const cents = amount(get("amount"));
      const value = {
        type,
        localDate,
        localTime,
        amount: cents,
        description,
        paymentMethod,
      };
      const fp = fingerprint(value, categoryName, merchantName);
      if ((sourceId && sources.has(sourceId)) || seen.has(fp)) {
        rows.push({
          row: i + 2,
          status: "duplicate",
          message:
            "Matching source ID or transaction content already exists (including earlier imports).",
        });
        continue;
      }
      let category = cats.find(
        (c) =>
          c.kind === kind &&
          normalizeName(c.name) === normalizeName(categoryName),
      );
      if (!category) {
        category = {
          id: crypto.randomUUID(),
          kind,
          name: categoryName,
          icon: "circle",
          color: "",
          archived: false,
        };
        cats.push(category);
      }
      let merchant = merchantName
        ? merchants.find(
            (m) => m.normalizedName === normalizeName(merchantName),
          )
        : undefined;
      if (merchantName && !merchant) {
        merchant = {
          id: crypto.randomUUID(),
          name: merchantName,
          normalizedName: normalizeName(merchantName),
          archived: false,
        };
        merchants.push(merchant);
      }
      const now = Date.now();
      const t: Transaction = {
        id: crypto.randomUUID(),
        ...value,
        categoryId: category.id,
        merchantId: merchant?.id,
        occurredAt,
        createdAt: now,
        updatedAt: now,
        automatic: false,
      };
      const receipt: ImportReceipt = {
        id: crypto.randomUUID(),
        transactionId: t.id,
        fingerprint: fp,
        sourceId,
        importedAt: now,
      };
      rows.push({
        row: i + 2,
        status: "valid",
        message: "Ready",
        transaction: t,
        receipt,
      });
      seen.add(fp);
      if (sourceId) sources.add(sourceId);
    } catch (e) {
      rows.push({
        row: i + 2,
        status: e instanceof RecurringRowError ? "excluded" : "invalid",
        message: (e as Error).message,
      });
    }
  }
  return {
    base,
    rows,
    categories: cats.filter(
      (c) => !data.categories.some((old) => old.id === c.id),
    ),
    merchants: merchants.filter(
      (m) => !data.merchants.some((old) => old.id === m.id),
    ),
  };
}
export async function commitImport(db: LedgerDB, plan: ImportPlan) {
  if (plan.rows.some((r) => r.status === "invalid"))
    throw new Error("Fix all invalid rows before importing.");
  const valid = plan.rows.filter((r) => r.status === "valid");
  if (!valid.length) throw new Error("There are no new valid rows to import.");
  const tx = db.transaction([...ALL_STORES], "readwrite");
  void tx.done.catch(() => {});
  try {
    const current = await readData(tx);
    if (canonical(current) !== plan.base)
      throw new Error(
        "Ledger changed since preview. Preview the import again.",
      );
    const candidate = {
      ...current,
      categories: [...current.categories, ...plan.categories],
      merchants: [...current.merchants, ...plan.merchants],
      transactions: [
        ...current.transactions,
        ...valid.map((r) => r.transaction!),
      ],
      imports: [...current.imports, ...valid.map((r) => r.receipt!)],
    };
    validateBackup({
      format: "ledger-backup",
      formatVersion: 1,
      databaseVersion: DATABASE_VERSION,
      exportedAt: new Date().toISOString(),
      data: candidate,
    });
    const fingerprints = existingFingerprints(current);
    for (const r of current.imports) fingerprints.add(r.fingerprint);
    const sources = new Set([
      ...current.transactions.map((t) => t.id),
      ...current.occurrences
        .map((o) => o.transactionId)
        .filter((id): id is string => !!id),
      ...current.imports.flatMap((r) => [
        r.transactionId,
        ...(r.sourceId ? [r.sourceId] : []),
      ]),
    ]);
    for (const row of valid) {
      const t = row.transaction!,
        r = row.receipt!;
      const fp = fingerprint(
        t,
        candidate.categories.find((c) => c.id === t.categoryId)?.name || "",
        candidate.merchants.find((m) => m.id === t.merchantId)?.name || "",
      );
      if (
        fp !== r.fingerprint ||
        fingerprints.has(fp) ||
        (r.sourceId && sources.has(r.sourceId))
      )
        throw new Error(
          "Import duplicate or provenance mismatch. Preview again.",
        );
      fingerprints.add(fp);
      if (r.sourceId) sources.add(r.sourceId);
    }
    for (const c of plan.categories) await tx.objectStore("categories").add(c);
    for (const m of plan.merchants) await tx.objectStore("merchants").add(m);
    for (const r of valid) {
      if (
        !r.transaction ||
        r.transaction.automatic ||
        r.transaction.occurrenceKey ||
        r.transaction.recurringScheduleId ||
        !r.receipt ||
        r.receipt.transactionId !== r.transaction.id
      )
        throw new Error("Invalid import plan.");
      await tx.objectStore("transactions").add(r.transaction);
      await tx.objectStore("imports").add(r.receipt);
    }
    await tx.done;
    return valid.length;
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
