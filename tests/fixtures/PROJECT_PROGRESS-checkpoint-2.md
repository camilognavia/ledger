# Ledger project progress

## Current release and authorization

**Checkpoint 2 completed** · v0.2.0 · IndexedDB `ledger`, schema **2** · 2026-10-19.

User explicitly approved Checkpoint 2. Checkpoint 3 is **not approved and not started**. Continue only after explicit approval, using this exact project.

## Provenance and baseline

- Continued from the existing Checkpoint 1 checkout; no scaffold/project recreation.
- Verified 20 source/tracking/package files byte-for-byte against the delivered Ledger-Checkpoint-1.zip before editing.
- Baseline: all 41 original tests, lint, production build, and PWA checks passed before changes.
- Original v1 database source and tracking documents are retained in `tests/fixtures/` for reference.
- Existing dependencies and installation/deployment architecture were retained. No runtime dependency was added.

## Completed through Checkpoint 1 (preserved)

React/TypeScript/Vite PWA, local offline precache configuration, manifest/icons, four tabs with Add-first launch, light/dark/system themes, expense/income/refund entry, exact centavos, category grid/management, merchant management/search/suggestions, descriptions/payment/local times/refund links, IndexedDB persistence, grouped history, details/edit/delete, search/filter/sort/load more, persistent category choices, duplicate-save protection, local basic arithmetic, storage request, development/deployment/installation documentation. All 41 baseline tests remain in the full passing suite (schema assertions updated to v2).

## Completed Checkpoint 2

### Database and integrity

- Additive schema 1→2 migration: schedules, occurrences, budgets. Original stores/indexes/IDs/records are preserved. Basic summary mode added without resetting old preferences.
- Migration/reopen tests include manual expense, income and linked refund, archived renamed categories/merchant, preference values and initialized metadata. An aborted upgrade rolls back schema changes and allows retry; obsolete v1 reopening is refused without deleting data.
- Unique occurrence receipts, permanent deletion tombstones, and schedule reconciliation cursor. Generated transaction + receipt + cursor update are one commit. Cross-connection concurrent reconciliation is tested; failures roll back the batch.
- Manual editing of generated entries retains immutable occurrence identity. Removing an occurrence does not remove its schedule. Deleting a schedule leaves entries and receipts intact.

### Recurring schedules

- Daily/weekly/monthly/yearly fixed expense/income/refund schedules with start/end dates, edit, pause/resume and deletion in Settings.
- Automatic creation/backfill on launch, focus, pageshow and visibility resume; no confirmation, background API, push or network requirement.
- Nonblocking in-app added-entry list, dismiss/load-more controls, reconciliation error message/retry. Resume retains unfinished manual entry.
- Inclusive due dates; monthly 29th–31st and yearly Feb 29 clamp to month end without anchor drift. Gregorian century rules and year boundaries covered.
- Old dues settled before edits; new terms only affect unprocessed future dates. Paused dates, including resume day, are skipped with receipts. Existing occurrences are not rewritten or regenerated.
- Civil-date iteration and DST-safe timestamps. Historical midnight gaps normalize forward on the same date; entirely skipped dates are skipped with a receipt.

### Budgets and summaries

- Optional overall/category monthly positive limits, edit/remove, repeated monthly limits, no usage carry-forward.
- Expense minus received refunds determines usage; ordinary income is excluded, recurring expenses included. Excess refunds may produce negative usage and greater available budget.
- Clear progress and exact 80%/100% warnings. Recording is never blocked; warnings update after create/edit/delete/reconciliation.
- Persisted Basic/Analytical modes and inclusive preset/custom ranges.
- Both modes: gross expense, income, refund, net spending, cash flow, tappable category breakdown, clearly labeled current-month budget status.
- Analytical: interactive daily/weekly/monthly/yearly SVG trends with series toggles and exact-value slider; empty periods; month comparisons; daily average; largest transactions; merchant expense/refund/net analysis. No forecasting/investment features.
- All charts/assets run locally with no new dependency or service.

## Verification

- **94/94 automated tests passed**, 8 files, no unhandled errors.
- 21 model, 11 database, 9 original UI, 9 calendar, 15 finance, 18 recurrence, 5 migration/settings-persistence, 6 Checkpoint 2 integration tests.
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:pwa`: passed.
- Mexico City calendar/finance/recurrence/migration: **47/47 passed**.
- New York calendar/recurrence with explicit 23/25-hour DST assertions: **27/27 passed**.
- Production dependency audit: zero reported vulnerabilities at verification time.
- No real browser/Safari/iPhone, mobile visual, actual runtime offline, or deployment verification. These are pending, not marked passed. See TEST_REPORT.md and MANUAL_QA.md.

## Known limitations and device validation

- No known failing automated checks; no physical-device compatibility claim.
- No backup/export/import yet. Eviction, clearing website data, uninstalling, device loss, or changing origin can lose records. Persistence is requested, not guaranteed.
- No cloud synchronization/encryption layer/push/background execution. Transactions due while closed are posted on next launch/resume.
- Added-entry notification is session-local; occurrence correctness and deletion/skip receipts are durable. Other windows refresh data, while the window committing a reconciliation shows its added-entry list.
- Paused dates including resume day are skipped; schedule changes are prospective after old dues are settled. This is explicit UI behavior, not a hidden retry policy.
- Budgets are repeating editable limits, not versioned historical allocations. Category limits are independent from overall. Budget status always refers to current calendar month regardless of summary range.
- Month-comparison edge months may be partial; the UI labels this. Charts cap at 2,000 periods and ask for a coarser interval; summaries still work.
- Full database snapshots remain in memory; large histories and multi-decade daily backfills are unprofiled. Tombstones/receipts intentionally persist and grow. Manual concurrent edits are last-write-wins.
- Device clock/calendar governs dues. A far-future incorrect clock may post future dates; subsequent backward clock changes never repeat them. Whole civil dates skipped by historical timezone rules are skipped.
- Schema 2 cannot be opened by a v1 build. Use the same origin/path and close old tabs during upgrade; never delete/recreate the database to downgrade.
- Windows instructions and GitHub Pages workflow are prepared but were not executed on Windows/GitHub. No deployment or account was created.

## Checkpoint 3 — NOT STARTED; explicit approval required

1. Read this document and DECISIONS.md; inspect actual source, particularly `db.ts`, `model.ts`, `recurrence.ts`, and tests. Run the current full suite/build before editing.
2. Preserve schema-2 compatibility. Migrations must retain all previous records, schedule cursors, generated occurrence identities, **deleted/skipped receipts**, budgets, preferences, and relationships. Restoring transactions alone can otherwise resurrect deleted recurring entries.
3. Add flat CSV/Excel exports for all/selected ranges; actual numeric amount cells; explicit local date/time/type/category/merchant/description/payment/automatic columns; Transactions and Summary sheets, category/monthly summaries.
4. Add CSV/XLSX import mapping, validation, preview, duplicate detection and explicit commit confirmation. Do not silently import occurrence metadata without reconciliation-integrity validation.
5. Add complete versioned JSON backup/restore, validated before database mutation. Specify safe merge/replace semantics and preserve IDs/receipts/cursors. Prefer an atomic restore transaction. Add optional monthly backup reminders.
6. Final accessibility/mobile polish and real-browser/iPhone acceptance where available; migration/persistence/import/export/restore tests, full lint/type/build/PWA checks.
7. Update tracking/decisions/test report and deliver the **entire** project ZIP, then stop. No automatic continuation beyond approved scope.
