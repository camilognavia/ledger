# Ledger file formats and integrity rules

## Choose the right transfer

| Format | Intended use | Complete application state? |
| --- | --- | --- |
| CSV | Flat manual-record transfer and analysis | No |
| XLSX | Flat transactions plus numeric financial summaries | No |
| Ledger JSON | Full device backup/move, preserving all identities and histories | **Yes** |

Spreadsheet exports include automatic transactions for inspection. Import preview explicitly excludes those rows. Use JSON when moving automatic history, schedules or refund links. Importing ordinary spreadsheet rows never writes schedule/occurrence identities or modifies existing financial rows.

## CSV / Excel export

One header row, one transaction per following row, explicit Date and Time columns. No day-group rows or merged cells. Amount is a **positive MXN value**; Type determines expense/income/refund semantics.

Columns: Date (`YYYY-MM-DD`), Time (`HH:mm`), Type, Category, Merchant, Description, Amount, Payment method, Automatic (`Manual`/`Automatic`), Transaction ID, Recurring schedule ID, Occurrence key, Original expense ID. The last identity columns are reference/provenance information; they are not a substitute for JSON.

CSV uses UTF-8 BOM, CRLF, standard quoted/escaped fields. Text that begins with a formula-like prefix (including leading whitespace) is prefixed with an apostrophe to prevent spreadsheet evaluation. `Text escaping=prefix-apostrophe-v1` identifies this transformation, letting Ledger undo it on its own exports without changing external CSV literals. Amounts remain decimal text in CSV.

Excel uses genuine numeric cells for amounts and totals; descriptions and identifiers are literal strings, not formulas. Transactions has frozen headers and filtering. Summary includes ordinary income, gross expense, refunds, net spending, net cash flow, category totals and monthly totals for the exported selection. Numbers are precomputed; no recalculation or external link is required.

## Mapped import

1. Choose a `.csv` or `.xlsx` file. CSV must be UTF-8 with unique, nonempty headers. XLSX reads the Transactions worksheet if present, otherwise the first worksheet.
2. Map Date and Amount. Optional mappings: Time, Type, Category, Merchant, Description, Payment method, Transaction ID, Automatic. A source column cannot map to two fields.
3. Preview. No database writes occur. Every data row is marked valid, duplicate, excluded (automatic), or invalid, with a reason.
4. Fix all invalid rows/mappings and preview again. When ready, click **Confirm import of N transactions**. All new entities, financial rows and import receipts commit together; duplicates/exclusions are skipped as previewed. A quota/write failure rolls back the complete batch.

Date must be ISO date text or an actual Excel date cell. Time is HH:mm or an Excel time cell/fractional day; blank means 00:00. These are interpreted in the current device timezone. Use JSON to preserve original exact instants across zones. Invalid/nonexistent local times are rejected. Type defaults to expense; blank category uses the compatible Other fallback. Existing category/merchant names, including archived entities, are reused. New names get stable UUIDs; descriptions remain independent of merchants.

Amounts must be positive with centavo precision. Use Type, not a negative sign, to distinguish expenditure/refund/income. Convert bank-specific negative/ambiguous formats before import. Formula/hyperlink/rich-text/error cells are rejected; paste plain values in your spreadsheet first. Unformatted raw numeric Excel date serials are not guessed; format those cells as dates or provide ISO text.

Duplicate rules are conservative and explicit: source IDs, current transaction IDs, automatic occurrence transaction IDs, prior import source/transaction IDs, and normalized content fingerprints are checked. Content includes type, local date/time to the minute, centavos, category/merchant names, description and payment method. Current automatic entries participate in content deduplication. Import receipts survive deletion and JSON round-trips, preventing repeat import of removed records. A genuinely identical purchase can always be entered manually.

Ledger's Automatic, Occurrence key and Recurring schedule ID columns are checked even when Automatic is unmapped. Automatic records are excluded and displayed in the preview; they cannot be converted to automation by mapping. External rows without those identities are manual records. Original expense links are reference-only in spreadsheets and are not restored from them; edit a manual refund afterward to link it, or use JSON.

A stale preview is rejected if **any store** has changed since review. Preview again rather than applying a stale decision. There is no overwrite/upsert mode, duplicate override, hidden partial import, schedule creation, or automatic occurrence generation in the importer.

## Complete versioned JSON

Root shape:

