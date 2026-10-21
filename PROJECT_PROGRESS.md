# Ledger project progress

## Current delivery — Ledger 1.1

**v1.1.0 · IndexedDB `ledger`, schema 4 · 2026-10-21 UTC.** All four authorized usability refinements implemented. This is a direct extension of the delivered Checkpoint 3 source, not a recreation. Every archived source/package/document file matched Checkpoint 3 before editing (dist excluded from comparison because it was subsequently rebuilt). Baseline: 156 tests, lint, explicit TypeScript, production and PWA checks passed.

### Completed

- Optional managed payment dropdown with Cash, Debit Card, Credit Card, Bank Transfer, Other/custom, and saved choices. Settings supports add/rename/archive/unarchive using existing controls/dialog styling. Schedule editing reuses the field without changing recurrence logic.
- Additive versionchange migration 3→4 creates paymentMethods plus its unique normalized-name index, seeds defaults and collects legacy transaction/schedule labels. Every original store and record is preserved; financial payment strings remain unchanged. No reset/reinstallation/origin/path change.
- Merchant before category; all existing details remain visible in the approved order. Type/amount controls retain exact markup and behavior. Merchant defaults apply only on explicit selection, are type/archive checked, and can be manually overridden. Initial edits preserve saved categories. Post-save reset remains.
- Quieted decorative copy with hidden blank line boxes preserving intentional whitespace. Existing CSS, themes, navigation, icons and chart styling are unchanged.
- Combined History payment filtering for configured choices, referenced archives, custom/legacy values and Unspecified. Normalized case/whitespace options without mutations.
- Complete backups include/validate payment metadata, preserving all occurrence receipts/tombstones/skips/cursors and import receipts. Schemas 1–3 normalize to schema 4. Atomic Replace/strict Merge and stale-preview safeguards remain. CSV/XLSX carry original payment strings and true numeric Excel amounts.
- README, installation/upgrade guide, format documentation, decisions, changelog, test report and pending manual checklist updated. Complete source, tests, lockfile, production dist and original GitHub Pages workflow packaged.

### Verification

- **177/177 automated tests passed, 13 files** (156 retained/updated for approved requirements + 21 new focused tests). No test was removed. Previous suggestion/collapse expectations changed to the explicitly approved 1.1 interaction.
- Lint, explicit TypeScript, production build and static PWA checks passed.
- Mexico City: **116/116**; New York: **96/96**, covering recurrence/calendar/backup/transfer/payment compatibility and relevant migration/finance tests.
- Actual schema-3 emulator migration compares all original stores and replays recurrence; schemas 1/2 regression tests remain. Backup corruption/rollback/roundtrip tests include the new store; real XLSX bytes and numeric cells tested.
- Approved CSS SHA256 and byte-for-byte type/amount markup checked by automated regression test. Financial/calendar/recurrence engines and deployment workflow/configuration also compared to original source.

### Known limitations / outstanding acceptance

No known failing required automated check. No additional feature work remains authorized. Native browser rendering/scrolling, keyboard, VoiceOver and runtime offline/update acceptance remain pending: a loopback Vite preview ran, but the cloud browser returned ERR_CONNECTION_REFUSED because it could not reach the container. Actual iPhone/Safari 1.1 testing was not performed. The user's successful iPhone testing applies to the prior release, not this update.

Financial rows deliberately retain recorded payment labels: rename changes future choices rather than relabeling history or existing schedules. Old labels can remain distinct filter options. Other remains the custom-entry action even if the similarly named managed choice is archived. Add imported/custom labels to Settings to make reusable choices. This is the documented minimal backward-compatible model.

Existing personal-scale, browser eviction, unencrypted JSON, conservative imports/strict merges, no-background-execution and static-host limitations remain. Dependencies are unchanged; the historical ExcelJS/uuid moderate advisory assessment and expected lazy Excel chunk-size warning remain documented, not represented as resolved.

### Next checkpoint

