import {
  saveMerchant,
  saveTransaction,
  deleteTransaction,
  saveBudget,
  saveAppearance,
  saveSummaryMode,
  saveBackupPreference,
  type LedgerDB,
} from "./db";
import { saveSchedule, reconcile, deleteSchedule } from "./recurrence";
import { transaction } from "./test-fixtures";
import { readCSV } from "./spreadsheets";
import { previewImport, defaultMapping, commitImport } from "./imports";
export async function richDatabase(db: LedgerDB) {
  await saveMerchant(db, {
    id: "provider",
    name: "Cafe Ciencias",
    normalizedName: "",
    archived: false,
    defaultCategoryId: "expense-0",
  });
  const expense = transaction({ id: "purchase", merchantId: "provider" });
  await saveTransaction(db, expense);
  await saveTransaction(
    db,
    transaction({
      id: "refund",
      type: "refund",
      amount: 2000,
      originalExpenseId: expense.id,
      localDate: "2026-10-02",
    }),
  );
  await saveTransaction(
    db,
    transaction({
      id: "income",
      type: "income",
      categoryId: "income-0",
      amount: 100000,
    }),
  );
  const schedule = {
    id: "plan",
    name: "Plan",
    type: "expense" as const,
    amount: 2500,
    categoryId: "expense-4",
    merchantId: "provider",
    description: "Fixed",
    paymentMethod: "Debit card",
    frequency: "daily" as const,
    startDate: "2026-10-01",
    paused: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const added = await saveSchedule(db, schedule, false, "2026-10-03");
  await deleteTransaction(db, added[0].id);
  await saveSchedule(db, { ...schedule, paused: true }, true, "2026-10-03");
  await reconcile(db, "2026-10-05");
  await saveSchedule(
    db,
    { ...schedule, id: "deleted-schedule", frequency: "monthly" },
    false,
    "2026-10-01",
  );
  await deleteSchedule(db, "deleted-schedule");
  await saveBudget(db, { id: "overall", limit: 100000 });
  await saveBudget(db, {
    id: "expense-0",
    categoryId: "expense-0",
    limit: 50000,
  });
  await saveAppearance(db, "dark");
  await saveSummaryMode(db, "analytical");
  await saveBackupPreference(db, {
    backupReminder: true,
    lastBackupAt: 100000,
    backupReminderDismissedMonth: "2026-09",
  });
  const table = readCSV(
    "Date,Type,Category,Description,Amount,Transaction ID\n2026-10-04,expense,School,Imported manual,12.29,external-1",
  );
  await commitImport(db, await previewImport(db, table, defaultMapping(table)));
  await db.put("metadata", { id: "custom", value: "Preserve me" });
  await db.put("metadata", { id: "calibration", value: 1.25 });
  return { schedule, deletedId: added[0].id };
}
