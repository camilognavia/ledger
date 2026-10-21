# Ledger Checkpoint 3 — final test report

**v1.0.0 · schema 3 · 2026-10-19.** Managed Linux container, Node 24.19.0, npm 11.9.0, TypeScript 5.9.x, Vite 7.3.7, Vitest 3.2.7. Exact dependencies are pinned in package-lock.json.

## Baseline and continuation

30 source/tracking/package files matched the delivered Checkpoint 2 ZIP byte-for-byte before implementation. Its **94 tests**, lint, explicit TypeScript, production build and PWA validation passed first. The existing source/schema were extended directly. No recreation or destructive database reset occurred.

## Final required checks

| Check | Result |
| --- | --- |
| `npm test` | **156/156 passed**, 11 files, no unhandled errors |
| `npm run lint` | Passed, zero ESLint errors/warnings |
| `npm run typecheck` | Passed, explicit strict TypeScript check |
| `npm run build` | Passed, TypeScript/Vite/Workbox production build |
| `npm run check:pwa` | Passed, manifest/scope/icons/HTML references/navigation fallback and every JS/CSS precache reference |
| Mexico City transfer/backup/calendar/finance/recurrence/migration run | **101/101 passed** |
| New York transfer/backup/calendar/recurrence run | **81/81 passed**, including 23-hour/25-hour DST timestamp gaps with stable recorded dates |

Timezone commands:

```sh
TZ=America/Mexico_City npx vitest run src/backup.test.ts src/transfer.test.ts src/migration.test.ts src/recurrence.test.ts src/calendar.test.ts src/finance.test.ts
TZ=America/New_York npx vitest run src/backup.test.ts src/transfer.test.ts src/recurrence.test.ts src/calendar.test.ts
```

These environment-variable commands were executed on Linux. The normal npm commands are documented for Windows; a Windows host was not available.

## Coverage inventory

| Test file | Count | Verified behavior |
| --- | ---: | --- |
| `model.test.ts` | 21 | Original centavos/precision/range/overflow, finance types, local dates and filters |
| `db.test.ts` | 11 | Original CRUD/persistence, duplicate submission, entity rename/archive, fallbacks, links, theme/category preferences and newer-version refusal |
| `App.test.tsx` | 9 | Original Add-first/manual entry/reset/remount, types/suggestions/history/edit/delete/search/settings/error retention |
| `calendar.test.ts` | 9 | Monthly 29–31, leap/common February, Feb 29 yearly return, century rules, day/week/year boundaries, inclusive ranges and seeking |
| `finance.test.ts` | 15 | Budget income exclusion, automatic expenses, receipt-month/category refunds, excess refunds, exact 80/100 thresholds, reset/no carry, averages/rounding and trends |
| `recurrence.test.ts` | 18 | Backfill/idempotence/reopen, independent-connection concurrency, deletion/cursor replay, edited identity, pause/resume, prospective changes, end/future dates, deletion retention, rollback, archives, backward clock and DST |
| `migration.test.ts` | 5 | Original v1 retention/reopen, aborted upgrade rollback/retry, obsolete-client refusal, budget/mode persistence and invalid budget rejection; current target version is 3 |
| `Checkpoint2.test.tsx` | 6 | Original auto launch/resume/listing/deletion retention, unfinished input, schedule UI lifecycle, nonblocking budget warnings/refunds/income, analytical controls/persistence/ranges |
| `backup.test.ts` | 31 | Complete all-store JSON roundtrip/reopen; generated/deleted/skipped receipts, cursors, preferences, imports, metadata; recurrence after restore/replay/resume; invalid files; actual restore write rollback after clears; stale/tampered plans; strict/idempotent merge; deletion conflict; old-format normalization; actual v2→v3 migration; 22 corruption cases |
| `transfer.test.ts` | 23 | Genuine numeric XLSX/PK ZIP, flat rows/summary totals, inclusive range exports, CSV escaping/Unicode/newlines, literal formula-looking strings, rejected formula/hyperlink cells, Excel date/time/centavos, mapping, no preview writes, duplicate/deleted-import detection, automatic exclusions/identity guards, invalid amounts/dates/types, stale/tampered plans, actual late import rollback, restored import receipts and deleted automatic-ID guard |
| `DataTools.test.tsx` | 8 | File upload/mapping/preview/explicit commit, invalid file blocking, restore acknowledgement, merge conflict display, download request vs confirmed saved date, lazy Settings/reminder/dismissal, accessible dialog naming/skip link, reminder month persistence |