**None. Stop after delivering Ledger 1.1.** Await explicit approval for any further development. Deploy through the existing repository/workflow at the same URL; INSTALL.md explains updating the existing installed PWA without reinstalling or clearing its IndexedDB.

## Historical Checkpoint 3 progress record

The following is the preserved prior delivery record; the current 1.1 section above supersedes its version, counts, merchant-suggestion behavior, storage-store count and acceptance status.


## Final delivered checkpoint

**Checkpoint 3 completed · v1.0.0 · IndexedDB `ledger`, schema 3 · 2026-10-19.**

All three checkpoints were individually approved and implemented. Stop after this delivery. No further implementation or deployment is authorized by the checkpoint workflow without a new user request.

## Exact continuation and preserved functionality

Continued from the delivered Checkpoint 2 checkout; 30 source/tracking/package files matched its ZIP before edits. All 94 baseline tests, lint, explicit TypeScript, production build and PWA checks passed before changes. No project recreation occurred. Prior database source and checkpoint progress/decisions are archived in `tests/fixtures/`.

All Checkpoint 1/2 tracking remains: Add-first navigation, themes, separate expense/income/refund entry, integer centavos, per-type category choices, category/merchant management and archival, merchant suggestions, optional details/refund links, grouped searchable/filterable/editable history, atomic recurrence/occurrence receipts/tombstones/cursors, schedule editing/pause semantics, monthly budgets, Basic/Analytical summaries and local interactive charts. The original 94 tests remain passing (version assertions now target schema 3).

## Completed Checkpoint 3 requirements

### Schema and storage

- Additive v3 upgrade creates `imports`, with fingerprint/source indexes; existing stores and data remain.
- Optional backup reminder/save/dismissal preferences preserve older settings. Reminders default off.
- Real v1→v3 and v2→v3 emulator fixtures preserve records, IDs, preferences, archived entities, refund links, budgets, schedules, deleted/skipped receipts and processed-through cursors. Newer/older incompatible-version opening remains non-destructive.

### CSV / Excel

- All/selected inclusive-range CSV and XLSX exports, one transaction per row, explicit local date/time/type/category/merchant/description/amount/payment/automatic columns plus reference identity fields.
- Genuine numeric MXN cells in Excel; Transactions and separate Summary with ordinary income, expenses, refunds, net spending/cash flow, category and monthly totals; no merged/day-group rows or formulas.
- UTF-8 CSV quoting/newline/Unicode handling and formula-looking text protection, with reversible Ledger escaping marker.
- CSV/XLSX loading, column mapping, preview, per-row validation/reasons, duplicate detection, explicit confirmation. XLSX uses Transactions if present, otherwise first worksheet. Formula/hyperlink/rich-text cells require conversion to plain values.
- Append-only manual imports. Ledger automatic rows/recurring metadata are explicitly excluded even when mapping omits Automatic. No imported occurrence/schedule identities or refund links. Known automatic IDs, content/source IDs and durable prior-import receipts participate in deduplication.
- New entities, financial records and import receipts commit atomically; any invalid row blocks committing. Stale previews and provenance mismatches fail safely. Receipts survive deletion and JSON restoration, preserving idempotence.

### Complete backup / restore

- Versioned JSON contains every store, including metadata, preferences, imports, schedules, occurrence generated/deleted/skipped receipts and all reconciliation cursors.
- Whole-file structure/type/range/ID/name/relationship/fallback/occurrence/cursor validation before writes. Unknown future versions/stores/fields are rejected; older schema shapes normalize non-destructively. Wall-clock times are not reinterpreted in the destination timezone.
- Consistent snapshot capture; explicit Replace/Merge preview and acknowledgement; all-store atomic commit with stale-preview guard. Simulated late write failures roll back clears and earlier puts.
- Replace returns exactly to the validated snapshot (with explicit older-snapshot undo warning). Strict merge keeps current preferences/metadata and adds identical/compatible IDs, rejecting every conflict including occurrence-state/cursor disagreement. No silent recurring resurrection.
- Optional unobtrusive monthly in-app reminder; confirmed-save timestamp recorded only after “I saved this backup.” No account/cloud/push service.

