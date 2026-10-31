# Browser and iPhone acceptance checklist — NOT YET EXECUTED

Current acceptance target: **Ledger 1.2**. Its section at the end supersedes earlier optional-payment and merchant-only-selection checks; prior sections remain historical context.

The automated report is in TEST_REPORT.md. Use a deployed production build for these checks. Record device, iOS/browser version, date, result, and screenshots privately if useful. Do not mark these passed based on DOM tests.

## Installation and offline

- Install through Safari Share → Add to Home Screen. Initial installed launch online caches application files. Check manifest name/icon, standalone mode, safe top/bottom areas.
- Fresh launch starts Add; app switch/resume preserves an unfinished entry. iOS may decline automatic keyboard opening; one tap must focus the amount.
- With airplane mode and Wi-Fi disabled, cold-open, save expenses/income/refunds, search, edit, delete, rename/archive entities, and switch themes. All must work without network.
- Close/reopen and reboot the phone; confirm records persist. Storage permission denial must not block use.
- Deploy a code update to the same origin; ensure an update prompt appears and unsaved input remains until intentional reload. Existing database records must survive.

## Entry and history

- Enter 0.29, 85, 85.25, and 85,25. Reject negative/zero/three-decimal inputs and prevent rapid double-tap duplicate entries.
- Check all type/category combinations. Merchant selection starts empty; selecting a compatible default applies it, and a later manual category choice wins. Save resets amount/merchant/description/payment/date override while preserving category.
- Change category, switch type and back, navigate away/back, relaunch; verify per-type selections.
- Set an entry just before midnight on the last day of a month. Verify daily grouping and Home month totals; test a refund in the following month. Change device timezone and confirm reporting days remain unchanged.
- Check expense 100, income 50, refund 120: gross 100, net spending -20, cash flow 70 (all MXN).
- Link a refund to expense; delete original and verify refund survives with its link removed.
- Search and combine every filter. Clear filters. Verify newest/oldest sorting, filtered daily net and load-more behavior with over 60 records.
- Edit an entry without losing optional fields; cancel deletion, then confirm deletion. Dates/types can be edited to valid values.

## Management and accessibility

- Add, rename, archive/unarchive categories and merchants. History must preserve references. Try case/spacing duplicate merchant names, including archived names. Other cannot be archived/renamed.
- Select a merchant default of the opposite type; the current category should remain unchanged. Inspect merchant-filtered history.
- Select system/light/dark, change OS appearance while open, and relaunch. Settings preference and proper system following must persist.
- Test widths 320, 375, 390, 430 pixels, desktop width, and landscape. Check the four-column grid, long names, large amounts, date inputs, and no horizontal overflow.
- With keyboard open, scroll to optional fields and Save; ensure tab bar and safe areas do not block controls. Test hardware keyboard focus, dialog close/Escape, screen reader labels, 200% text zoom, and reduced motion.

## Storage/error resilience

- Simulate quota/IndexedDB denial; failed saves must retain input with visible error. Do not clear real financial data for testing.
- Open two windows; save/rename in one and focus the other. Verify refresh. Simultaneous edits are last-write-wins.
- In a disposable test profile, open a v2 database with a v1 app; it must refuse rather than erase it. Test blocked upgrade handling when implementing the next schema.

## Checkpoint 2 additions — NOT YET EXECUTED ON A REAL BROWSER/PHONE

### Upgrade

- With disposable v1 records in the actual browser, deploy v2 to the same origin/path and activate its worker. Keep linked refunds, archived categories/merchants, theme, and category choices. Confirm schema upgrade retains every old record and their amounts/dates.
- Keep a v1 tab open during upgrade; verify it closes its old database connection and requests a reload. Do not clear website data. Reopening a v1 build after upgrade must refuse without removing records.

### Recurring dates and deletion

