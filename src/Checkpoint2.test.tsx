import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import App from "./App";
import { openLedger, snapshot, saveBudget, type LedgerDB } from "./db";
import { deleteTransaction } from "./db";
import { addDays } from "./calendar";
import { localParts, money, type RecurringSchedule } from "./model";
let db: LedgerDB;
const today = localParts().localDate;
beforeEach(async () => {
  db = await openLedger("cp2-ui-" + crypto.randomUUID());
});
afterEach(async () => {
  db.close();
  await deleteDB(db.name);
});
async function start() {
  const view = render(<App database={db} />);
  await screen.findByRole("heading", { name: "Add transaction" });
  return view;
}
const schedule = (
  patch: Partial<RecurringSchedule> = {},
): RecurringSchedule => ({
  id: crypto.randomUUID(),
  name: "Daily plan",
  type: "expense",
  amount: 1000,
  categoryId: "expense-4",
  description: "",
  paymentMethod: "Cash",
  frequency: "daily",
  startDate: today,
  paused: false,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});
describe("Checkpoint 2 integration", () => {
  it("automatically reconciles launch, lists entries, preserves deletion across relaunch, and resumes without asking", async () => {
    await db.put("schedules", schedule({ startDate: addDays(today, -2) }));
    const view = await start();
    expect(
      await screen.findByText("3 recurring transactions added"),
    ).toBeVisible();
    const notice = screen.getByRole("region", {
      name: "Automatically added transactions",
    });
    expect(within(notice).getAllByRole("listitem")).toHaveLength(3);
    const rows = (await snapshot(db)).transactions;
    await deleteTransaction(db, rows[0].id);
    view.unmount();
    await start();
    expect((await snapshot(db)).transactions).toHaveLength(2);
    expect(
      screen.queryByText("3 recurring transactions added"),
    ).not.toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(2),
    );
  });
  it("reconciles a newly due occurrence on resume/focus", async () => {
    const s = schedule({ startDate: addDays(today, 1) });
    await db.put("schedules", s);
    await start();
    expect(await db.count("transactions")).toBe(0);
    await userEvent.setup().type(screen.getByLabelText("Amount"), "42");
    await db.put("schedules", {
      ...s,
      startDate: today,
      processedThrough: addDays(today, -1),
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(
      await screen.findByText("1 recurring transaction added"),
    ).toBeVisible();
    expect(await db.count("transactions")).toBe(1);
    expect(screen.getByLabelText("Amount")).toHaveValue("42");
  });
  it("creates, edits, pauses, resumes and deletes a schedule through Settings without deleting its entries", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Recurring transactions" }),
    );
    await user.click(screen.getByRole("button", { name: "Add schedule" }));
    await user.type(screen.getByLabelText("Schedule name"), "Cellphone");
    await user.type(screen.getByLabelText("Fixed amount (MXN)"), "250");
    await user.selectOptions(
      screen.getByLabelText("Schedule payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await db.count("schedules")).toBe(1);
    expect(await db.count("transactions")).toBe(1);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(async () =>
      expect((await snapshot(db)).schedules[0].paused).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(async () =>
      expect((await snapshot(db)).schedules[0].paused).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: /Cellphone monthly/ }));
    await user.clear(screen.getByLabelText("Fixed amount (MXN)"));
    await user.type(screen.getByLabelText("Fixed amount (MXN)"), "300");
    await user.selectOptions(
      screen.getByLabelText("Schedule payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect((await snapshot(db)).schedules[0].amount).toBe(30000);
    expect((await snapshot(db)).transactions[0].amount).toBe(25000);
    await user.click(screen.getByRole("button", { name: /Cellphone monthly/ }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete schedule" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await db.count("schedules")).toBe(0);
    expect(await db.count("transactions")).toBe(1);
  });
  it("sets budget, warns at 80%, keeps recording above 100%, and refunds restore availability while income does not", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Budgets" }));
    await user.click(screen.getByRole("button", { name: "Set a budget" }));
    await user.type(screen.getByLabelText("Monthly limit (MXN)"), "100");
    await user.click(screen.getByRole("button", { name: "Save budget" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Amount"), "80");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByText("Monthly budget notice · 1")).toBeVisible();
    await user.type(screen.getByLabelText("Amount"), "30");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(2),
    );
    await user.click(screen.getByRole("button", { name: "Income" }));
    await user.type(screen.getByLabelText("Amount"), "1000");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(3),
    );
    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(screen.getByLabelText("Amount"), "60");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Monthly budget notice · 1"),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(
      screen.getByRole("progressbar", { name: "Overall budget usage" }),
    ).toHaveAttribute("value", "0.5");
    expect(screen.getByText(/50.00 available/)).toBeVisible();
  });
  it("persists analytical mode and supports chart interval, series, period and date-range controls", async () => {
    const user = userEvent.setup();
    const view = await start();
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(
      screen.queryByRole("heading", { name: "Trends" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analytical" }));
    expect(
      await screen.findByRole("heading", { name: "Trends" }),
    ).toBeVisible();
    expect((await snapshot(db)).preferences.summaryMode).toBe("analytical");
    await user.selectOptions(screen.getByLabelText("Trend interval"), "weekly");
    expect(screen.getByRole("img", { name: /weekly income/ })).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Trend interval"), "yearly");
    await user.click(screen.getByRole("checkbox", { name: "Refunds" }));
    expect(
      screen.getByRole("slider", { name: "Selected trend period" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Summary range"),
      "lastMonth",
    );
    expect(screen.getByLabelText("Summary from")).toHaveValue(
      addDays(today.slice(0, 7) + "-01", -1).slice(0, 7) + "-01",
    );
    view.unmount();
    await start();
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByRole("button", { name: "Analytical" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("shows invalid summary ranges without affecting tracking, and keeps budgets on the current month", async () => {
    const user = userEvent.setup();
    await saveBudget(db, { id: "overall", limit: 10000 });
    await start();
    await user.click(screen.getByRole("button", { name: "Home" }));
    await user.clear(screen.getByLabelText("Summary through"));
    await user.type(screen.getByLabelText("Summary through"), "1900-01-01");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "valid date range",
    );
    expect(
      screen.getByRole("progressbar", { name: "Overall budget usage" }),
    ).toHaveAttribute("value", "0");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("Amount"), "1");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(1),
    );
    expect(money(100)).toMatch(/1.00/);
  });
});
