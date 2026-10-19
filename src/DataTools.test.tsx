import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import App from "./App";
import { DataTools } from "./DataTools";
import {
  openLedger,
  snapshot,
  saveTransaction,
  saveBackupPreference,
  type LedgerDB,
} from "./db";
import { captureBackup } from "./backup";
import { transaction } from "./test-fixtures";
import { backupReminderDue } from "./reminders";
import { localParts, type Snapshot } from "./model";
import { download } from "./download";
vi.mock("./download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./download")>()),
  download: vi.fn(),
}));
let db: LedgerDB;
beforeEach(async () => {
  db = await openLedger("tools-ui-" + crypto.randomUUID());
  vi.mocked(download).mockClear();
});
afterEach(async () => {
  db.close();
  await deleteDB(db.name);
});
async function renderTools() {
  const data = await snapshot(db);
  return render(<DataTools db={db} data={data} onChanged={async () => {}} />);
}
const uploadCSV = () =>
  new File(
    [
      "Date,Type,Category,Merchant,Description,Amount\n2026-10-01,expense,Groceries,Store,Food,12.29",
    ],
    "purchase.csv",
    { type: "text/csv" },
  );
describe("data tools and accessibility flows", () => {
  it("requires explicit preview/confirmation for a mapped CSV upload and records it once", async () => {
    const user = userEvent.setup();
    await renderTools();
    await user.upload(screen.getByLabelText("Import CSV or XLSX"), uploadCSV());
    expect(await screen.findByText("CSV · 1 data rows")).toBeVisible();
    expect(await db.count("transactions")).toBe(0);
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    expect(
      await screen.findByRole("button", {
        name: "Confirm import of 1 transactions",
      }),
    ).toBeEnabled();
    expect(await db.count("transactions")).toBe(0);
    await user.click(
      screen.getByRole("button", { name: "Confirm import of 1 transactions" }),
    );
    expect(await screen.findByText(/1 transactions imported/)).toBeVisible();
    expect(await db.count("transactions")).toBe(1);
    await user.upload(screen.getByLabelText("Import CSV or XLSX"), uploadCSV());
    await screen.findByText("CSV · 1 data rows");
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    expect(
      await screen.findByRole("button", {
        name: "Confirm import of 0 transactions",
      }),
    ).toBeDisabled();
    expect(screen.getByText(/0 new · 1 duplicates/)).toBeVisible();
  });
  it("shows malformed file/row validation and never writes an invalid import", async () => {
    const user = userEvent.setup();
    await renderTools();
    await user.upload(
      screen.getByLabelText("Import CSV or XLSX"),
      new File(["Date,Amount\n2026-02-30,12.29"], "bad.csv", {
        type: "text/csv",
      }),
    );
    await screen.findByText("CSV · 1 data rows");
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    expect(await screen.findByText("invalid", { exact: true })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm import of 0 transactions" }),
    ).toBeDisabled();
    expect(await db.count("transactions")).toBe(0);
    await user.upload(
      screen.getByLabelText("Restore JSON backup"),
      new File(["{broken"], "bad.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(await db.count("transactions")).toBe(0);
  });
  it("validates a JSON upload, previews replacement, and requires a checked acknowledgement before atomic commit", async () => {
    const user = userEvent.setup();
    await saveTransaction(db, transaction({ id: "snapshot-entry" }));
    const backup = await captureBackup(db);
    await saveTransaction(
      db,
      transaction({ id: "later-entry", description: "Later" }),
    );
    await renderTools();
    await user.upload(
      screen.getByLabelText("Restore JSON backup"),
      new File([JSON.stringify(backup)], "Ledger.json", {
        type: "application/json",
      }),
    );
    const preview = await screen.findByRole("button", {
      name: "Preview restore",
    });
    expect(await db.count("transactions")).toBe(2);
    await user.click(preview);
    const confirm = await screen.findByRole("button", {
      name: "Confirm replace restore",
    });
    expect(confirm).toBeDisabled();
    expect(await db.count("transactions")).toBe(2);
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed this replace operation/,
      }),
    );
    await user.click(confirm);
    expect(
      await screen.findByText(/Restore completed atomically/),
    ).toBeVisible();
    expect(await db.count("transactions")).toBe(1);
    expect(await db.get("transactions", "snapshot-entry")).toBeDefined();
    expect(await db.get("transactions", "later-entry")).toBeUndefined();
  });
  it("surfaces merge conflicts without an enabled commit or any financial change", async () => {
    const user = userEvent.setup();
    const t = transaction({ id: "conflict" });
    await saveTransaction(db, t);
    const backup = await captureBackup(db);
    await saveTransaction(db, { ...t, amount: 1 }, true);
    await renderTools();
    await user.upload(
      screen.getByLabelText("Restore JSON backup"),
      new File([JSON.stringify(backup)], "Ledger.json", {
        type: "application/json",
      }),
    );
    await screen.findByRole("button", { name: "Preview restore" });
    await user.selectOptions(
      screen.getByLabelText("Restore behavior"),
      "merge",
    );
    await user.click(screen.getByRole("button", { name: "Preview restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Merge conflict",
    );
    expect(
      screen.queryByRole("button", { name: "Confirm merge restore" }),
    ).not.toBeInTheDocument();
    expect((await db.get("transactions", "conflict"))?.amount).toBe(1);
  });
  it("downloads full JSON only on request and records saved status only after explicit acknowledgement", async () => {
    const user = userEvent.setup();
    await renderTools();
    await user.click(
      screen.getByRole("button", { name: "Download JSON backup" }),
    );
    const ack = await screen.findByRole("button", {
      name: "I saved this backup",
    });
    expect(download).toHaveBeenCalledTimes(1);
    const [text, name] = vi.mocked(download).mock.calls[0];
    expect(name).toMatch(/^Ledger-backup-.*\.json$/);
    expect(JSON.parse(text as string).data.imports).toEqual([]);
    expect((await snapshot(db)).preferences.lastBackupAt).toBeUndefined();
    await user.click(ack);
    await waitFor(async () =>
      expect((await snapshot(db)).preferences.lastBackupAt).toBeTypeOf(
        "number",
      ),
    );
  });
  it("opens the lazy Settings data tools, persists reminder selection, and exposes an unobtrusive dismissal", async () => {
    const user = userEvent.setup();
    render(<App database={db} />);
    await screen.findByRole("heading", { name: "Add transaction" });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Data & backups" }));
    await screen.findByRole("heading", { name: "Complete JSON backup" });
    await user.click(
      screen.getByRole("checkbox", { name: "Monthly in-app backup reminder" }),
    );
    expect(
      await screen.findByRole("complementary", {
        name: "Monthly backup reminder",
      }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Dismiss this month" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", {
          name: "Monthly backup reminder",
        }),
      ).not.toBeInTheDocument(),
    );
    expect((await snapshot(db)).preferences.backupReminderDismissedMonth).toBe(
      localParts().localDate.slice(0, 7),
    );
  });
  it("labels native dialogs and exposes skip navigation and keyboard-accessible data controls", async () => {
    const user = userEvent.setup();
    render(<App database={db} />);
    await screen.findByRole("heading", { name: "Add transaction" });
    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Categories" }));
    await user.click(screen.getByRole("button", { name: "Add category" }));
    const dialog = screen.getByRole("dialog", { name: "New category" });
    expect(within(dialog).getByLabelText("Name")).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
describe("monthly reminder persistence", () => {
  it("defaults off, recognizes same-month confirmed saves/dismissals, and becomes due next calendar month", async () => {
    let data: Snapshot = await snapshot(db);
    expect(backupReminderDue(data)).toBe(false);
    await saveBackupPreference(db, { backupReminder: true });
    data = await snapshot(db);
    expect(backupReminderDue(data)).toBe(true);
    const now = Date.now();
    await saveBackupPreference(db, { lastBackupAt: now });
    expect(backupReminderDue(await snapshot(db))).toBe(false);
    await saveBackupPreference(db, {
      lastBackupAt: 1,
      backupReminderDismissedMonth: localParts().localDate.slice(0, 7),
    });
    expect(backupReminderDue(await snapshot(db))).toBe(false);
    await saveBackupPreference(db, { backupReminderDismissedMonth: "1900-01" });
    expect(backupReminderDue(await snapshot(db))).toBe(true);
  });
});
