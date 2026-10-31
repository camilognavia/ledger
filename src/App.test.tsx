import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import App from "./App";
import {
  openLedger,
  snapshot,
  saveMerchant,
  saveTransaction,
  type LedgerDB,
} from "./db";
import { transaction } from "./test-fixtures";
let db: LedgerDB;
beforeEach(async () => {
  db = await openLedger("ui-" + crypto.randomUUID());
});
afterEach(async () => {
  const name = db.name;
  db.close();
  await deleteDB(name);
});
async function start() {
  const view = render(<App database={db} />);
  await screen.findByRole("heading", { name: "Add transaction" });
  return view;
}
describe("everyday entry and navigation", () => {
  it("launches to Add; saves once, clears optional data, remembers category, and persists across remount", async () => {
    const user = userEvent.setup();
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe Ciencias",
      normalizedName: "",
      archived: false,
    });
    const view = await start();
    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "85.25");
    await user.selectOptions(
      screen.getByLabelText("Recurring merchant"),
      "cafe",
    );
    await user.type(screen.getByLabelText("Description"), "Coffee");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.dblClick(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(1),
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    expect(screen.getByLabelText("Recurring merchant")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    view.unmount();
    await start();
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    expect((await snapshot(db)).transactions[0].amount).toBe(8525);
  });
  it("validates amount and separates income/refund category grids", async () => {
    const user = userEvent.setup();
    await start();
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "1.234");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("two decimal");
    expect((await snapshot(db)).transactions).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByRole("button", { name: "Allowance" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Groceries" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refund" }));
    expect(screen.getByRole("button", { name: "Groceries" })).toBeVisible();
  });
  it("applies merchant default and allows a manual category override", async () => {
    const user = userEvent.setup();
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe",
      normalizedName: "",
      archived: false,
      defaultCategoryId: "expense-1",
    });
    await start();
    await user.selectOptions(
      screen.getByLabelText("Recurring merchant"),
      "cafe",
    );
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Food & Drinks" }));
    expect(
      screen.getByRole("button", { name: "Food & Drinks" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("edits and deletes through history with confirmation", async () => {
    const user = userEvent.setup();
    const t = transaction();
    await saveTransaction(db, t);
    await start();
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /Latte/ }));
    await screen.findByRole("heading", { name: "Transaction details" });
    await user.click(screen.getByRole("button", { name: "Edit transaction" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Amount"));
    await user.type(within(dialog).getByLabelText("Amount"), "99");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect((await snapshot(db)).transactions[0].amount).toBe(9900);
    await user.type(screen.getByLabelText("Search history"), "nonexistent");
    expect(screen.getByText("No matching entries")).toBeVisible();
    await user.clear(screen.getByLabelText("Search history"));
    await user.click(screen.getByRole("button", { name: /Latte/ }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(
      screen.getByRole("button", { name: "Delete transaction" }),
    );
    expect((await snapshot(db)).transactions).toHaveLength(1);
    confirm.mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: "Delete transaction" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect((await snapshot(db)).transactions).toHaveLength(0);
  });
  it("persists appearance and makes settings management usable", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("dark"),
    );
    expect((await snapshot(db)).preferences.appearance).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Categories" }));
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.type(screen.getByLabelText("Name"), "Lab supplies");
    await user.click(screen.getByRole("button", { name: "Save category" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      (await snapshot(db)).categories.some((c) => c.name === "Lab supplies"),
    ).toBe(true);
  });
});

describe("additional integrity workflows", () => {
  it("remembers unsaved category choices across types and app launch", async () => {
    const user = userEvent.setup();
    const view = await start();
    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.click(screen.getByRole("button", { name: "Income" }));
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Expense" }));
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(async () =>
      expect((await snapshot(db)).preferences.lastCategory.income).toBe(
        "income-2",
      ),
    );
    view.unmount();
    await start();
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("creates income and refund separately and reports correct month totals", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Income" }));
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(screen.getByLabelText("Amount"), "20");
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(2),
    );
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByText(/120\.00/)).toBeVisible();
    expect(screen.getAllByText(/-.*20\.00/).length).toBeGreaterThan(0);
    expect((await snapshot(db)).transactions.map((t) => t.type).sort()).toEqual(
      ["income", "refund"],
    );
  });
  it("keeps form input when storage rejects a new entry", async () => {
    const user = userEvent.setup();
    await start();
    await user.type(screen.getByLabelText("Amount"), "75");
    await user.type(screen.getByLabelText("Description"), "Do not lose this");
    const c = (await db.get("categories", "expense-0"))!;
    await db.put("categories", { ...c, archived: true });
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByText("Choose an active category.")).toBeVisible();
    expect(screen.getByLabelText("Amount")).toHaveValue("75");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Do not lose this",
    );
    expect((await snapshot(db)).transactions).toHaveLength(0);
  });
  it("creates and archives merchants; duplicate validation remains visible inside the modal", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Recurring merchants" }),
    );
    await user.click(screen.getByRole("button", { name: "Add merchant" }));
    await user.type(screen.getByLabelText("Name"), "Cafe Ciencias");
    await user.click(screen.getByRole("button", { name: "Save merchant" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add merchant" }));
    await user.type(screen.getByLabelText("Name"), "  CAFE CIENCIAS ");
    await user.click(screen.getByRole("button", { name: "Save merchant" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("status"),
      ).toHaveTextContent("already exists"),
    );
    expect((await snapshot(db)).merchants).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(
      screen.getByRole("button", { name: /Cafe Ciencias No default category/ }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Archived (hide from new entries)",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save merchant" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect((await snapshot(db)).merchants[0].archived).toBe(true);
  });
});
