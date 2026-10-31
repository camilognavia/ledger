# Ledger 1.1 — test report

**v1.1.0 · schema 4 · 2026-10-21 UTC.** Linux container; Node 24.19.0, npm 11.9.0, TypeScript 5.9.x, Vite 7.3.7, Vitest 3.2.7. Runtime/dev dependency versions and integrity entries are unchanged from Checkpoint 3; only the project version advances in the lockfile.

## Baseline and preservation

All packaged non-dist source/configuration/documentation files matched `Ledger-Checkpoint-3.zip` before editing. Baseline **156/156 tests**, lint, explicit TypeScript, production build and PWA validation passed. No project recreation or database reset. The prior test report is retained in `tests/fixtures/test-report-v1.md`.

The approved CSS is byte-for-byte unchanged: SHA256 `6ffd609730e71adab2d45fd06c0c780323bd61b29862d158c75cf83a17c1f339`. A regression test compares the original transaction-type/amount markup fixture byte-for-byte. The existing navigation, manifest identity/scope/base, icons/assets, GitHub Pages workflow and financial/calendar/recurrence engines remain unchanged. Source comparisons do not substitute for visual/device testing.

## Required automated checks

| Check | Result |
| --- | --- |
| `npm test` | **177/177 passed**, 13 files, no unhandled errors |
| `npm run lint` | Passed, no ESLint errors/warnings |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, TypeScript/Vite/Workbox production output |
| `npm run check:pwa` | Passed, standalone manifest/scope/icons/HTML/navigation fallback and all five JS/CSS assets in precache |
| Mexico City regional suite | **116/116 passed**, 7 files |
| New York regional suite | **96/96 passed**, 5 files |

Regional commands (Linux):

```sh
TZ=America/Mexico_City npm test -- src/calendar.test.ts src/finance.test.ts src/recurrence.test.ts src/migration.test.ts src/backup.test.ts src/transfer.test.ts src/payment.test.ts
TZ=America/New_York npm test -- src/calendar.test.ts src/recurrence.test.ts src/backup.test.ts src/transfer.test.ts src/payment.test.ts
```

## Focused new coverage

`payment.test.ts` — **15 tests**:

- Add/rename/archive/reopen methods; normalized duplicate rejection includes archives. Original financial text remains unchanged.
- Actual schema-3 IndexedDB-emulator fixture migrates all nine prior stores to schema 4 without reseeding/loss. Original rows, preferences, schedules, receipts/tombstones/skips/cursors, import provenance and budgets compare equal; recurrence stays idempotent.
- All-store payment metadata backup roundtrip, strict idempotent merge, post-restore recurrence; schema-3 backup normalization derives choices without changing legacy strings.
- Six corrupt payment-metadata cases (null, normalized duplicates, mismatch, nonboolean, missing store, unknown field) rejected before any destination write.
- Deterministic normalized History options retain referenced archives/custom/legacy labels; combined type/category/merchant/range/amount/search predicates and Unspecified do not mutate rows.
- Actual CSV/XLSX export/import after managed rename retains recorded payment labels, numeric amounts, manual-only identity and duplicate detection. Excel numeric cells inspected.
- Approved CSS hash and original type/amount markup equality.

`PaymentUI.test.tsx` — **6 tests**:

- Always-visible field order, initially empty merchant/payment, initial choices, custom save/reset, including a custom name beginning with “Other”.
- Other without custom text, configured Cash and Unspecified roundtrip.
- Settings add/select/rename/archive workflow with historical label preservation and hidden archived new-entry choice.
- Editing does not apply merchant defaults on mount; explicit merchant changes apply each compatible active default, with manual overrides and invalid/missing/archived/opposite-type defaults leaving category untouched.
- Archived/legacy text remains selected and unchanged when editing.
- Combined History control interactions; normalized duplicate options, archives, custom/unspecified values and record equality.

## Retained regression suite

All **156 previous tests remain**: model 21, database 11, App UI 9, calendar 9, finance 15, recurrence 18, migrations 5, Checkpoint 2 UI 6, complete backup 31, transfer 23, data tools/reminders/accessibility UI 8. No test was deleted or disabled. The superseded “More details” clicks/suggestion expectation and current-schema assertions were updated to the explicitly requested behavior/version. Historical schema fixtures still create their original stores.

Coverage retains transaction CRUD, integer centavos, separate income/refund accounting, receipt-month/category refund budgets, income exclusion, 80/100 warnings, excess refunds, monthly reset, monthly 29–31/leap/century edges, DST, independent-connection recurrence exactly once, deleted/skipped occurrence replay, edits/pause/resume, prospective schedules and launch/resume UI. Existing late write-failure tests prove restore/import rollback after clears/earlier writes; stale/tampered plans, strict merge conflicts, manual import identity guards and durable deleted-import receipts remain checked. New payment metadata participates in those same all-store transactions.

## Production / PWA notes

The build includes production `dist/`, manifest, icons, worker and lazy data/Excel chunks. CSS remains 15.58 kB; main UI JS about 305.6 kB; lazy ExcelJS about 937 kB. Precache is about 1.26 MiB (16 entries including normal repeated icon listings). The generic >500 kB warning for the existing lazy Excel bundle remains; it is not hidden or a failed build. No new dependency, remote asset or runtime network requirement was added.

The prior Checkpoint 3 audit reported two moderate package entries for one transitive ExcelJS/uuid advisory, no high/critical entries. Dependencies remain identical; no fresh network audit was performed for this small release and no clean-audit claim is made. The historical report retains its source/applicability assessment (ExcelJS no-buffer uuid v4 vs affected buffered v3/v5/v6 APIs). Upstream dependency maintenance remains a known limitation.

## Attempts and unverified acceptance

- A production preview starts successfully with `npx vite preview --host 127.0.0.1 --port 4173`. The default wildcard-host preview encountered this container's `uv_interface_addresses` restriction; explicit loopback worked. The cloud Chrome browser was selected and navigation to that local URL was attempted, but returned **ERR_CONNECTION_REFUSED**: the remote browser cannot reach this container's loopback server. No public deployment/tunnel or unsupported browser installation was attempted.
- **Mobile visual/scrolling:** unverified. DOM tests verify normal source order, accessible fields and interactions; jsdom does not render an iPhone-sized viewport or simulate real keyboard scrolling. No screenshot-based design equivalence claim.
- **iPhone/Safari:** not tested for 1.1 by us. The user reports actual iPhone success for the prior release, which is distinct. Keyboard, safe areas, VoiceOver, native selects, focus and installed update acceptance remain in MANUAL_QA.md.
- **Offline runtime/service-worker lifecycle:** static manifest/precache validation passed, but actual worker install, offline cold launch and update activation could not be tested in the inaccessible browser.
- **OS/browser persistence and applications:** fake-indexeddb tests validate IDB transactions/migrations, not physical crash/eviction durability. No Windows host, Excel/Numbers GUI, GitHub Actions deployment run or maximum-size benchmark. Existing file limits, unencrypted backups and storage-retention caveats remain.

No known failing required automated check remains. Outstanding real-browser/device acceptance is explicitly pending, not reported as passed.
