import { describe, it, expect } from "vitest";
import { averageDaily, budgetUsage, inRange, trend } from "./finance";
import { transaction } from "./test-fixtures";
const overall = { id: "overall", limit: 10000 };
describe("monthly spending budgets", () => {
  it("ignores ordinary income and counts automatic expenses", () => {
    const rows = [
      transaction({ amount: 8000, automatic: true }),
      transaction({ type: "income", categoryId: "income-0", amount: 500000 }),
    ];
    expect(budgetUsage(overall, rows, "2026-10")).toMatchObject({
      used: 8000,
      available: 2000,
      warning: "near",
    });
  });
  it("uses refund receipt month, not the original expense month", () => {
    const expense = transaction({ amount: 10000, localDate: "2026-09-30" }),
      refund = transaction({
        type: "refund",
        amount: 6000,
        localDate: "2026-10-01",
        originalExpenseId: expense.id,
      });
    expect(budgetUsage(overall, [expense, refund], "2026-09").used).toBe(10000);
    expect(budgetUsage(overall, [expense, refund], "2026-10")).toMatchObject({
      used: -6000,
      available: 16000,
      progress: 0,
      warning: undefined,
    });
  });
  it("restores only the assigned category while restoring the overall budget", () => {
    const rows = [
      transaction({ amount: 9000, categoryId: "expense-0" }),
      transaction({ type: "refund", amount: 3000, categoryId: "expense-1" }),
    ];
    expect(
      budgetUsage(
        { ...overall, id: "expense-0", categoryId: "expense-0" },
        rows,
        "2026-10",
      ).used,
    ).toBe(9000);
    expect(
      budgetUsage(
        { ...overall, id: "expense-1", categoryId: "expense-1" },
        rows,
        "2026-10",
      ).used,
    ).toBe(-3000);
    expect(budgetUsage(overall, rows, "2026-10").used).toBe(6000);
  });
  it.each([
    [7999, undefined],
    [8000, "near"],
    [9999, "near"],
    [10000, "exceeded"],
    [11000, "exceeded"],
  ] as const)("warns at exact threshold %s", (amount, warning) =>
    expect(
      budgetUsage(overall, [transaction({ amount })], "2026-10").warning,
    ).toBe(warning),
  );
  it("resets usage at calendar months and years with no carry", () => {
    expect(
      budgetUsage(
        overall,
        [transaction({ amount: 100, localDate: "2026-12-31" })],
        "2027-01",
      ),
    ).toMatchObject({ used: 0, available: 10000 });
  });
});
describe("analytical aggregation", () => {
  it("rounds half-cent daily averages symmetrically for refunds and expenses", () => {
    expect(
      averageDaily([transaction({ amount: 3 })], "2026-10-01", "2026-10-02"),
    ).toBe(2);
    expect(
      averageDaily(
        [transaction({ type: "refund", amount: 3 })],
        "2026-10-01",
        "2026-10-02",
      ),
    ).toBe(-2);
  });
  it("calculates net daily average over inclusive calendar days including empty days", () => {
    expect(
      averageDaily(
        [
          transaction({ amount: 10000 }),
          transaction({ type: "refund", amount: 1000 }),
        ],
        "2026-10-01",
        "2026-10-03",
      ),
    ).toBe(3000);
    expect(
      averageDaily(
        [transaction({ type: "refund", amount: 300 })],
        "2026-10-01",
        "2026-10-03",
      ),
    ).toBe(-100);
  });
  it("keeps all three trends separate and fills empty intervals", () => {
    const rows = [
      transaction({ amount: 100 }),
      transaction({ type: "income", amount: 200, localDate: "2026-10-02" }),
      transaction({ type: "refund", amount: 50, localDate: "2026-10-03" }),
    ];
    expect(
      trend(rows, "2026-10-01", "2026-10-04", "daily").map((p) => [
        p.expenses,
        p.income,
        p.refunds,
      ]),
    ).toEqual([
      [100, 0, 0],
      [0, 200, 0],
      [0, 0, 50],
      [0, 0, 0],
    ]);
  });
  it("groups Monday weeks across years and clips range edges", () => {
    const rows = [
      transaction({ localDate: "2025-12-29", amount: 999 }),
      transaction({ localDate: "2026-01-01", amount: 100 }),
      transaction({ localDate: "2026-01-05", amount: 200 }),
    ];
    const series = trend(rows, "2026-01-01", "2026-01-05", "weekly");
    expect(series.map((p) => [p.label, p.expenses])).toEqual([
      ["2025-12-29", 100],
      ["2026-01-05", 200],
    ]);
  });
  it("handles monthly and yearly boundaries and inclusive filters", () => {
    const rows = [
      transaction({ localDate: "2025-12-31", amount: 100 }),
      transaction({ localDate: "2026-01-01", amount: 200 }),
    ];
    expect(
      trend(rows, "2025-12-31", "2026-01-01", "monthly").map((p) => p.expenses),
    ).toEqual([100, 200]);
    expect(
      trend(rows, "2025-12-31", "2026-01-01", "yearly").map((p) => p.expenses),
    ).toEqual([100, 200]);
    expect(inRange(rows, "2026-01-01", "2026-01-01")).toHaveLength(1);
  });
  it("bounds chart density without blocking coarser summaries", () => {
    expect(() => trend([], "2000-01-01", "2026-10-01", "daily")).toThrow(
      "coarser",
    );
    expect(trend([], "2000-01-01", "2026-10-01", "yearly")).toHaveLength(27);
  });
});