- Add daily, weekly, monthly and yearly schedules with a past start. Missing dues must appear automatically with an in-app list, without a confirmation dialog for each due.
- Test monthly Jan 29, 30, 31 across leap/common February, April, and March; yearly Feb 29 across 2028. Check inclusive end and future start.
- Close the app over due dates; offline reopen must backfill once. Repeat launch/resume and open two windows simultaneously; ensure no duplicates.
- Delete one generated entry, relaunch/resume repeatedly, edit its schedule and repeat. The deleted occurrence must stay deleted while later anchored dates still post.
- Edit a generated entry's amount/date/type; its schedule must stay unchanged and its original occurrence must not be recreated.
- Pause across due dates without opening the app, then resume on a due date. Paused dates including resume day must be skipped. Next anchor date must post; no paused backlog.
- Edit amount/cadence/start/end: old dues through today settle using old terms; new terms apply after today. Generated rows remain unchanged. Delete a schedule and verify generated rows remain.
- Leave an unfinished manual entry, resume with a due schedule, and verify its amount/merchant/description remain. Inspect the added-entry list and dismiss it. Confirm background-closed execution is not implied.

### Budgets and analytical screens

- Overall 100 MXN: expense 80 triggers 80%; another 30 triggers 100%/overage and still saves. Income 1,000 leaves usage 110; refund 60 lowers usage to 50 and removes warnings.
- Test category-specific refunds, refund received next month for an older expense, refund exceeding month spending, archived-category limits, removal, and month/year reset without carry.
- On Home, switch Basic/Analytical and relaunch; selection persists. Test all range presets and custom inclusive dates, including invalid dates.
- Inspect daily/weekly/monthly/yearly chart series and slider with screen reader/hardware keyboard and touch. Toggle income/expense/refunds; check exact values and empty periods. Verify partial-edge weeks/months and Monday week start.
- Select a category, inspect merchant spending and largest entries, show more rows. Choose a long range requiring coarser chart intervals; financial totals must remain usable.
- Budget status must remain clearly labeled as current month even when summary dates show a previous month. Check widths 320/375/390/430 and landscape, internal table scrolling, large text, keyboard overlap, safe areas and reduced motion.

## Checkpoint 3 final acceptance — NOT EXECUTED IN A REAL BROWSER/PHONE

### Complete state and updates

- Deploy to the same origin/path with a real v1/v2 browser database. Activate the update without clearing site data. Verify every prior row, archived entity, theme, budget, schedule, deleted/skipped receipt and cursor.
- Confirm all application and lazy transfer/Excel chunks cache. Cold-open in airplane mode; perform a real CSV/XLSX download, file upload, JSON backup, restore, then relaunch. Verify no remote service is needed.

### Spreadsheet flow

- Export all/range selections; open CSV/XLSX in Excel/Numbers. Verify flat rows, separate Date/Time, actual numeric Amount, Summary category/month totals, and no merged/day headers. Test commas/newlines/Unicode and a formula-looking description that remains literal.
- Import a reordered external file, review mapping/row status/counts, verify no writes before confirmation, then confirm and inspect results. Repeat the same file and verify duplicates are skipped. Delete an imported record and repeat; it must remain excluded by provenance.
- Export a mixture of manual/automatic entries; import it into a disposable profile. Confirm automatic entries are visibly excluded, while manual valid rows can be imported. Preserve full automatic history through JSON instead.
- Test malformed quotes, invalid dates, negative/overprecision amounts, duplicate headers, formula/hyperlink/rich-text cells, unsupported/oversize files, and stale previews while another window writes. No partial financial/entity/provenance writes.

### JSON and recurrence after restoration

- Make a disposable database with ordinary entries, linked refunds, budgets, archived entities, schedules, one deleted occurrence, one paused/skipped date and an imported/deleted manual entry. Save complete JSON to Files, then press “I saved this backup.” Inspect all ten store arrays.
- Replace another disposable profile after validation/preview/acknowledgement. Verify original IDs/relationships/preferences/metadata/cursors/receipts. Reopen offline: due new dates should appear once; deleted/skipped dates must not return.
- Resume a restored paused schedule and verify its documented skip/resume-day behavior. Edit/delete generated entries without changing the schedule.
- Attempt corrupt JSON, missing stores/relationships, duplicate IDs, mismatched generated/deleted receipts, invalid currency/date/cursor and future format. Destination data must remain untouched.
- Merge compatible disjoint records; repeat idempotently. Try conflicts in edited records, schedule cursors and generated-vs-deleted receipts; every conflict must block the entire merge, preserving local deletion.
- Create a new record between preview/confirmation; stale restore must reject. Test a simulated browser storage failure in a disposable profile and confirm rollback. Do not experiment on the only copy of real records.

