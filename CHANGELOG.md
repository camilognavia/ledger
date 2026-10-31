# Ledger changelog

## 1.2.0 — 2026-10-31 (America/Mexico_City)

Two targeted behavioral updates on the delivered Ledger 1.1 source; approved design preserved.

- **One-time and Recurring merchants:** type a one-time name or leave it blank; explicitly select/save a Recurring merchant for reuse/default categories. Rename Settings accordingly and preserve existing IDs/archives/associations. Never save merchants automatically from repeated use, edits or imports. History, search/filtering, merchant analytics, CSV/XLSX and JSON support both forms without merging stored records.
- **Required payment methods:** all new/manual transaction edits and schedule saves require explicit selection, for expense/income/refund alike. Preserve Other/custom and management; remove selectable None. Keep historical unspecified values intact. Flag/hold methodless legacy schedules without advancing their cursor, then catch up old terms exactly once after correction; retain every deletion/skip receipt.
- Schema **4→5** advances metadata only, adding support for optional transaction merchantName without rewriting records/stores. Older JSON restores atomically with missing methods preserved. Normal spreadsheet imports reject missing payments; explicit historical compatibility can recover them without assigning a method. Imported merchants stay one-time.
- **211 tests pass**, plus lint, TypeScript, production, static PWA and timezone checks. CSS, type/amount controls, category grid, financial/calendar calculations, dependency versions, PWA identity and deployment configuration unchanged.

Real-browser preview was attempted but cloud Chrome could not reach the container's local server. Mobile layout/scrolling, runtime offline/update and iPhone/Safari acceptance remain unverified for 1.2. No deployment performed. See INSTALL.md, DATA_FORMAT.md and TEST_REPORT.md.

## Previous release

Ledger 1.1 introduced managed payment choices, always-visible entry details, merchant-first category defaults, quieter copy and payment History filtering. Its report is retained in tests/fixtures/test-report-v1.1.md.
