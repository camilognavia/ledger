# Ledger changelog

## 1.1.0 — 2026-10-21 UTC

A targeted continuation of the delivered Checkpoint 3 (1.0.0), with no redesign.

- Replace payment text entry with an optional native dropdown and Other/custom field; reuse it in schedule editing. Add Settings payment-method creation, rename and archive/unarchive.
- Add schema 4 payment metadata non-destructively. Keep recorded transaction/schedule text unchanged, including legacy values. Renames affect future choices; historical labels remain searchable by filter, editable, exportable and backed up.
- Keep all entry details visible, in merchant → category → description → payment → date/time/refund order. Preserve the type/amount controls and post-save reset. Explicit merchant changes apply compatible active defaults; opening an edit keeps its saved category and users can override defaults.
- Remove decorative slogans/redundant appearance copy, retaining their line boxes/whitespace. Preserve financial explanations, accessibility names, validation and data-loss/destructive warnings.
- Add History payment filtering across active choices, referenced archives, custom/legacy labels and Unspecified. Combine with all current filters; normalize only option matching, never financial rows.
- Include payment metadata in complete atomic JSON restoration/strict merge. Normalize older backups without changing existing values. Keep CSV/XLSX columns, numeric amounts, recurring identity guards and deduplication unchanged.
- Add 21 focused tests. All 177 tests, lint, TypeScript, production build, static PWA and regional checks pass. Approved stylesheet, type/amount markup, assets/navigation, finance/recurrence engines, dependencies and deployment configuration are preserved.

Real-browser preview was attempted but the cloud browser could not reach the local server. Mobile scrolling, runtime offline and iPhone/Safari acceptance remain unverified for 1.1. See TEST_REPORT.md and INSTALL.md for verification and upgrade details. No deployment was performed.