The 94 original tests remain in the passing suite; schema assertions were advanced to 3. New backup fixtures contain manual expense/income/refund links, active and deleted schedules, generated/deleted/skipped receipts, processed cursors, budgets, import provenance, theme/summary/reminder settings and extra metadata. Both roundtrip equality and post-restore recurrence are exercised.

Storage failure tests patch actual IndexedDB put/add calls to fail late in the **production restore/import functions**, then compare the complete destination state before/after. They verify rollback of already attempted clears, inserted entities and financial rows—not merely rejection during a read-only preview.

Excel tests produce and decode actual XLSX bytes with ExcelJS, inspect numeric cell values, dates/times, sheet names, summaries and no merges. CSV tests cover quote/newline/Unicode/protected-text roundtrips. This does not substitute for opening the files in Microsoft Excel or iPhone Numbers; those desktop/device applications were unavailable.

## Build and dependency notes

Main UI JS: about **301.81 kB / 93.14 kB gzip**. Data tools: about **50.96 kB / 17.64 kB gzip**. ExcelJS browser chunk: about **936.98 kB / 270.74 kB gzip**. CSS: about **15.58 kB / 3.95 kB gzip**. Workbox reports 16 precache entries / **1286.62 KiB**, including its usual duplicated icon listings. All transfer chunks are present in the precache; static checks cover their asset paths.

Vite prints its generic >500 kB chunk warning for the already lazy ExcelJS browser bundle. This is an expected size warning, not a failed build; it was retained rather than hidden. No third-party network script is needed at runtime. Runtime license notices are included.

### Optional production dependency audit — advisory remains

`npm audit --omit=dev --json` exits nonzero with **two moderate package entries (ExcelJS and transitive uuid), one underlying advisory; zero high/critical entries**. This is not a clean-audit result and was not counted as a passed check.

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns bounds checking in uuid v3/v5/v6 APIs when supplied external output buffers; its v4 path is outside the affected methods. Local source inspection of ExcelJS 4.4.0 finds its uuid calls in conditional-format extensions use no-buffer `v4()`. Ledger's own financial/entity identifiers use `crypto.randomUUID()`.

This is an applicability assessment from the upstream advisory and installed source, **not** removal of upstream bundled code or a security certification. No major downgrade/override was applied merely to suppress the report. Upstream dependency maintenance remains a known limitation; the locked browser bundle is unchanged in that respect.

## Findings resolved during implementation

- Guarded all-store restore/import transactions against stale previews; no file parsing, dynamic module loads or other non-IDB awaits occur inside their write lifetime.
- Added durable source/fingerprint import receipts, known deleted automatic-ID checks, and explicit exclusion of recurring spreadsheet identities.
- Ensured stored local dates/times validate without destination-zone reinterpretation during JSON transfer.
- Made rollback tests fail late enough to demonstrate recovery after clears/entity writes.
- Added explicit dialog names/focus return, bounded semantic preview tables and a confirmed-save action instead of assuming a browser download was saved.
- Sized backup output and input consistently; oversize output fails without producing an unusable partial backup.

No known failing **required** automated check remains. The optional dependency audit and unperformed acceptance checks are reported separately.

## Unavailable / not verified

- **Real-browser and mobile visual tests:** browser capability availability was checked; the required supported controlled-browser surface was absent. No browser was installed/launched through an unsupported fallback. DOM tests do not render layout.
- **Actual iPhone/Safari:** no phone, simulator or Safari engine. Home Screen installation, keyboard/visualViewport behavior, safe areas, VoiceOver, real focus trapping, system-theme changes and touch layouts remain manual acceptance.
- **Runtime offline:** no actual worker installation, airplane-mode cold launch, download/file-picker cycle or worker-update lifecycle. Precache/manifest consistency is verified statically, not claimed as runtime offline proof.
- **Real IndexedDB/OS durability:** tests use fake-indexeddb. Browser quota/eviction, power-loss durability, multi-process crash behavior and maximum-size performance were not certified.
- **External applications/hosting:** no Windows host, Microsoft Excel, Apple Numbers, GitHub Actions or deployment run; no account registration/live URL. Free-deployment source/workflow and prebuilt dist are prepared.
- **Broader assurance:** no formal accessibility audit, penetration test, cryptographic authentication of backups, or large-history/multi-decade backfill benchmark. File bounds and in-memory behavior are documented.

MANUAL_QA.md records the remaining real-device checklist. These items are pending, never labeled passed.
