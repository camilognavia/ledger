# Install Ledger without a Mac or paid service

## Option A: free GitHub Pages (prepared workflow)

1. Create a free GitHub account if needed, then a **public** repository named `ledger` (GitHub Free supports Pages for public repositories). This publishes application source and static files, **not** your device's IndexedDB records. Never put financial records in the repository.
2. Unzip the package. Put the contents of its `ledger/` folder at the **repository root**, including `package.json`, `package-lock.json`, `src`, `public`, and `.github/workflows/deploy.yml`. With Git, from that folder:

   ```sh
   git init
   git add .
   git commit -m "Ledger checkpoint 3"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/ledger.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME`. GitHub authentication is handled by your normal Git setup. No credentials belong in source files. Alternatively upload files through GitHub; make sure the hidden `.github` directory is included.
3. In repository **Settings → Pages → Build and deployment**, set **Source: GitHub Actions**.
4. Open **Actions → Deploy Ledger to GitHub Pages → Run workflow**, selecting `main`. Later pushes to `main` run it automatically. If the initial push ran before Pages was enabled, rerun the workflow now.
5. Wait for all checks and deployment to pass. Open the HTTPS URL from the deployment, normally `https://YOUR-USERNAME.github.io/ledger/` (include the trailing slash). The relative Vite base and relative manifest scope support repository subpaths.

The workflow installs pinned dependencies, runs tests/lint, builds, checks PWA assets, and deploys `dist/`. Only the final repository/account steps are user-controlled and unexecuted here. GitHub's menus and terms may change; see its official Pages documentation linked in README.

## Option B: any static HTTPS host

Build with `npm ci` then `npm run build`. Upload **the contents of `dist/`**, preserving filenames and `assets/`, to a free static HTTPS host of your choice. No Node server or backend is needed at runtime. Use a stable host/path with a trailing slash. Files must be served with correct content types, including JavaScript for `sw.js`.

Do not configure an application login, analytics scripts, CDN library URLs, or a database service. Do not cache `sw.js` or `index.html` indefinitely at the host. Hashed `assets/*` files may be immutable. If hosted under a subfolder, keep the entire app there. Avoid multiple independently deployed Ledger copies on one origin unless you intend them to share the origin's local database.

## Safari → iPhone Home Screen

1. In iPhone **Safari**, open the deployed HTTPS URL while online.
2. Tap **Share → Add to Home Screen**. If your iOS version shows **Open as Web App**, leave it enabled. Tap **Add**.
3. Open Ledger using the new Home Screen icon **while still online**. Install before entering important data: Safari and the Home Screen app can have separate local storage, and the first installed launch may start empty.
4. In Ledger, open **Settings → Storage & installation**. Wait for **Ready offline**, or an active-worker status. An active worker alone is not a substitute for the airplane-mode test below.
5. Close and reopen Ledger from its icon. It should open **Add**. Put the phone in airplane mode, ensure Wi-Fi is also off, and reopen it again. Add a small test expense. Close/reopen, find it in History, edit it, and then delete it. Confirm Home totals follow the changes.
6. Reenable connectivity after testing. Application files update when online; the app asks before activating an update. Finish an unsaved entry first, then use **Install update & reload** in Settings.

No Apple Developer account, App Store submission, Mac, push permission, or subscription is involved. There is no cross-device synchronization. iOS decides keyboard autofocus behavior; tap the large amount field if the keyboard does not open automatically.

## Keep your data available

Keep the same HTTPS **origin** (scheme + hostname + port) for future checkpoints. A new origin has a different IndexedDB and will appear empty. Path changes on the same origin may affect service-worker installation; keep the same app path too. Desktop development and production preview use different ports and therefore different databases.

Do not clear website data or uninstall the Home Screen app to fix a display/update problem. Try closing other Ledger windows and reloading first. Browser storage can be evicted despite a persistence request. Save regular complete JSON backups in Settings → Data & backups and keep independent copies. The app does not encrypt the database itself.

For mobile checks beyond basic installation, use [MANUAL_QA.md](MANUAL_QA.md). No actual iPhone installation or Safari test has been performed for this delivery.


## Update Checkpoint 1 or 2 to Checkpoint 3

Keep the existing HTTPS origin and app path. Deploy the new `dist/` contents, preserving filenames/subdirectories. Finish an unsaved entry before choosing Settings → Storage & installation → Install update & reload. Close other Ledger windows if asked; they may hold an old database connection.

Opening this release upgrades schema 1→2→3 automatically. It retains all existing financial rows, categories, merchants, IDs, timestamps, refund links, preferences, schedules, occurrence receipts/tombstones, cursors and budgets. Schema 3 adds an import receipt store; backup reminders default off. It does not clear/reseed an initialized database.

Do not uninstall, clear website data, change origin or delete the database to upgrade. Old builds intentionally refuse newer database versions. After upgrading, inspect existing records in History, then download a complete JSON backup from Settings → Data & backups. A CSV/XLSX export is useful for analysis but does not preserve the complete application state.

## Save and restore on iPhone

In Settings → Data & backups, tap Download JSON backup. Use the browser's download/share/Files interface to save it. Tap “I saved this backup” only after confirming that the file exists. Exact download UI differs by iOS version and remains unverified in this delivery.

To restore, choose the JSON file, review its validation result, choose Replace or Merge, and tap Preview restore. Read the resulting counts, check the acknowledgement, then press the explicit confirmation button. No data changes before that final action. Replace returns every store to the snapshot; Merge adds compatible records and rejects all conflicts. Save current data first. See DATA_FORMAT.md for full semantics.

After restore, reopen/resume the app to reconcile missing dues from the restored cursors. Keep deletion/skip receipts; do not transfer only transactions when moving a recurring setup. For a new phone/origin, complete JSON restore is the supported manual move. There is no automatic cloud synchronization.
