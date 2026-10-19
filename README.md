# Ledger — Checkpoint 3

**Version 1.0.0 · IndexedDB schema 3.** An installable, offline-first personal finance PWA for iPhone, Windows and Linux browsers. Built directly on the delivered Checkpoint 2 source. MXN, local data, no account/backend/subscription or remote application assets.

All three implementation checkpoints are included: manual tracking and management; automatic recurrence, budgets and analysis; CSV/Excel transfer and complete versioned JSON backup/restore. Real iPhone/Safari and runtime offline acceptance remain unverified; see TEST_REPORT.md.

## Windows / Linux development and production

Install Node **22.12+ (22 LTS)** or **24+**, with npm. Extract the ZIP and open a terminal inside `ledger`, where `package.json` is located. PowerShell, Command Prompt, and Linux use the same commands:

```sh
npm ci
npm run dev
```

Open Vite's printed localhost address, normally `http://localhost:5173`. Development mode does not install an offline worker.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run check:pwa
npm run preview
```

The production preview is normally `http://localhost:4173`. The package also includes prebuilt `dist/` files. Dependency installation/building initially needs internet; normal installed-app operations, including file transfer, use local code/data. `node_modules` is omitted; the lockfile pins dependencies.

See **INSTALL.md** for free GitHub Pages deployment and Safari → Add to Home Screen. No account, publication, or live deployment was performed for this delivery. An iPhone visiting a computer's plain HTTP LAN address cannot use the desktop-localhost service-worker exception; deploy over HTTPS. Do not open `index.html` through `file://`.

## Upgrade from Checkpoint 1 or 2

Deploy this build to the **same HTTPS origin and app path**. Finish an unsaved entry before activating the update in Settings → Storage & installation. Close other Ledger tabs if requested.

The additive v1→v2→v3 migration retains old financial records, IDs, refund links, archived entities, schedules, occurrence receipts/tombstones, cursors, budgets, settings and metadata. Schema 3 adds the spreadsheet-import receipt store; reminder preferences are optional and default off. Existing initialized databases are not reseeded. Older builds intentionally refuse newer databases.

**Never clear website data, uninstall, change origins, or delete/recreate the database to upgrade.** After upgrading, save a complete JSON backup from Settings → Data & backups. Keep independent copies; persistent browser storage is requested but retention is not guaranteed.

## Everyday tracking

- Fresh launch opens **Add**; resume preserves unfinished input. Expense, Income and Refund use positive amounts and compatible category grids. Last category is remembered separately per type.
- Optional merchant/payee, description, payment method, local date/time override and refund-original link are under **More details**. Merchant starts empty and default-category suggestions require a tap.
- Successful saves clear amount/merchant/description/payment/date override, retain category, and stay on Add. Failed saves retain input; rapid repeated submission is guarded.
- **History** groups by recorded local day, with net cash flow per filtered day. Search merchant names/descriptions; combine date/type/category/merchant/amount filters and chronological sorting. Inspect/edit or confirm deletion. Entries render 60 at a time. Deleting/changing an expense clears its refund links without deleting the refunds.
- **Settings** adds/renames/archives/unarchives categories and merchants. Relationships remain stable; historical entries show current names. Other / Other Income stay available. Category kind is immutable. Merchant names are unique ignoring normalized case/spacing, including archived merchants.
- Appearance follows system by default, with persisted light/dark overrides. Neutral styling, local system fonts, touch targets, focus indicators, labeled dialogs, skip navigation, safe-area spacing and reduced-motion support are included.

## Recurrence, budgets and analysis

**Settings → Recurring transactions:** named daily/weekly/monthly/yearly fixed expenses, income or refunds; optional end date; edit, pause/resume, delete. New past-start schedules immediately backfill automatically. Launch/focus/pageshow/visible-resume reconciles missing dues and lists added entries without confirmation. No background execution or push is required.

Monthly dates clamp from their original 29th–31st anchor, returning after February; yearly Feb 29 returns in leap years. Start/end are inclusive. Civil dates, not fixed millisecond months, control recurrence. Dates post at local midnight; midnight gaps normalize forward on the same date. Entirely skipped historical civil dates receive skipped receipts.

A transaction, occurrence receipt and schedule cursor commit atomically. Deleting a generated entry leaves a durable tombstone; editing retains its original occurrence identity. Deleting a schedule preserves entries/receipts. Pausing settles old dues first; paused dates, including resume day, are skipped. Edits settle old terms through today, then affect future unprocessed dates without rewriting history or introducing newly added historical dates. Archived categories/merchants continue to serve existing schedules.

**Settings → Budgets:** optional overall and expense-category positive monthly limits, repeated until edited/removed. Usage = expenses − refunds **received that month**. Ordinary income never expands availability; recurring expenses count. No carry-forward. Excess refunds can produce negative usage and availability above the limit. Progress clamps visually while showing the actual overage; warnings at 80%/100% never block entry.

**Home:** persisted Basic/Analytical modes, inclusive preset/custom ranges, gross expense/income/refund totals, net spending, net cash flow, tappable category spending and separately labeled current-month budgets. Analytical adds interactive daily/weekly/monthly/yearly trends, exact-value slider/series controls, empty periods, partial-month comparisons, calendar-day average, largest entries and merchant gross/refund/net spending. Weeks start Monday. Average spending includes empty days and rounds half-cent ties away from zero. Charts cap at 2,000 periods and request a coarser interval rather than interrupting totals.

## Data & backups

Open **Settings → Data & backups**:

