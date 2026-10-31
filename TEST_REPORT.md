# Ledger 1.2 — test report

**v1.2.0 · IndexedDB schema 5 · 2026-10-31 (America/Mexico_City).** Linux container, Node 24.19.0, npm 11.9.0, TypeScript 5.9.x, Vite 7.3.7, Vitest 3.2.7. Dependency versions/integrity entries are unchanged from 1.1; only the project version advances in package files.

## Baseline and design preservation

Every packaged non-dist source/configuration/documentation file matched `Ledger-1.1.zip` before edits. Baseline **177/177 tests**, lint, explicit TypeScript, production build and static PWA checks passed. The same checkout was extended; no recreation, database reset or deployment change. Prior reports remain in `tests/fixtures/test-report-v1.md` and `test-report-v1.1.md`.

Approved stylesheet SHA256 remains `6ffd609730e71adab2d45fd06c0c780323bd61b29862d158c75cf83a17c1f339`, byte-identical to 1.1. The existing automated fixture verifies exact transaction-type/amount markup. Separate source comparison verified unchanged category-grid markup, budget/financial calculations, Gregorian calendar, worker registration, icons, manifest identity/scope/base and GitHub Pages workflow. Merchant labels/grouping are extended locally; financial accounting is unchanged. These checks are structural, not screenshot-based visual certification.

## Results

| Check | Result |
| --- | --- |
| Complete `npm test` | **211/211 passed**, 15 files, no unhandled errors |
| `npm run lint` | Passed, zero errors/warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, TypeScript/Vite/Workbox production output |
| `npm run check:pwa` | Passed, standalone manifest/scope/icons/HTML/navigation fallback and all five JS/CSS assets present in precache |
| Mexico City regional suite | **139/139 passed**, 8 files |
| New York regional suite | **119/119 passed**, 6 files, including relevant DST and restored recurrence cases |

Regional commands executed on Linux:

```sh
TZ=America/Mexico_City npm test -- src/calendar.test.ts src/finance.test.ts src/recurrence.test.ts src/migration.test.ts src/backup.test.ts src/transfer.test.ts src/payment.test.ts src/release12.test.ts
TZ=America/New_York npm test -- src/calendar.test.ts src/recurrence.test.ts src/backup.test.ts src/transfer.test.ts src/payment.test.ts src/release12.test.ts
```

## New focused coverage

`release12.test.ts` — **23 tests**:

- One-time/blank merchant persistence, editing/reopen and no automatic merchant/schedule creation; explicit recurring entity rename/archive/ID preservation without converting same-name one-time rows.
- Combined saved/one-time merchant search and filters with type/category/payment/date/amount predicates. Normalized name analytics, refund/income totals and unchanged budget usage without storage identity merging.
- Required payment validation on each transaction type's create/edit; direct historical fixtures remain exactly stored until explicitly corrected. Unspecified history filtering/export/complete JSON recovery.
- Required payment on new/edited schedules; held legacy schedules preserve cursors and receipt states while healthy schedules run.
- Correction catches up old frequency/anchor/amount terms with the chosen method before prospective term changes; deleted/skipped dates remain untouched. Restored held schedules, two concurrent correction connections, leap/month-end dates, paused-period skips and exactly-once subsequent reconciliation.
- CSV and actual XLSX one-time merchant transfer never creates/associates recurring merchants, even for a matching existing name; numeric Excel cells and reimport deduplication checked.
- Missing-payment imports blocked by default; explicit historical compatibility marks unspecified rows and commit rechecks the flag. Tampered non-compatible plans reject before writes.
- Full JSON roundtrip/strict merge of both merchant types, method gaps, budgets and recurrence state. Four corrupt one-time-name cases reject before writes: simultaneous ID/name, excessive length, empty name and null.
- Actual schema-4 fake-indexeddb fixture upgrades to schema 5, comparing all ten stores with old saved associations, unspecified payments, held schedules, occurrence generated/deleted/skipped receipts, cursors, budgets, preferences and import receipts. Old schema-4 JSON normalizes/restores without assigning methods or generating held entries.

