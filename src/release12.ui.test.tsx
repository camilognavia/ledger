import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import App from "./App";
import { TransactionForm } from "./TransactionForm";
import { Summary } from "./Summary";
import { DataTools } from "./DataTools";
import {
  openLedger,
  snapshot,
  saveMerchant,
  savePaymentMethod,
  saveTransaction,
  type LedgerDB,
} from "./db";
import { transaction } from "./test-fixtures";
import { localParts } from "./model";
import { addDays } from "./calendar";
import { reconcile } from "./recurrence";
let db: LedgerDB;
beforeEach(async () => {
  db = await openLedger("release12-ui-" + crypto.randomUUID());
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
describe("Ledger 1.2 merchant and mandatory payment interactions", () => {
  it("records repeated one-time names without saving them, clears entry, and displays/searches History", async () => {
    const user = userEvent.setup();
    await start();
    for (let i = 0; i < 2; i++) {
      await user.type(
        screen.getByLabelText("Merchant / payee"),
        "Street stall",
      );
      await user.type(screen.getByLabelText("Amount"), "15");
      await user.selectOptions(
        screen.getByLabelText("Payment method"),
        "value:Cash",
      );
      await user.click(
        screen.getByRole("button", { name: "Save transaction" }),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Amount")).toHaveValue(""),
      );
      expect(screen.getByLabelText("Merchant / payee")).toHaveValue("");
    }
    expect(await db.count("merchants")).toBe(0);
    expect(await db.count("schedules")).toBe(0);
    expect(
      (await snapshot(db)).transactions.every(
        (t) => t.merchantName === "Street stall" && !t.merchantId,
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.type(screen.getByLabelText("Search history"), "street");
    expect(screen.getByText("2 entries")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /Street stall/ }),
    ).toHaveLength(2);
  });
  it("explicitly saves a recurring merchant from entry without requiring payment or creating a transaction/schedule", async () => {
    const user = userEvent.setup();
    await start();
    await user.type(screen.getByLabelText("Merchant / payee"), "Cafe Ciencias");
    expect(await db.count("merchants")).toBe(0);
    await user.click(
      screen.getByRole("button", { name: "Save as recurring merchant" }),
    );
    await waitFor(async () => expect(await db.count("merchants")).toBe(1));
    const merchant = (await snapshot(db)).merchants[0];
    expect(screen.getByLabelText("Recurring merchant")).toHaveValue(
      merchant.id,
    );
    expect(await db.count("transactions")).toBe(0);
    expect(await db.count("schedules")).toBe(0);
    await user.selectOptions(screen.getByLabelText("Recurring merchant"), "");
    await user.click(
      screen.getByRole("button", { name: "Save as recurring merchant" }),
    );
    expect(
      await screen.findByText(/already exists, including archived merchants/),
    ).toBeVisible();
    expect(await db.count("merchants")).toBe(1);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("button", { name: "Recurring merchants" }),
    ).toBeVisible();
  });
  it("applies a selected recurring default, permits overrides and leaves the category alone while typing one-time names", async () => {
    const user = userEvent.setup();
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe",
      normalizedName: "",
      defaultCategoryId: "expense-1",
      archived: false,
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
    await user.click(screen.getByRole("button", { name: "Shopping" }));
    await user.clear(screen.getByLabelText("Merchant / payee"));
    await user.type(screen.getByLabelText("Merchant / payee"), "Cafe");
    expect(screen.getByLabelText("Recurring merchant")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Shopping" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.selectOptions(
      screen.getByLabelText("Recurring merchant"),
      "cafe",
    );
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "School" }));
    await user.selectOptions(screen.getByLabelText("Recurring merchant"), "");
    expect(screen.getByRole("button", { name: "School" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("edits a one-time merchant without conversion or category overwrites", async () => {
    const user = userEvent.setup(),
      t = transaction({ merchantName: "One-off", categoryId: "expense-6" });
    await saveTransaction(db, t);
    render(
      <TransactionForm
        data={await snapshot(db)}
        initial={t}
        onSave={async (row, editing) => {
          await saveTransaction(db, row, editing);
          return true;
        }}
      />,
    );
    expect(screen.getByLabelText("Merchant / payee")).toHaveValue("One-off");
    expect(screen.getByRole("button", { name: "Shopping" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.clear(screen.getByLabelText("Merchant / payee"));
    await user.type(screen.getByLabelText("Merchant / payee"), "New one-off");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await db.get("transactions", t.id)).toMatchObject({
      merchantName: "New one-off",
      categoryId: "expense-6",
    });
    expect(await db.count("merchants")).toBe(0);
  });
  it.each(["Expense", "Income", "Refund"])(
    "requires explicit %s payment selection and accepts predefined, managed or custom values",
    async (name) => {
      const user = userEvent.setup();
      await savePaymentMethod(db, {
        id: "wallet",
        name: "Wallet",
        normalizedName: "",
        archived: false,
      });
      await start();
      await user.click(screen.getByRole("button", { name }));
      await user.type(screen.getByLabelText("Amount"), "12");
      await user.click(
        screen.getByRole("button", { name: "Save transaction" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Choose a payment method",
      );
      expect(await db.count("transactions")).toBe(0);
      expect(screen.getByLabelText("Amount")).toHaveValue("12");
      const payment = screen.getByLabelText("Payment method");
      expect(
        within(payment).queryByRole("option", { name: "None" }),
      ).not.toBeInTheDocument();
      expect(payment).toHaveAttribute("aria-required", "true");
      const chosen =
        name === "Expense"
          ? "value:Cash"
          : name === "Income"
            ? "value:Wallet"
            : "custom";
      await user.selectOptions(payment, chosen);
      if (name === "Refund")
        await user.type(
          screen.getByLabelText("Custom payment method (optional)"),
          "Voucher",
        );
      await user.click(
        screen.getByRole("button", { name: "Save transaction" }),
      );
      await waitFor(async () => expect(await db.count("transactions")).toBe(1));
      expect((await snapshot(db)).transactions[0].paymentMethod).toBe(
        name === "Expense" ? "Cash" : name === "Income" ? "Wallet" : "Voucher",
      );
      expect(screen.getByLabelText("Payment method")).toHaveValue("");
    },
  );
  it("requires a method to save a legacy unspecified edit while leaving the stored row intact until then", async () => {
    const user = userEvent.setup(),
      t = transaction({ paymentMethod: "", merchantName: "Historic" });
    await db.put("transactions", t);
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <TransactionForm data={await snapshot(db)} initial={t} onSave={onSave} />,
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(await db.get("transactions", t.id)).toEqual(t);
    await user.selectOptions(screen.getByLabelText("Payment method"), "custom");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: "Other",
        merchantName: "Historic",
      }),
      true,
    );
  });
  it("flags a held legacy schedule and corrects it through the existing dialog, reconciling missing dues exactly once", async () => {
    const user = userEvent.setup(),
      today = localParts().localDate;
    await db.put("schedules", {
      id: "held",
      name: "Legacy held",
      type: "expense",
      amount: 1000,
      categoryId: "expense-4",
      description: "",
      paymentMethod: "",
      frequency: "daily",
      startDate: addDays(today, -2),
      paused: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await start();
    expect(await screen.findByText(/Automatic entries are held/)).toBeVisible();
    expect(await db.count("transactions")).toBe(0);
    expect(
      (await db.get("schedules", "held"))?.processedThrough,
    ).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Recurring transactions" }),
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: /Legacy held.*Payment method required/,
      }),
    );
    expect(
      screen.getByText(/Missed dates use the original schedule terms/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("alert"),
    ).toHaveTextContent("Choose a payment method");
    await user.selectOptions(
      screen.getByLabelText("Schedule payment method"),
      "value:Cash",
    );
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await db.count("transactions")).toBe(3);
    expect(await reconcile(db, today)).toEqual([]);
    expect(
      screen.queryByText(/Automatic entries are held/),
    ).not.toBeInTheDocument();
  });
  it("requires explicit historical-import compatibility and never saves the imported merchant", async () => {
    const user = userEvent.setup();
    render(
      <DataTools
        db={db}
        data={await snapshot(db)}
        onChanged={async () => {}}
      />,
    );
    await user.upload(
      screen.getByLabelText("Import CSV or XLSX"),
      new File(
        ["Date,Amount,Merchant\n2026-10-01,12,Historic shop"],
        "old.csv",
        { type: "text/csv" },
      ),
    );
    await screen.findByText("CSV · 1 data rows");
    const compatibility = screen.getByLabelText(
      "Allow historical rows without payment methods",
    );
    expect(compatibility).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    expect(await screen.findByText("Choose a payment method.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm import of 0 transactions" }),
    ).toBeDisabled();
    await user.click(compatibility);
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    expect(
      await screen.findByText("Historical row · payment method unspecified"),
    ).toBeVisible();
    expect(await db.count("transactions")).toBe(0);
    await user.click(
      screen.getByRole("button", { name: "Confirm import of 1 transactions" }),
    );
    await screen.findByText(/1 transactions imported/);
    expect((await snapshot(db)).transactions[0]).toMatchObject({
      merchantName: "Historic shop",
      paymentMethod: "",
    });
    expect(await db.count("merchants")).toBe(0);
  });
  it("renders one-time and recurring merchants in the existing Analytical table grouped by name", async () => {
    const user = userEvent.setup(),
      day = localParts().localDate;
    await saveMerchant(db, {
      id: "cafe",
      name: "Cafe",
      normalizedName: "",
      archived: false,
    });
    await saveTransaction(
      db,
      transaction({ merchantId: "cafe", amount: 10000, localDate: day }),
    );
    await saveTransaction(
      db,
      transaction({ merchantName: "CAFE", amount: 5000, localDate: day }),
    );
    await saveTransaction(
      db,
      transaction({ merchantName: "Street stall", localDate: day }),
    );
    const data = await snapshot(db);
    render(
      <Summary
        data={{
          ...data,
          preferences: { ...data.preferences, summaryMode: "analytical" },
        }}
        onMode={vi.fn()}
      />,
    );
    const section = screen
      .getByRole("heading", { name: "Merchant spending" })
      .closest("section")!;
    expect(
      within(section).getAllByRole("rowheader", { name: "Cafe" }),
    ).toHaveLength(1);
    expect(
      within(section).getByRole("rowheader", { name: "Street stall" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Inspect merchant"),
      "name:cafe",
    );
    expect(
      within(section).queryByRole("rowheader", { name: "Street stall" }),
    ).not.toBeInTheDocument();
  });
});