- Export all transactions or an inclusive date range as UTF-8 CSV or genuine `.xlsx`. Flat transaction rows include explicit local date/time, type, category, merchant, description, numeric MXN amount, payment method and automatic/manual indicator. Excel contains Transactions and Summary sheets with numeric category/month totals and no merged cells.
- Import CSV/XLSX with column mapping, per-row validation, preview counts and explicit confirmation. Imports append manual records only. Duplicate IDs/content and previous import receipts are checked; automatic rows are explicitly excluded and their recurring identities are never imported. Any invalid row blocks the batch. Unknown entities are created safely in the same atomic commit. Other rows are skipped as previewed.
- Download a **complete JSON backup** of every store, including deleted/skipped recurring receipts, cursors, import provenance, preferences and metadata. Confirm “I saved this backup” only after the browser actually saves the file.
- Restore only after whole-file structural/referential validation and explicit preview/acknowledgement. **Replace** returns every store to that snapshot. **Merge** keeps current preferences/metadata and adds compatible records; conflicting IDs, normalized entities, schedule cursors or occurrence states block the whole operation. Both modes use one all-store transaction and reject stale previews. A failed write rolls back, including clears already attempted.
- Enable the optional monthly **in-app** backup reminder. It defaults off; dismissal lasts through the calendar month. There is no automatic cloud backup or external notification service.

Read **DATA_FORMAT.md** before transferring important records. JSON is the complete format; spreadsheets do not restore schedules, refund links, exact instants or deletion history. A historical replacement intentionally undoes changes made after the snapshot; save the current state first. Reopen/resume after restore to reconcile due dates from the restored cursors.

## Architecture and dependencies

| Module | Responsibility |
| --- | --- |
| `src/model.ts`, `src/calendar.ts`, `src/finance.ts` | Domain, centavos, local Gregorian calendar, budgets and aggregation |
| `src/db.ts` | Database opening, additive v1→v2→v3 upgrades, ordinary validated CRUD/preferences |
| `src/recurrence.ts` | Atomic exactly-once generation, receipts, prospective edits, pause policy |
| `src/backup.ts` | Consistent all-store snapshot, strict versioned validation, merge planning, atomic restore |
| `src/spreadsheets.ts` | Flat CSV, protected text, numeric Excel workbook, bounded file decoding |
| `src/imports.ts` | Mapping, validation, fingerprint/source duplicate checks and atomic append |
| `src/DataTools.tsx`, `src/download.ts`, `src/reminders.ts` | Local file workflows, explicit confirmations, downloads and reminders |
| `src/App.tsx`, `src/TransactionForm.tsx`, `src/History.tsx`, `src/Settings.tsx` | Preserved/extended navigation, tracking and management |
| `src/FinanceSettings.tsx`, `src/Summary.tsx` | Recurrence/budget management and Basic/Analytical UI |
| `vite.config.ts`, `scripts/check-pwa.mjs` | Relative deployment paths, manifest, generated Workbox worker and asset checks |
| `src/*.test.*`, `tests/fixtures/` | Automated checks plus prior checkpoint database source/tracking reference files |

Runtime: React/React DOM, `idb`, `lucide-react`, Papa Parse, ExcelJS. Data tools and ExcelJS are separate lazy chunks; the service worker precaches them for offline use. No remote scripts/fonts, cloud database or runtime service. Development tools: Vite, TypeScript, vite-plugin-pwa/Workbox, Vitest/jsdom/fake-indexeddb/Testing Library, ESLint, Prettier. Exact versions and licenses are in package-lock.json and THIRD_PARTY_NOTICES.txt.

Money is positive integer centavos; type controls the sign. Entry/limit maximum is MXN 999,999,999.99. Unsafe totals are guarded. Decimal dot/comma input is supported, without thousands separators/scientific notation. Stored local dates preserve reporting months when traveling. Manual overrides reject nonexistent current-zone times; ambiguous times use JavaScript's earlier occurrence. Calendar helpers support years 1000–9998.

## Verification and practical limits

**156 tests passed**, plus lint, explicit TypeScript, production build and static PWA validation. Additional Mexico City/New York runs verify transfer/restoration and DST calendar behavior. Full details, the optional dependency-audit advisory and the expected Excel chunk-size warning are in **TEST_REPORT.md**.

No real browser, iPhone/Safari, mobile visual, or runtime offline test was available. jsdom/fake-indexeddb are simulations; MANUAL_QA.md lists the pending acceptance checks. No deployment occurred. The intended minimum iPhone target remains iOS/Safari 17+, subject to that testing.

Files are processed locally and downloaded to the destination you choose. JSON is neither encrypted nor cryptographically authenticated. Browser eviction, website-data clearing, uninstalling, device loss or changing origin can remove access to records; keep independent backups. Safari and Home Screen storage may differ. There is no cross-device sync or Ledger encryption layer.

Imports support UTF-8 CSV and `.xlsx`, up to 10 MiB / 50,000 rows / 80 columns; JSON restore/download supports up to 50 MiB / 1,000,000 records. Formulas, hyperlinks, rich text, ambiguous dates, negative amounts and fractional centavos must be converted to supported plain values. Duplicate detection is conservative: identical-looking legitimate purchases may need manual entry. No large-history/backfill/maximum-size performance claim is made; snapshots remain in memory and receipts intentionally persist. Manual simultaneous edits are last-write-wins. Device clock/calendar governs recurrence. Close other Ledger windows before restoring.

All three checkpoints are delivered. Further development requires a new request; retain this source and schema rather than recreating or clearing the database.
