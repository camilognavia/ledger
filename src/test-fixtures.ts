import { parseLocal, type Transaction } from "./model";
export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    type: "expense",
    amount: 8500,
    categoryId: "expense-0",
    description: "Latte",
    paymentMethod: "Cash",
    occurredAt: parseLocal("2026-10-01", "12:30"),
    localDate: "2026-10-01",
    localTime: "12:30",
    createdAt: 1,
    updatedAt: 1,
    automatic: false,
    ...overrides,
  };
}
