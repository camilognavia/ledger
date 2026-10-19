import { localParts, type Snapshot } from "./model";
export function backupReminderDue(data: Snapshot) {
  const p = data.preferences,
    month = localParts().localDate.slice(0, 7);
  return (
    !!p.backupReminder &&
    (!p.lastBackupAt ||
      localParts(new Date(p.lastBackupAt)).localDate.slice(0, 7) !== month) &&
    p.backupReminderDismissedMonth !== month
  );
}
