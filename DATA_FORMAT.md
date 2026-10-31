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
2. Map Date, Amount and Payment method for normal imports. Other mappings: Time, Type, Category, Merchant, Description, Transaction ID, Automatic. Payment method may be omitted only through the explicit historical compatibility option. A source column cannot map to two fields.
3. Preview. No database writes occur. Every data row is marked valid, duplicate, excluded (automatic), or invalid, with a reason.
4. Fix all invalid rows/mappings and preview again. When ready, click **Confirm import of N transactions**. All new entities, financial rows and import receipts commit together; duplicates/exclusions are skipped as previewed. A quota/write failure rolls back the complete batch.

Date must be ISO date text or an actual Excel date cell. Time is HH:mm or an Excel time cell/fractional day; blank means 00:00. These are interpreted in the current device timezone. Use JSON to preserve original exact instants across zones. Invalid/nonexistent local times are rejected. Type defaults to expense; blank category uses the compatible Other fallback. Existing category names, including archives, are reused; new categories get stable UUIDs. Imported merchant names are independent transaction-level snapshots, even if a matching recurring merchant exists. The importer never creates or automatically links recurring merchants; descriptions remain independent.

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
  "databaseVersion": 5,
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
    "imports": [],
    "paymentMethods": []
  }
}
```

This shows structure only; a real valid backup requires its category fallbacks, one user preference record and initialization/schema metadata. The exporter supplies them. Do not construct a backup by copying only financial rows.

All stores are read in a single consistent IndexedDB transaction. Money remains integer centavos in JSON. Transaction IDs, entity relationships, creation/update instants, recorded local dates/times and optional refund links are retained. Schedules include their `processedThrough` cursors. Occurrences retain `generated`, `deleted`, and `skipped` state and their original identities, even after the schedule or financial row has been removed. Imports retain duplicate/provenance receipts even when the imported financial row is deleted. One-time merchant names are stored as optional `transactions[].merchantName`; existing recurring associations retain `merchantId`. Preferences include theme, last categories, summary mode, reminder selection, confirmed backup save date and monthly dismissal. Metadata values are preserved, including the last reconciliation marker and application-defined extra metadata records.

JSON omits optional properties whose stored value is `undefined`; their absence has the same application meaning. Exported-at identifies the captured snapshot. “I saved this backup” records confirmation **after** downloading, so that later confirmation cannot retroactively appear inside the already captured file.

### Validation before writes

The entire file is checked: format and schema versions, known store/record fields, required arrays/fields, duplicate IDs/names, value types, integer money/ranges, Gregorian dates and time strings, supported settings, fallback categories, all financial/category/merchant/refund relationships, budget relationships, normalized merchant uniqueness, import provenance, occurrence keys and generated-entry/receipt pairs. Deleted/skipped occurrences cannot have live entries. Active schedule cursors cannot precede retained receipts. Deleted schedules may legitimately leave orphan provenance IDs; deleted imports may leave receipts without live financial rows.

Backup local times are validated as wall-clock strings without reinterpreting them in the destination timezone. This preserves records created in another timezone, including daylight-saving cases. Unknown future versions/stores/fields are rejected to avoid silently dropping data. Supported schema-1/2/3/4 shapes normalize into schema 5 without changing existing IDs or financial text. If payment metadata is absent from an older backup, the five defaults and distinct legacy transaction/schedule labels supply choices. Schemas 4 and 5 require their paymentMethods array; malformed, unknown-field, nonboolean, duplicate-ID/name or incorrectly normalized records are rejected before writes.

Validation detects structural/referential corruption; it does not authenticate the author or detect every intentional, internally consistent financial edit. JSON is unencrypted and has no signature. Keep backups in a location you control.

### Replace

After validation and preview, check the acknowledgement and click **Confirm replace restore**. All ten stores are cleared and repopulated in **one IndexedDB transaction**, including preferences and metadata. Clearing and writes roll back together on failure. Concurrent/stale changes invalidate the preview before any clearing.

Replacement returns to the snapshot, including its saved/deleted/skipped history. Changes made **after** the snapshot are intentionally undone; an older backup can therefore restore a transaction deleted later. Save a fresh backup of the current device before replacing it.

### Merge

Merge unions compatible IDs without remapping. Identical records are retained once. Existing preferences and metadata stay current; new compatible payment methods, categories, merchants, transactions, schedules, receipts, budgets and import provenance are added.

Any differing same-ID record, including a newer schedule cursor or a generated/deleted occurrence disagreement, blocks the **entire** merge. Duplicate normalized entities with different IDs also fail validation. There is no last-write-wins conflict resolution. A local recurring deletion cannot be silently overwritten by a generated entry from an older backup. Resolve the source discrepancy, restore to a separate device/profile, or deliberately choose Replace after saving current data.

### After restore

The current screen refreshes and old session notifications are cleared. Reopen/resume Ledger to reconcile from the restored cursors. Missing new dues appear automatically; deleted/skipped receipts prevent their occurrences from returning. No rollback to older application code or database deletion is needed.

### Bounds and real-device limits

CSV/XLSX: 10 MiB, 50,000 data rows, 80 columns. JSON: 50 MiB and 1,000,000 total records, with matching download/restore bounds; no partial backup is emitted over the limit. Workbook parsing and full snapshots use memory and maximum-size performance is unprofiled. Sparse-formatting-heavy, encrypted, malformed or unsupported workbooks may be rejected.

Browser downloads/file pickers, storage quota, eviction, and actual atomic crash durability need real-device acceptance. Ledger's tests verify transaction rollback with simulated storage failures; they do not certify a particular iOS filesystem. Keep the same app origin/path during updates and close other Ledger windows before restoring.

## Payment methods (1.1 model, 1.2 requirements)

`paymentMethods` records contain `{id, name, normalizedName, archived}`. Names are 1–80 characters; normalized names use the existing NFKC, trimmed/collapsed whitespace, lowercase rule and remain unique across active/archived choices. IDs stay stable during management. Old legacy labels are collected into choices during the schema-4 upgrade without changing any financial row. All ten stores, including these choices, participate in backup capture, restore/merge validation, stale-preview checks and atomic writes.

Transactions and recurring schedules retain `paymentMethod: string`, including the empty string for historical unspecified records. New/edited transactions and schedules require a nonblank method; restoring validated historical snapshots intentionally preserves missing values. No arbitrary method is assigned. No new financial foreign key or occurrence identity is introduced. Renames affect future choices; recorded historical labels and existing schedule terms remain as saved. Schedule editing explicitly changes future terms under the established reconciliation rules. History filters the recorded label, normalizing only for matching/options; it never rewrites records. Old and renamed labels may therefore appear separately in filters when both occur. Referenced archived labels remain available. Other is always the custom-entry action, even if the similarly named managed choice is renamed/archived.

CSV/XLSX columns, numeric amounts and duplicate fingerprints are unchanged. Payment cells contain the recorded string, not a registry ID or renamed substitute. Imports retain those strings (under the existing import whitespace rules), append manual rows and never create/change recurrence identities. Imported/custom labels remain filterable; add a reusable dropdown choice in Settings if desired. JSON is required to move the managed choice list itself. Existing complete backups from v1.0/1.1 restore with payment strings intact. Older applications cannot read schema-5 backups.

## Ledger 1.2 merchant model and payment compatibility

- Schema **5** keeps the ten existing stores and indexes. Its versionchange updates the schema marker only; no existing transaction, entity, schedule, receipt, cursor or preference is rewritten. Schema 4's payment metadata migration remains intact for older upgrades.
- A transaction may have **either** a `merchantId` referring to the existing recurring merchant collection, **or** an optional nonempty `merchantName` (1–80 characters, no null character) for a one-time label, or neither. Both fields together are rejected to avoid ambiguous identity. The entire field is validated before restore writes. Existing merchant IDs/names/default categories/archives remain unchanged; renaming a recurring merchant continues to resolve through its stable ID. One-time labels do not change when a saved merchant is renamed.
- Typing a recurring merchant's name still creates a one-time label unless the user explicitly selects/saves the recurring entity. Same-name History search/filtering and merchant analytics use normalized names (existing NFKC/case/whitespace rule). This is a report grouping, not a storage merge: financial IDs, associations and individual names remain intact. A renamed saved merchant and an older one-time label can appear separately afterward.
- Spreadsheet Merchant columns contain the resolved saved name or one-time name. Imports append one-time labels and never add/associate recurring merchants. Existing normalized content fingerprints and source/import receipts continue to detect duplicates across either representation. Automatic/occurrence identity import guards are unchanged.
- Imports normally reject missing/unmapped/blank Payment method with **Choose a payment method.** Duplicates already known to Ledger remain harmless duplicates. To recover a historical CSV/XLSX file, explicitly check **Allow historical rows without payment methods**, preview again and confirm. The preview marks valid unspecified rows as historical; commit rechecks the compatibility flag. Choosing a new file resets this option. Compatibility never guesses a method. This exception is only for explicit historical transfer, not ordinary entry or schedule generation.
- JSON restore always preserves historical unspecified values after full structural/referential validation. This complete-recovery path does not enforce new-entry business requirements retroactively. Editing those transactions later requires a payment method.

### Legacy schedule hold and correction

A schedule whose payment string is blank/whitespace is flagged. Launch/resume reconciliation holds it without advancing `processedThrough` or changing receipts/transactions; it does not block healthy schedules. Existing methodless generated rows are retained. No default payment is fabricated and no skipped/tombstone/cursor identity is reset.

When the user corrects its method, reconciliation first settles the original schedule through today under its **old type/amount/category/merchant/frequency/anchor/end/pause terms**, using only the selected corrected payment string. Existing receipts and the unique occurrence index prevent duplicate or deleted/skipped resurrection. The corrected cursor and catch-up writes share the existing atomic transaction. Any simultaneous edits to schedule terms then apply prospectively, as before. Two-window corrections serialize under the same IndexedDB lock. Originally paused periods are skipped, including a correction/resume day, following the existing policy. Large backlogs remain possible from old start/cursor dates; no background processing or forecast is introduced.