### Interface / delivery

- Organized Settings → Data & backups; local file pickers, bounded preview table, status/error feedback and clear safe restore semantics.
- Labeled native dialogs with focus return, skip-to-content link, keyboard-focusable preview table, semantic captions/headers, responsive mapping controls, safe-area spacing, slightly more readable small labels and viewport-based keyboard tab-bar handling. Real-device acceptance remains pending.
- Lazy data-tools/Excel chunks included in offline precache; no remote dependency at runtime.
- Updated README, DATA_FORMAT, INSTALL, decisions, progress, test report, pending manual checklist and runtime third-party license notices. Full source, lockfile, tests and prebuilt dist included in the final ZIP.

## Final verification

- **156/156 tests passed**, 11 files, no unhandled errors.
- 94 preserved tests + 31 complete-backup tests + 23 spreadsheet/import tests + 8 data-tool/reminder/accessibility DOM tests.
- Lint, explicit TypeScript, production build, and PWA consistency validation passed.
- Mexico City: **101/101** calendar/finance/recurrence/migration/backup/transfer tests passed. New York: **81/81** calendar/recurrence/backup/transfer tests passed, including 23/25-hour DST cases.
- Production dependency audit reports **two moderate entries for one transitive uuid advisory** through ExcelJS, no high/critical findings. ExcelJS source uses unaffected no-buffer v4 calls; advisory/applicability details are documented in TEST_REPORT.md. No vulnerability-free claim.
- Expected Vite warning: ExcelJS's already lazy, precached ~937 kB chunk exceeds the generic 500 kB warning threshold. Build succeeds. Total precache about 1.26 MiB, main UI JS about 302 kB.

## Known limitations / pending acceptance

- No real browser/Safari/iPhone, mobile visual, actual download, runtime offline/cache-update or storage-eviction test was available. Browser capability availability was checked and the supported surface was absent. DOM/fake-indexeddb tests are simulations, not device certification.
- No deployment, account registration, live preview URL, Windows host run or GitHub Actions run. User-controlled free-hosting steps and static build are prepared.
- File bounds: CSV/XLSX 10 MiB / 50,000 rows / 80 columns; JSON download/restore 50 MiB / 1,000,000 records. Oversize backup download fails without emitting partial data. Maximum-size performance is unprofiled; workbook parsing, previews and snapshots use memory.
- Spreadsheet import is intentionally conservative and manual-only. Identical-looking legitimate purchases may require manual entry; bank-specific formats must be normalized. Exact instants/refund links/schedules/receipts require JSON. No conflict-resolving entity remap/last-write-wins merge.
- JSON is unencrypted/unsigned. Clearing browser data, uninstalling, eviction, device loss or changing origin can lose records. Requesting persistence does not guarantee retention. Save independent backups; actual file-save completion is confirmed by the user.
- Replacing an older snapshot intentionally undoes newer changes/deletions. After restore, reopen/resume to reconcile restored cursors. Close other windows before restoration; stale previews reject concurrent changes.
- Existing personal-scale limits remain: full snapshots in memory, incremental history DOM, unprofiled very old daily backfill, durable receipt growth, session-local automatic-entry notice, last committed manual edits, device-clock-driven dues, prospective schedule edits, skipped resume day and no background execution.
- Monthly budget limits repeat rather than storing historical allocations; chart ranges cap at 2,000 periods; partial-month comparison disclosure remains.

No known failing required automated check remains. The optional dependency audit is not clean and is explicitly reported. Device acceptance tasks remain in MANUAL_QA.md; they are not marked passed.

## Future maintenance handoff

Retain this exact source, lockfile, database name and IDs. Read PROJECT_PROGRESS.md / DECISIONS.md and actual implementation before changes; verify the existing suite/build first. Use non-destructive migrations. Never drop occurrence deletion/skip receipts, import receipts or cursors during a format migration/restore. Revisit upstream ExcelJS/uuid advisory maintenance and complete the manual browser/iPhone checklist before making compatibility claims. No further checkpoint is started automatically.