```json
{
  "format": "ledger-backup",
  "formatVersion": 1,
  "databaseVersion": 3,
  "exportedAt": "2026-10-19T06:00:00.000Z",
  "data": {
    "transactions": [],
    "categories": [],
    "merchants": [],
    "preferences": [],
    "metadata": [],
    "schedules": [],
    "occurrences": [],
    "budgets": [],
    "imports": []
  }
}
```

This shows structure only; a real valid backup requires its category fallbacks, one user preference record and initialization/schema metadata. The exporter supplies them. Do not construct a backup by copying only financial rows.

All stores are read in a single consistent IndexedDB transaction. Money remains integer centavos in JSON. Transaction IDs, entity relationships, creation/update instants, recorded local dates/times and optional refund links are retained. Schedules include their `processedThrough` cursors. Occurrences retain `generated`, `deleted`, and `skipped` state and their original identities, even after the schedule or financial row has been removed. Imports retain duplicate/provenance receipts even when the imported financial row is deleted. Preferences include theme, last categories, summary mode, reminder selection, confirmed backup save date and monthly dismissal. Metadata values are preserved, including the last reconciliation marker and application-defined extra metadata records.

JSON omits optional properties whose stored value is `undefined`; their absence has the same application meaning. Exported-at identifies the captured snapshot. “I saved this backup” records confirmation **after** downloading, so that later confirmation cannot retroactively appear inside the already captured file.

### Validation before writes

The entire file is checked: format and schema versions, known store/record fields, required arrays/fields, duplicate IDs/names, value types, integer money/ranges, Gregorian dates and time strings, supported settings, fallback categories, all financial/category/merchant/refund relationships, budget relationships, normalized merchant uniqueness, import provenance, occurrence keys and generated-entry/receipt pairs. Deleted/skipped occurrences cannot have live entries. Active schedule cursors cannot precede retained receipts. Deleted schedules may legitimately leave orphan provenance IDs; deleted imports may leave receipts without live financial rows.

Backup local times are validated as wall-clock strings without reinterpreting them in the destination timezone. This preserves records created in another timezone, including daylight-saving cases. Unknown future versions/stores/fields are rejected to avoid silently dropping data. Supported old schema-1/2 shapes are normalized into schema 3 without changing IDs; this format did not exist in the original checkpoints, but the compatibility path is tested.

Validation detects structural/referential corruption; it does not authenticate the author or detect every intentional, internally consistent financial edit. JSON is unencrypted and has no signature. Keep backups in a location you control.

### Replace

After validation and preview, check the acknowledgement and click **Confirm replace restore**. All nine stores are cleared and repopulated in **one IndexedDB transaction**, including preferences and metadata. Clearing and writes roll back together on failure. Concurrent/stale changes invalidate the preview before any clearing.

Replacement returns to the snapshot, including its saved/deleted/skipped history. Changes made **after** the snapshot are intentionally undone; an older backup can therefore restore a transaction deleted later. Save a fresh backup of the current device before replacing it.

### Merge

Merge unions compatible IDs without remapping. Identical records are retained once. Existing preferences and metadata stay current; new compatible categories, merchants, transactions, schedules, receipts, budgets and import provenance are added.

Any differing same-ID record, including a newer schedule cursor or a generated/deleted occurrence disagreement, blocks the **entire** merge. Duplicate normalized entities with different IDs also fail validation. There is no last-write-wins conflict resolution. A local recurring deletion cannot be silently overwritten by a generated entry from an older backup. Resolve the source discrepancy, restore to a separate device/profile, or deliberately choose Replace after saving current data.

### After restore

The current screen refreshes and old session notifications are cleared. Reopen/resume Ledger to reconcile from the restored cursors. Missing new dues appear automatically; deleted/skipped receipts prevent their occurrences from returning. No rollback to older application code or database deletion is needed.

### Bounds and real-device limits

CSV/XLSX: 10 MiB, 50,000 data rows, 80 columns. JSON: 50 MiB and 1,000,000 total records, with matching download/restore bounds; no partial backup is emitted over the limit. Workbook parsing and full snapshots use memory and maximum-size performance is unprofiled. Sparse-formatting-heavy, encrypted, malformed or unsupported workbooks may be rejected.

Browser downloads/file pickers, storage quota, eviction, and actual atomic crash durability need real-device acceptance. Ledger's tests verify transaction rollback with simulated storage failures; they do not certify a particular iOS filesystem. Keep the same app origin/path during updates and close other Ledger windows before restoring.
