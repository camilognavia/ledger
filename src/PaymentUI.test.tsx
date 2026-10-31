import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import App from "./App";
import {
  openLedger,
  snapshot,
  saveMerchant,
  savePaymentMethod,
  saveTransaction,
  type LedgerDB,
} from "./db";
import { TransactionForm } from "./TransactionForm";
import { History } from "./History";
import { transaction } from "./test-fixtures";
let db: LedgerDB;
beforeEach(async () => {
  db = await openLedger("payment-ui-" + crypto.randomUUID());
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
describe("Ledger 1.1 entry and management", () => {
  it("exposes fields in order without details, keeps initial merchant/payment empty, and resets after custom save", async () => {
    const user = userEvent.setup();
    await start();
    expect(screen.queryByText("More details")).not.toBeInTheDocument();
    const merchant = screen.getByLabelText("Merchant / payee"),
      grid = screen.getByLabelText("Categories"),
      description = screen.getByLabelText("Description"),
      payment = screen.getByLabelText("Payment method"),
      date = screen.getByLabelText("Set date and time"),
      save = screen.getByRole("button", { name: "Save transaction" });
    for (const [a, b] of [
      [merchant, grid],
      [grid, description],
      [description, payment],
      [payment, date],
      [date, save],
    ])
      expect(
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(merchant).toHaveValue("");
    expect(payment).toHaveValue("");
    expect(
      within(payment)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Bank Transfer", "Cash", "Credit Card", "Debit Card", "Other"]);
    await user.selectOptions(payment, "custom");
    await user.type(
      screen.getByLabelText("Custom payment method (optional)"),
      "Other wallet",
    );
    await user.type(screen.getByLabelText("Amount"), "25");
    await user.click(save);
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(1),
    );
    expect((await snapshot(db)).transactions[0].paymentMethod).toBe(
      "Other wallet",
    );
    expect(payment).not.toBeInTheDocument(); // form key resets the custom field state
    expect(screen.getByLabelText("Payment method")).toHaveValue("");
    expect(
      screen.queryByLabelText("Custom payment method (optional)"),
    ).not.toBeInTheDocument();
  });
  it("saves Other and configured methods; prevents an unspecified new entry", async () => {
    const user = userEvent.setup();
    await start();
    for (const value of ["custom", "value:Cash"]) {
      await user.selectOptions(screen.getByLabelText("Payment method"), value);
      await user.type(screen.getByLabelText("Amount"), "1");
      await user.click(
        screen.getByRole("button", { name: "Save transaction" }),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Amount")).toHaveValue(""),
      );
    }
    expect(
      (await snapshot(db)).transactions.map((t) => t.paymentMethod).sort(),
    ).toEqual(["Cash", "Other"]);
    await user.type(screen.getByLabelText("Amount"), "1");
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a payment method",
    );
    expect((await snapshot(db)).transactions).toHaveLength(2);
  });
  it("adds, selects, renames and archives a method in the existing Settings patterns", async () => {
    const user = userEvent.setup();
    await start();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Payment methods" }));
    await user.click(
      screen.getByRole("button", { name: "Add payment method" }),
    );
    await user.type(screen.getByLabelText("Name"), "Wallet");
    await user.click(
      screen.getByRole("button", { name: "Save payment method" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.selectOptions(
      screen.getByLabelText("Payment method"),
      "value:Wallet",
    );
    await user.type(screen.getByLabelText("Amount"), "10");
    await user.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(async () =>
      expect((await snapshot(db)).transactions).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Payment methods" }));
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Gift wallet");
    await user.click(screen.getByLabelText("Archived (hide from new entries)"));
    await user.click(
      screen.getByRole("button", { name: "Save payment method" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      (await snapshot(db)).paymentMethods.find((m) => m.name === "Gift wallet")
        ?.archived,
    ).toBe(true);
    expect((await snapshot(db)).transactions[0].paymentMethod).toBe("Wallet");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      within(screen.getByLabelText("Payment method")).queryByRole("option", {
        name: "Gift wallet",
      }),
    ).not.toBeInTheDocument();
  });
  it("retains edit category until a merchant changes, applies each valid default, and permits overrides", async () => {
    const user = userEvent.setup();
    for (const [id, defaultCategoryId] of [
      ["a", "expense-1"],
      ["b", "expense-2"],
      ["none", undefined],
      ["income", "income-0"],
      ["archived", "expense-3"],
    ])
      await saveMerchant(db, {
        id: id!,
        name: id!,
        normalizedName: "",
        defaultCategoryId,
        archived: false,
      });
    const school = (await db.get("categories", "expense-3"))!;
    await db.put("categories", { ...school, archived: true });
    const onSave = vi.fn().mockResolvedValue(true),
      t = transaction({
        merchantId: "a",
        categoryId: "expense-0",
        paymentMethod: " Legacy TEXT ",
      });
    render(
      <TransactionForm data={await snapshot(db)} initial={t} onSave={onSave} />,
    );
    const pressed = (name: string) =>
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    pressed("Food & Drinks");
    await user.selectOptions(screen.getByLabelText("Recurring merchant"), "b");
    pressed("Transportation & Gas");
    await user.click(screen.getByRole("button", { name: "Shopping" }));
    pressed("Shopping");
    for (const id of ["none", "income", "archived", ""]) {
      await user.selectOptions(screen.getByLabelText("Recurring merchant"), id);
      pressed("Shopping");
    }
    await user.selectOptions(screen.getByLabelText("Recurring merchant"), "a");
    pressed("Groceries");
    await user.click(screen.getByRole("button", { name: "Shopping" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: "a",
        categoryId: "expense-6",
        paymentMethod: " Legacy TEXT ",
      }),
      true,
    );
  });
  it("keeps an archived/legacy payment selectable and unchanged during editing", async () => {
    const user = userEvent.setup(),
      cash = (await db.get("paymentMethods", "payment-0"))!;
    await savePaymentMethod(db, { ...cash, archived: true });
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <TransactionForm
        data={await snapshot(db)}
        initial={transaction({ paymentMethod: "cash" })}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText("Payment method")).toHaveValue("value:cash");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cash" }),
      true,
    );
  });
  it("filters History by archived/custom/legacy/unspecified labels and combines existing controls", async () => {
    const user = userEvent.setup();
    await saveMerchant(db, {
      id: "shop",
      name: "Shop",
      normalizedName: "",
      archived: false,
    });
    const rows = [
      transaction({
        id: "cash1",
        paymentMethod: " CASH  ",
        description: "Coffee",
        merchantId: "shop",
      }),
      transaction({ id: "cash2", paymentMethod: "Cash", description: "Bread" }),
      transaction({ id: "empty", paymentMethod: "", description: "Empty" }),
      transaction({
        id: "custom",
        paymentMethod: "Voucher",
        description: "Custom",
      }),
      transaction({
        id: "refund",
        type: "refund",
        paymentMethod: "Cash",
        description: "Refund",
      }),
    ];
    for (const t of rows) {
      if (t.paymentMethod) await saveTransaction(db, t);
      else await db.put("transactions", t);
    }
    const cash = (await db.get("paymentMethods", "payment-0"))!;
    await savePaymentMethod(db, { ...cash, archived: true });
    render(
      <History data={await snapshot(db)} onSave={vi.fn()} onDelete={vi.fn()} />,
    );
    await user.click(screen.getByText("Filters & sort"));
    const payment = screen.getByLabelText("Payment method");
    expect(
      within(payment)
        .getAllByRole("option")
        .filter((o) => o.textContent === "Cash"),
    ).toHaveLength(1);
    await user.selectOptions(payment, "value:cash");
    expect(screen.getByText("3 entries")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Type"), "expense");
    await user.selectOptions(screen.getByLabelText("Category"), "expense-0");
    await user.selectOptions(screen.getByLabelText("Merchant"), "shop");
    await user.type(screen.getByLabelText("From"), "2026-10-01");
    await user.type(screen.getByLabelText("Through"), "2026-10-01");
    await user.type(screen.getByLabelText("Search history"), "coffee");
    expect(screen.getByText("1 entries")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.selectOptions(payment, "unspecified");
    expect(screen.getByText("1 entries")).toBeVisible();
    await user.selectOptions(payment, "value:voucher");
    expect(screen.getByText("1 entries")).toBeVisible();
    expect(
      (await snapshot(db)).transactions.sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(rows.sort((a, b) => a.id.localeCompare(b.id)));
  });
});