### Reminders, accessibility and mobile

- Reminder defaults off. Enable, confirm save, dismiss for this month, relaunch and test next calendar month. Download cancellation must not record a confirmed save automatically.
- On widths 320/375/390/430, landscape and text zoom: mapping controls, long validation messages, file input, preview table scrolling, confirmation controls and tab safe areas must remain usable.
- Keyboard-only/VoiceOver: skip link, dialog name/focus return, native selectors, preview caption/status/row headings, error and confirmation states, chart alternative controls. Confirm keyboard viewport handling never blocks saving/navigation after dismissal.
- Actually verify the Files download exists before acknowledging save. Download/picker UI varies by iOS version; this delivery does not claim that cycle was tested.

## Ledger 1.1 acceptance — pending on real iPhone / Safari

The user reports v1.0 was installed/tested successfully on an iPhone; this does not certify the update. The cloud browser could not reach this container's loopback preview (`ERR_CONNECTION_REFUSED`). DOM tests verify order/interaction but not actual layout/scrolling.

- Upgrade the existing Home Screen app at its unchanged URL via the existing update prompt. Verify schema-3 records, dark/system preferences, schedule skips/deletions and budgets survive. Do not clear storage/reinstall.
- At 320/375/390/430 px widths in both themes, compare the approved typography, navigation, category grid, type/amount controls and spacing. Scroll normally through merchant → category → description → payment → date/time/refund link → Save; verify keyboard and safe-area behavior.
- Select a method, None, Other without custom text, and Other with a custom label. Save and check reset. Add/rename/archive/unarchive in Settings; historical text must stay recorded.
- Open an edited transaction with a category override: opening must not change it. Change merchants with valid, missing, archived or incompatible defaults. Verify automatic selection only for a valid explicit merchant change; override manually and save.
- Combine History payment/type/category/merchant/date/amount/search filters; check legacy mixed-case/whitespace labels, referenced archives, custom labels and Unspecified.
- Save JSON, restore on a disposable profile, inspect new metadata and every occurrence receipt/cursor. Export/import CSV/XLSX and inspect payment columns in Numbers/Excel.
- Confirm Ready offline, then close/reopen in airplane mode (Wi-Fi off), record/edit a disposable entry, access payment management/filtering and data tools. Restore connectivity and verify the worker-update prompt without losing unfinished input.

## Ledger 1.2 — pending real iPhone/Safari acceptance

The cloud browser was unable to reach the local production preview (ERR_CONNECTION_REFUSED). DOM simulations verify behavior, not rendered mobile layout or keyboard/scrolling.

- Upgrade the existing installed PWA through the existing URL/update prompt; do not reinstall or clear storage. Compare themes/type-amount controls/category grid/navigation with 1.1 at 320/375/390/430 px widths; verify normal scrolling, touch, keyboard and safe areas.
- Type a one-time merchant, use it repeatedly, save and edit entries. It must appear in History/search/filter/analytics without entering Settings → Recurring merchants. Leave another merchant blank. Save as recurring explicitly, set a default category in Settings, select it, override the category, then type a one-time name; typing must not apply a default. Saving a merchant must not create a schedule/transaction.
- Test required payment selection on expenses, income and refunds, including Other with/without custom text, a managed method and reset after save. A legacy unspecified edit must be blocked until a method is selected; simply viewing/exporting/backing up must preserve it.
- In a disposable profile, restore a legacy snapshot containing a methodless schedule, valid schedules, deleted/skipped receipts, pauses and a cursor. Held schedules must be flagged and not post/advance. Correct the method, review catch-up notification and verify no duplication or deleted/skip resurrection after relaunch. Test paused correction and a month-end/leap anchor.
- CSV/XLSX: normal missing-method rows must fail; explicit historical compatibility must retain blank methods. Imported names must remain one-time even when a matching recurring entity exists. Check labels/numeric cells in Numbers/Excel. JSON must preserve both merchant forms and all old state.
- Verify Ready offline, then airplane-mode/Wi-Fi-off cold launch, one-time entry, required payment, history/analytics/settings and data tools. Reconnect and test worker update without losing unfinished input. No actual iPhone 1.2 result is recorded here.