`release12.ui.test.tsx` — **11 tests**:

- Repeated one-time entry clears as before, stays out of managed merchants and appears in History/search.
- Explicit inline recurring save, duplicate handling, existing Settings entry point and no financial schedule/row creation.
- Recurring default selection/manual override; switching to free text does not apply a default. One-time transaction editing retains category and does not save an entity.
- Expense/income/refund payment validation with no preselection/None option; predefined, managed and custom values; post-save reset.
- Legacy unspecified edit blocked until method selection; original stored record remains intact beforehand.
- Held-schedule notice/list flag/disabled pause, existing editor validation, correction/catch-up and no repeated dues.
- Default-off historical import compatibility, preview/explicit commit, unspecified payment preservation and one-time imported merchant.
- Both merchant forms in the existing Analytical table, equal-name grouping and merchant selector behavior.

## Retained regression coverage

All **177 existing tests remain**: model 21, db 11, App 9, calendar 9, finance 15, recurrence 18, migrations 5, Checkpoint2 UI 6, backup 31, transfer 23, DataTools UI 8, payment domain 15 and PaymentUI 6. No test was removed/disabled to pass. Tests expecting the superseded optional payment/automatic imported merchant behavior now assert the requested required-payment/one-time behavior. Ordinary fixture writes choose explicit methods; historical unspecified fixtures use direct old-row insertion or the explicit import compatibility route. Current-schema assertions advance to 5; actual old migration fixtures retain old versions/stores.

Coverage still includes CRUD, integer-centavo arithmetic/overflow, expense/income/refund separation, receipt-month/category refunds, income excluded from budget availability, thresholds/reset/excess refunds, calendar 29–31/leap/century/DST behavior, concurrent exactly-once recurrence, deletion tombstones and cursor replay, pauses/resume/prospective edits, launch/resume flows, theme persistence, import provenance and complete restore/import rollback after late write failures. Backup unknown/malformed fields, stale previews, strict merge conflicts and imported automatic-identity guards remain exercised.

## Build and dependency notes

Production ZIP includes complete `dist/`: unchanged CSS ~15.58 kB; main UI JS ~308.14 kB; lazy DataTools ~52.38 kB; existing lazy ExcelJS ~936.98 kB. Workbox reports 16 precache entries / ~1294.19 KiB. All lazy chunks are covered by static precache checks; no new dependency, external script, backend or runtime network requirement.

The generic >500 kB Excel chunk warning is unchanged and expected; build succeeds. npm's container http-proxy environment warning is not an application failure. The 1.1 report carries the earlier two moderate ExcelJS/uuid package entries for one transitive advisory and its source/applicability assessment. Dependencies are unchanged; no fresh network audit was performed and no clean-audit/remediation claim is made.

## Browser attempt and unverified checks

A production preview started with `npx vite preview --host 127.0.0.1 --port 4182 --strictPort`. The supported cloud Chrome browser was selected and attempted that URL, returning **ERR_CONNECTION_REFUSED**. The remote browser cannot reach this container's loopback service. No public deployment, network workaround or unsupported browser installation was performed.

Therefore actual iPhone-sized rendering/scrolling, native selects/keyboard, VoiceOver/focus/safe areas, runtime service-worker installation, offline cold launch and worker update activation remain **unverified for 1.2**. jsdom interaction tests do not render layout. The user's successful prior-release iPhone testing is distinct; no actual iPhone/Safari 1.2 testing is claimed. See MANUAL_QA.md for pending acceptance.

IndexedDB tests use fake-indexeddb, not physical iOS crash/eviction/quota certification. No Windows host, Microsoft Excel/Numbers GUI, GitHub Actions deployment, largest-file dataset or multi-decade backlog benchmark was available. Existing in-memory/file bounds, unencrypted backups, storage-retention and strict-merge limitations remain.

No known failing required automated check or unfinished requested implementation remains. Device/browser acceptance is pending and explicitly not marked passed. Stop after Ledger 1.2 delivery.
