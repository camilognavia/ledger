# Ledger project progress

## Current release

**Checkpoint 1 implemented and packaged** · v0.1.0 · Database `ledger`, schema **1**.

Completed 2026-10-19 UTC. This project is the sole foundation for subsequent checkpoints. Checkpoint 2 and 3 must not start without explicit user approval. Read this document, DECISIONS.md, and the actual source, then verify this release builds before editing.

## Completed Checkpoint 1 scope

- Complete React + TypeScript + Vite project, pinned dependencies, source, tests, static build, custom bundled icons, manifest, generated Workbox service worker.
- Offline application precaching configuration and prompted updates; runtime offline/iOS acceptance still requires device testing.
- Responsive neutral interface, safe-area padding, reduced-motion CSS, native dialogs, labeled controls, focus styles, system/light/dark appearance persisted in IndexedDB.
- Home, History, Add, Settings navigation; fresh launch opens Add. Resume preserves work.
- Expense/income/refund form, exact centavos, validation, four-column category icon grid, independent persisted last category per type, no default merchant, explicit merchant-category suggestions, optional description/payment/date/time, optional refund-original link.
- Successful save clears entry-only data, preserves category, stays Add, shows a nonblocking notice. Failed saves preserve input. In-flight guard and stable entry UUID prevent repeat submissions.
- Separate expense/income default categories. Add/rename/icon/color/archive/unarchive management; protected fallback Other categories. Archive preserves historical relationships.
- Shared saved-merchant entities, search/select/rename/archive/unarchive/default category, normalized uniqueness including archived names, merchant-specific history.
- IndexedDB v1 stores, indexes, atomic initial seeding and writes, explicit future migration boundary, persistent storage request, multiwindow/focus refresh.
- History grouped by recorded local day with filtered daily net; transaction details, edit, confirmed delete, merchant/description search, type/category/merchant/date/amount filters, chronological sort, incremental 60-row rendering.
- Basic arithmetic and a modest month overview/category totals. Refunds remain distinct from ordinary income. Excess refunds can produce negative net spending.
- README, development/build instructions, free deployment workflow, iPhone installation guide, architecture decisions, test report, manual acceptance checklist, third-party notices.

## Verification

- **41 automated tests passed** (21 domain, 11 IndexedDB, 9 interactive jsdom tests).
- ESLint, strict TypeScript/Vite production build, and production PWA manifest/precache checks passed.
- Domain tests rerun with `TZ=America/Mexico_City`: 21/21 passed.
- Production dependency audit returned zero vulnerabilities at verification time.
- No live browser preview, real-browser layout test, iOS/Safari test, or actual runtime offline test was available. Do not recast DOM/static checks as those tests. Details in TEST_REPORT.md.

## Known limitations and outstanding validation

- No known failing automated checks; no visual or device acceptance claim.
- No backup/export in this checkpoint. Browser eviction, clearing website data, uninstalling, device loss, or changing origin can make data unavailable. Persistence requests cannot guarantee iOS retention.
- History loads the complete database snapshot into memory; only DOM rendering is incremental. Very large datasets are unprofiled. Existing indexes allow later query pagination.
- Concurrent edits are last committed write. No cloud sync, encryption layer, background execution, or push.
- Safari and installed Home Screen app storage may differ. Install before entering important records. iOS keyboard autofocus may need a tap.
- User-controlled deployment is still outstanding. `dist/` and the GitHub Pages workflow are ready; neither an account nor deployment was created.
- UI minimum target is iOS/Safari 17+, subject to manual acceptance. See MANUAL_QA.md for offline, mobile widths, keyboard, safe area, accessibility, updates, and persistence checks.

## Checkpoint 2 — NOT STARTED; requires explicit approval

Continue from this exact project and preserve v1 records. Add schema v2 stores via migrations and fixture-based upgrade tests.

- Fixed daily/weekly/monthly/yearly schedules; start/end, edit, pause/resume, delete.
- Automatic launch/resume reconciliation, atomic exactly-once occurrences, backfill, visible in-app reconciliation list; deleting one occurrence must not regenerate it or delete its schedule. Decide tombstone/occurrence ledger semantics.
- Explicit monthly-31st/yearly-leap-day policy (recommended: clamp to last valid day using original anchor, no drift). Local calendar iteration, not fixed millisecond months. Calendar edge-case tests.
- Overall/category monthly spending budgets; editable optional limits; month reset without carry; 80%/100% warnings; recording never blocked. Recurrence counts as expense. Refund restores budget in receipt month and category; ordinary income never expands budget.
- Persisted Basic/Analytical modes; date ranges; interactive charts; daily/weekly/monthly/yearly trends, month comparisons, average daily spending, largest entries, merchant spending, separate type trends.
- Finance, calendar, recurrence uniqueness, tombstones, budgets, retained v1 schema, and interaction tests. Deliver a full source ZIP and updated reports, then stop.

## Checkpoint 3 — NOT STARTED; requires explicit approval after Checkpoint 2

- Flat CSV and Excel exports for all/selected ranges. Numeric spreadsheet amounts; Transactions and Summary sheets; explicit local date/time/type/category/merchant/description/payment/automatic fields; category/month summaries.
- CSV/XLSX imports with column mapping, preview, validation, duplicate detection, explicit commit confirmation.
- Versioned complete JSON backup/restore, validated before mutation; safe explicit merge/replace semantics, stable IDs/relations/preferences/schedules/budgets, monthly optional backup reminders.
- Final accessibility/mobile polish, migration/persistence/transfer tests, production verification, final documentation and complete ZIP.

## Continuation procedure

1. Obtain explicit checkpoint approval; use these source files, not a fresh scaffold.
2. Read PROJECT_PROGRESS.md and DECISIONS.md; inspect model.ts, db.ts, forms, and tests.
3. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run check:pwa` before making changes.
4. Preserve database name, existing IDs/relationships, origin, and schema compatibility. Increment versions only with non-destructive upgrades. Never clear user data or recreate the database as an upgrade.
5. Complete only the approved checkpoint, update both tracking documents and test report, deliver a full project ZIP, and stop for the next explicit approval.
