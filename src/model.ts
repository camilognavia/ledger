export type TransactionType = "expense" | "income" | "refund";
export type CategoryKind = "expense" | "income";
export interface Category {
  id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  isFallback?: boolean;
}
export interface Merchant {
  id: string;
  name: string;
  normalizedName: string;
  defaultCategoryId?: string;
  archived: boolean;
}
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  merchantId?: string;
  description: string;
  paymentMethod: string;
  occurredAt: number;
  localDate: string;
  localTime: string;
  createdAt: number;
  updatedAt: number;
  automatic: boolean;
  originalExpenseId?: string;
  recurringScheduleId?: string;
  occurrenceKey?: string;
}
export interface Preferences {
  id: "user";
  appearance: "system" | "light" | "dark";
  currency: "MXN";
  lastCategory: Partial<Record<TransactionType, string>>;
  summaryMode?: "basic" | "analytical";
  backupReminder?: boolean;
  lastBackupAt?: number;
  backupReminderDismissedMonth?: string;
}
export interface PaymentMethod {
  id: string;
  name: string;
  normalizedName: string;
  archived: boolean;
}
export interface Snapshot {
  paymentMethods: PaymentMethod[];
  categories: Category[];
  merchants: Merchant[];
  transactions: Transaction[];
  preferences: Preferences;
  schedules: RecurringSchedule[];
  budgets: Budget[];
}
export const defaultPreferences: Preferences = {
  id: "user",
  appearance: "system",
  currency: "MXN",
  lastCategory: {},
  summaryMode: "basic",
};
export const categoryKind = (type: TransactionType): CategoryKind =>
  type === "income" ? "income" : "expense";
export const icons = [
  "utensils",
  "basket",
  "car",
  "book",
  "repeat",
  "film",
  "bag",
  "circle",
  "gift",
  "briefcase",
  "coffee",
  "heart",
  "home",
  "phone",
  "music",
  "train",
];
const expenseNames = [
  "Food & Drinks",
  "Groceries",
  "Transportation & Gas",
  "School",
  "Subscriptions",
  "Entertainment",
  "Shopping",
  "Other",
];
export const initialCategories: Category[] = [
  ...expenseNames.map((name, i) => ({
    id: `expense-${i}`,
    kind: "expense" as const,
    name,
    icon: icons[i],
    color: "",
    archived: false,
    isFallback: i === 7,
  })),
  ...["Allowance", "Gifts", "Work", "Other Income"].map((name, i) => ({
    id: `income-${i}`,
    kind: "income" as const,
    name,
    icon: ["circle", "gift", "briefcase", "circle"][i],
    color: "",
    archived: false,
    isFallback: i === 3,
  })),
];
export function parseMoney(value: string, allowZero = false): number {
  const s = value.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw new Error("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = s.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if ((allowZero ? amount < 0 : amount <= 0) || !Number.isSafeInteger(amount))
    throw new Error("Amount must be greater than zero.");
  return amount;
}
export function amountInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(cents / 100);
export function localParts(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    localDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    localTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
export function parseLocal(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("Choose a valid local date and time.");
  const result = new Date(`${date}T${time}:00`);
  const p = localParts(result);
  if (
    !Number.isFinite(result.getTime()) ||
    p.localDate !== date ||
    p.localTime !== time
  )
    throw new Error("This local date or time does not exist.");
  return result.getTime();
}
export function totals(rows: Transaction[]) {
  let expenses = 0,
    income = 0,
    refunds = 0;
  for (const row of rows) {
    if (row.type === "expense") expenses += row.amount;
    else if (row.type === "income") income += row.amount;
    else refunds += row.amount;
  }
  if (
    ![expenses, income, refunds, income + refunds, expenses - refunds].every(
      Number.isSafeInteger,
    )
  )
    throw new Error("Totals exceed safe numeric range.");
  return {
    expenses,
    income,
    refunds,
    netSpending: expenses - refunds,
    netCashFlow: income + refunds - expenses,
  };
}
export const normalizeName = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export const initialPaymentMethods: PaymentMethod[] = [
  "Cash",
  "Debit Card",
  "Credit Card",
  "Bank Transfer",
  "Other",
].map((name, i) => ({
  id: `payment-${i}`,
  name,
  normalizedName: normalizeName(name),
  archived: false,
}));
export interface Filters {
  paymentMethod: string;
  query: string;
  type: string;
  categoryId: string;
  merchantId: string;
  from: string;
  to: string;
  min: string;
  max: string;
  order: "newest" | "oldest";
}
export const emptyFilters: Filters = {
  paymentMethod: "",
  query: "",
  type: "",
  categoryId: "",
  merchantId: "",
  from: "",
  to: "",
  min: "",
  max: "",
  order: "newest",
};
export function filterTransactions(
  rows: Transaction[],
  merchants: Merchant[],
  f: Filters,
) {
  const names = new Map(merchants.map((m) => [m.id, m.name.toLowerCase()]));
  const min = f.min ? parseMoney(f.min, true) : 0,
    max = f.max ? parseMoney(f.max, true) : Infinity;
  return rows
    .filter(
      (t) =>
        (!f.paymentMethod ||
          (f.paymentMethod === "unspecified"
            ? !normalizeName(t.paymentMethod)
            : normalizeName(t.paymentMethod) === f.paymentMethod.slice(6))) &&
        (!f.type || t.type === f.type) &&
        (!f.categoryId || t.categoryId === f.categoryId) &&
        (!f.merchantId || t.merchantId === f.merchantId) &&
        (!f.from || t.localDate >= f.from) &&
        (!f.to || t.localDate <= f.to) &&
        t.amount >= min &&
        t.amount <= max &&
        (!f.query ||
          `${names.get(t.merchantId || "") || ""} ${t.description}`
            .toLowerCase()
            .includes(f.query.toLowerCase().trim())),
    )
    .sort(
      (a, b) =>
        (f.order === "newest" ? -1 : 1) *
        (a.localDate.localeCompare(b.localDate) ||
          a.localTime.localeCompare(b.localTime) ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id)),
    );
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export interface RecurringSchedule {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  merchantId?: string;
  description: string;
  paymentMethod: string;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  paused: boolean;
  processedThrough?: string;
  createdAt: number;
  updatedAt: number;
}
export interface Occurrence {
  id: string;
  scheduleId: string;
  date: string;
  transactionId?: string;
  state: "generated" | "deleted" | "skipped";
}
export interface Budget {
  id: string;
  categoryId?: string;
  limit: number;
}

export interface ImportReceipt {
  id: string;
  transactionId: string;
  fingerprint: string;
  sourceId?: string;
  importedAt: number;
}
