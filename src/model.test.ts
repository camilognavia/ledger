import { describe, it, expect } from "vitest";
import {
  parseMoney,
  amountInput,
  totals,
  parseLocal,
  localParts,
  filterTransactions,
  emptyFilters,
  normalizeName,
} from "./model";
import { transaction } from "./test-fixtures";
describe("integer currency", () => {
  it("parses decimal text without binary currency arithmetic", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("85")).toBe(8500);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("999999999.99")).toBe(99999999999);
    expect(amountInput(10001)).toBe("100.01");
  });
  it.each([
    "0",
    "-1",
    "1.234",
    "1,000.00",
    "1e4",
    "NaN",
    "",
    "Infinity",
    "1000000000",
  ])("rejects invalid entry %j", (value) =>
    expect(() => parseMoney(value)).toThrow(),
  );
  it("separates ordinary income, expenses, and refunds, including excess refunds", () => {
    expect(
      totals([
        transaction({ amount: 10000 }),
        transaction({ type: "income", amount: 5000, categoryId: "income-0" }),
        transaction({ type: "refund", amount: 12000 }),
      ]),
    ).toEqual({
      expenses: 10000,
      income: 5000,
      refunds: 12000,
      netSpending: -2000,
      netCashFlow: 7000,
    });
  });
  it("guards totals against unsafe integer overflow", () =>
    expect(() =>
      totals([
        transaction({ amount: Number.MAX_SAFE_INTEGER }),
        transaction({ amount: 1 }),
      ]),
    ).toThrow());
});
describe("local calendar and searching", () => {
  it("allows a zero amount filter boundary without accepting zero transactions", () => {
    expect(
      filterTransactions([transaction()], [], {
        ...emptyFilters,
        min: "0",
        max: "100",
      }),
    ).toHaveLength(1);
    expect(() => parseMoney("0")).toThrow();
  });
  it("round trips local dates without UTC parsing", () => {
    const ts = parseLocal("2024-02-29", "23:59");
    expect(localParts(new Date(ts))).toEqual({
      localDate: "2024-02-29",
      localTime: "23:59",
    });
  });
  it.each([
    ["2026-02-29", "12:00"],
    ["2026-04-31", "00:00"],
    ["2026-01-01", "25:00"],
    ["", "12:00"],
  ])("rejects invalid calendar %s %s", (d, t) =>
    expect(() => parseLocal(d, t)).toThrow(),
  );
  it("uses recorded local day for reporting and inclusive boundaries", () => {
    const rows = [
      transaction({ localDate: "2026-10-01", occurredAt: 99999 }),
      transaction({ localDate: "2026-09-30", occurredAt: 999999 }),
    ];
    expect(
      filterTransactions(rows, [], {
        ...emptyFilters,
        from: "2026-10-01",
        to: "2026-10-01",
      }),
    ).toHaveLength(1);
  });
  it("combines merchant/description, category, type, amount, and order filters", () => {
    const rows = [
      transaction({ id: "first", merchantId: "cafe", amount: 10000 }),
      transaction({
        id: "second",
        merchantId: "cafe",
        localDate: "2026-10-02",
        amount: 20000,
      }),
      transaction({ id: "third", type: "income", categoryId: "income-0" }),
    ];
    const merchants = [
      {
        id: "cafe",
        name: "Cafe Ciencias",
        normalizedName: "cafe ciencias",
        archived: false,
      },
    ];
    expect(
      filterTransactions(rows, merchants, {
        ...emptyFilters,
        query: "CAFE",
        merchantId: "cafe",
        categoryId: "expense-0",
        type: "expense",
        min: "100",
        max: "200",
        order: "oldest",
      }).map((x) => x.id),
    ).toEqual(["first", "second"]);
    expect(
      filterTransactions(rows, [], { ...emptyFilters, query: "latte" }),
    ).toHaveLength(3);
  });
  it("normalizes merchant case, unicode, and spacing", () =>
    expect(normalizeName("  Ｃafe   CIENCIAS  ")).toBe("cafe ciencias"));
});
