import { useRef, useState } from "react";
import type { LedgerDB } from "./db";
import { saveBackupPreference } from "./db";
import {
  captureBackup,
  serializeBackup,
  prepareRestore,
  restoreBackup,
  validateBackup,
  ALL_STORES,
  type Backup,
  type RestorePlan,
} from "./backup";
import {
  previewImport,
  commitImport,
  defaultMapping,
  importFields,
  mappingLabels,
  type Mapping,
  type ImportPlan,
} from "./imports";
import {
  readCSV,
  readXLSX,
  exportCSV,
  exportXLSX,
  type RawTable,
} from "./spreadsheets";
import { localParts, money, type Snapshot } from "./model";
import { dateNumber } from "./calendar";
import { download, readFile } from "./download";
export function DataTools({
  db,
  data,
  onChanged,
}: {
  db: LedgerDB;
  data: Snapshot;
  onChanged: (restored?: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const [range, setRange] = useState(false),
    [from, setFrom] = useState(localParts().localDate.slice(0, 7) + "-01"),
    [to, setTo] = useState(localParts().localDate);
  const [allowMissingPaymentMethods, setAllowMissingPaymentMethods] =
    useState(false);
  const [table, setTable] = useState<RawTable>(),
    [mapping, setMapping] = useState<Mapping>(),
    [plan, setPlan] = useState<ImportPlan>(),
    [previewLimit, setPreviewLimit] = useState(50);
  const [backup, setBackup] = useState<Backup>(),
    [restoreMode, setRestoreMode] = useState<"replace" | "merge">("replace"),
    [restorePlan, setRestorePlan] = useState<RestorePlan>(),
    [confirmed, setConfirmed] = useState(false),
    [downloaded, setDownloaded] = useState(false);
  async function work(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message || "The operation failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const latestSnapshot = async () => {
    const b = await captureBackup(db);
    return { ...data, ...b.data, preferences: b.data.preferences[0] };
  };
  const validCount = plan?.rows.filter((r) => r.status === "valid").length || 0,
    invalidCount = plan?.rows.filter((r) => r.status === "invalid").length || 0;
  return (
    <>
      <p className="hint">
        Files are processed locally. Spreadsheet imports append manual records;
        JSON backup is the complete transfer format, including all recurring
        receipts and deletions.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
      {busy && (
        <p role="status" className="hint">
          Working with your file…
        </p>
      )}
      <section className="settings-section">
        <h2>Export transactions</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={range}
            onChange={(e) => setRange(e.target.checked)}
          />
          Use a date range
        </label>
        {range && (
          <div className="two-col">
            <label>
              Export from
              <input
                type="date"
                value={from}
                required
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Export through
              <input
                type="date"
                value={to}
                required
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="two-col">
          <button
            className="secondary wide"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                if (range) {
                  dateNumber(from);
                  dateNumber(to);
                  if (from > to)
                    throw new Error("Choose a valid export range.");
                }
                download(
                  exportCSV(
                    await latestSnapshot(),
                    range ? from : undefined,
                    range ? to : undefined,
                  ),
                  "Ledger-transactions.csv",
                  "text/csv;charset=utf-8",
                );
                setMessage("CSV download opened.");
              })
            }
          >
            Export CSV
          </button>
          <button
            className="secondary wide"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                if (range) {
                  dateNumber(from);
                  dateNumber(to);
                  if (from > to)
                    throw new Error("Choose a valid export range.");
                }
                download(
                  await exportXLSX(
                    await latestSnapshot(),
                    range ? from : undefined,
                    range ? to : undefined,
                  ),
                  "Ledger-transactions.xlsx",
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
                setMessage(
                  "Excel download opened. Transactions and Summary worksheets are included.",
                );
              })
            }
          >
            Export Excel
          </button>
        </div>
        <p className="hint">
          Flat rows; amounts in MXN. CSV text that could be interpreted as a
          formula is escaped. Excel amounts are genuine numbers. Spreadsheet
          files do not replace a complete JSON backup.
        </p>
      </section>
      <section className="settings-section">
        <h2>Import CSV / Excel</h2>
        <label>
          Import CSV or XLSX
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void work(async () => {
                  setAllowMissingPaymentMethods(false);
                  setTable(undefined);
                  setPlan(undefined);
                  if (file.size > 10 * 1024 * 1024)
                    throw new Error("Import files must be at most 10 MiB.");
                  const extension = file.name.split(".").pop()?.toLowerCase();
                  if (extension !== "csv" && extension !== "xlsx")
                    throw new Error("Choose a .csv or .xlsx file.");
                  const raw =
                    extension === "csv"
                      ? readCSV((await readFile(file, true)) as string)
                      : await readXLSX(
                          (await readFile(file, false)) as ArrayBuffer,
                        );
                  setTable(raw);
                  setMapping(defaultMapping(raw));
                  setPreviewLimit(50);
                  setMessage(
                    "Map your columns, then preview. No data has been changed.",
                  );
                });
            }}
          />
        </label>
        <p className="hint">
          Maximum 50,000 rows and 80 columns. XLSX uses Transactions if present,
          otherwise the first worksheet. Date is required (YYYY-MM-DD or an
          Excel date cell); Amount is required and positive. Blank Type means
          expense; blank category uses Other; blank Time means 00:00. Unknown
          categories are added; merchant names remain one-time. Formula,
          hyperlink and rich-text cells must be converted to plain values first.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            disabled={busy}
            checked={allowMissingPaymentMethods}
            onChange={(e) => {
              setAllowMissingPaymentMethods(e.target.checked);
              setPlan(undefined);
            }}
          />
          Allow historical rows without payment methods
        </label>
        <p className="hint">
          New imports require a payment method. Use historical compatibility
          only to recover old records with unspecified methods; no method is
          assigned.
        </p>
        {table && mapping && (
          <>
            <p className="hint">
              {table.name} · {table.rows.length} data rows
            </p>
            <div className="mapping-grid">
              {importFields.map((field) => (
                <label key={field}>
                  Map {mappingLabels[field]}
                  {["date", "amount"].includes(field) ? " *" : ""}
                  <select
                    value={mapping[field]}
                    onChange={(e) => {
                      setMapping({
                        ...mapping,
                        [field]: Number(e.target.value),
                      });
                      setPlan(undefined);
                    }}
                    disabled={busy}
                  >
                    <option value={-1}>Not mapped</option>
                    {table.headers.map((h, i) => (
                      <option value={i} key={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              className="secondary wide"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  setPlan(
                    await previewImport(db, table, mapping, {
                      allowMissingPaymentMethods,
                    }),
                  );
                  setMessage("Preview only. Nothing has been imported.");
                })
              }
            >
              Preview import
            </button>
          </>
        )}
        {plan && (
          <div aria-label="Import preview">
            <p className="hint">
              {validCount} new ·{" "}
              {plan.rows.filter((r) => r.status === "duplicate").length}{" "}
              duplicates ·{" "}
              {plan.rows.filter((r) => r.status === "excluded").length}{" "}
              automatic rows excluded · {invalidCount} invalid.{" "}
              {plan.categories.length} categories and {plan.merchants.length}{" "}
              merchants will be added.
            </p>
            <div
              className="table-scroll"
              tabIndex={0}
              aria-label="Import preview table"
            >
              <table>
                <caption>Import preview — amounts in MXN</caption>
                <thead>
                  <tr>
                    <th scope="col">Data row</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date / amount</th>
                    <th scope="col">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, previewLimit).map((r) => (
                    <tr key={r.row}>
                      <th scope="row">{r.row}</th>
                      <td>{r.status}</td>
                      <td>
                        {r.transaction
                          ? `${r.transaction.localDate} · ${money(r.transaction.amount)}`
                          : "—"}
                      </td>
                      <td className="preview-message">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.rows.length > previewLimit && (
              <button
                className="text-button"
                onClick={() => setPreviewLimit((n) => n + 100)}
              >
                Show more preview rows
              </button>
            )}
            <p className="hint">
              Duplicate IDs/content, including deleted previous imports, are
              skipped. Automatic rows are excluded; use JSON to move schedules
              and generated history. Refund links and recurring metadata are
              never imported from spreadsheets. Fix all invalid rows or mapping
              errors before committing.
            </p>
            <button
              className="primary wide"
              disabled={busy || !validCount || !!invalidCount}
              onClick={() =>
                void work(async () => {
                  const count = await commitImport(db, plan);
                  setPlan(undefined);
                  setAllowMissingPaymentMethods(false);
                  setTable(undefined);
                  await onChanged();
                  setMessage(
                    `${count} transactions imported. Other rows were skipped as previewed.`,
                  );
                })
              }
            >
              Confirm import of {validCount} transactions
            </button>
          </div>
        )}
      </section>
      <section className="settings-section">
        <h2>Complete JSON backup</h2>
        <p className="hint">
          Includes every store: transactions, categories, merchants, schedules,
          generated/deleted/skipped occurrence receipts, reconciliation cursors,
          budgets, import receipts, preferences, and metadata. Backups are
          unencrypted; save them somewhere you control.
        </p>
        <button
          className="secondary wide"
          disabled={busy}
          onClick={() =>
            void work(async () => {
              const snapshot = await captureBackup(db);
              download(
                serializeBackup(snapshot),
                `Ledger-backup-${localParts().localDate}.json`,
                "application/json",
              );
              setDownloaded(true);
              setMessage(
                "JSON download opened. Confirm below only after saving the file.",
              );
            })
          }
        >
          Download JSON backup
        </button>
        {downloaded && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await saveBackupPreference(db, { lastBackupAt: Date.now() });
                await onChanged();
                setDownloaded(false);
                setMessage("Backup saved date recorded.");
              })
            }
          >
            I saved this backup
          </button>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!data.preferences.backupReminder}
            disabled={busy}
            onChange={(e) => {
              const enabled = e.target.checked;
              void work(async () => {
                await saveBackupPreference(db, { backupReminder: enabled });
                await onChanged();
              });
            }}
          />
          Monthly in-app backup reminder
        </label>
        <p className="hint">
          Optional; appears when Ledger is open. Dismissing lasts through this
          calendar month.{" "}
          {data.preferences.lastBackupAt
            ? `Last confirmed save: ${new Date(data.preferences.lastBackupAt).toLocaleDateString("en-MX")}.`
            : "No confirmed backup save yet."}
        </p>
      </section>
      <section className="settings-section">
        <h2>Restore JSON backup</h2>
        <label>
          Restore JSON backup
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void work(async () => {
                  setBackup(undefined);
                  setRestorePlan(undefined);
                  setConfirmed(false);
                  if (file.size > 50 * 1024 * 1024)
                    throw new Error("Backups must be at most 50 MiB.");
                  const parsed = validateBackup(
                    JSON.parse((await readFile(file, true)) as string),
                  );
                  setBackup(parsed);
                  setMessage(
                    "The entire backup passed validation. Choose restore behavior and preview. No data has changed.",
                  );
                });
            }}
          />
        </label>
        {backup && (
          <>
            <p className="hint">
              Snapshot {backup.exportedAt} · {backup.data.transactions.length}{" "}
              transactions · {backup.data.occurrences.length} occurrence
              receipts
            </p>
            <label>
              Restore behavior
              <select
                value={restoreMode}
                disabled={busy}
                onChange={(e) => {
                  setRestoreMode(e.target.value as "replace" | "merge");
                  setRestorePlan(undefined);
                  setConfirmed(false);
                }}
              >
                <option value="replace">
                  Replace — return all data to this snapshot
                </option>
                <option value="merge">
                  Merge — add compatible records, reject conflicts
                </option>
              </select>
            </label>
            <p className="hint">
              Replace removes the current contents of all stores and restores
              the validated snapshot in one transaction. Changes/deletions made
              after that snapshot will be undone. Merge keeps current
              preferences/metadata and adds records; conflicting IDs, entities,
              schedule cursors, or occurrence states block the entire merge.
              Save a fresh backup of this device first.
            </p>
            <button
              className="secondary wide"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  setRestorePlan(await prepareRestore(db, backup, restoreMode));
                  setConfirmed(false);
                  setMessage(
                    "Restore preview ready. Review and explicitly confirm to write.",
                  );
                })
              }
            >
              Preview restore
            </button>
          </>
        )}
        {restorePlan && (
          <div aria-label="Restore preview">
            <dl className="detail-list">
              {ALL_STORES.map((store) => (
                <div key={store}>
                  <dt>{store}</dt>
                  <dd>
                    {restorePlan.candidate.data[store].length} records after{" "}
                    {restorePlan.mode}
                  </dd>
                </div>
              ))}
            </dl>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed this {restorePlan.mode} operation and saved any current
              data I need.
            </label>
            <button
              className="primary wide"
              disabled={busy || !confirmed}
              onClick={() =>
                void work(async () => {
                  await restoreBackup(db, restorePlan);
                  setRestorePlan(undefined);
                  setBackup(undefined);
                  setConfirmed(false);
                  await onChanged(true);
                  setMessage(
                    "Restore completed atomically. Reopen Ledger to reconcile schedules from the restored cursors.",
                  );
                })
              }
            >
              Confirm {restorePlan.mode} restore
            </button>
          </div>
        )}
      </section>
    </>
  );
}
