import { useCallback, useEffect, useRef, useState } from "react";
import { House, List, Plus, Settings as SettingsIcon, X } from "lucide-react";
import {
  deleteTransaction,
  openLedger,
  saveAppearance,
  saveLastCategory,
  saveCategory,
  saveMerchant,
  saveTransaction,
  snapshot,
  saveBudget,
  deleteBudget,
  saveSummaryMode,
  saveBackupPreference,
  type LedgerDB,
} from "./db";
import { localParts, money, type Snapshot, type Transaction } from "./model";
import { TransactionForm } from "./TransactionForm";
import { History } from "./History";
import { Settings } from "./Settings";
import { NoticeContext } from "./notices";
import { Summary } from "./Summary";
import { BudgetWarnings } from "./FinanceSettings";
import { backupReminderDue } from "./reminders";
import { reconcile, saveSchedule, deleteSchedule } from "./recurrence";
export interface PWAState {
  status: string;
  update?: () => void;
}
export default function App({
  database,
  pwa = { status: "Offline status available after production installation." },
}: {
  database?: LedgerDB;
  pwa?: PWAState;
}) {
  const [data, setData] = useState<Snapshot>();
  const [db, setDb] = useState<LedgerDB>();
  const [fatal, setFatal] = useState("");
  const [tab, setTab] = useState("Add");
  const [toast, setToast] = useState("");
  const [automatic, setAutomatic] = useState<Transaction[]>([]);
  const [autoLimit, setAutoLimit] = useState(20);
  const [reconcileError, setReconcileError] = useState("");
  const [storage, setStorage] = useState("Checking persistent storage…");
  const [merchantHistory, setMerchantHistory] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announce = useCallback((added: Transaction[]) => {
    if (added.length)
      setAutomatic((old) => [
        ...new Map([...old, ...added].map((t) => [t.id, t])).values(),
      ]);
  }, []);
  const refresh = useCallback(async (d: LedgerDB) => {
    setData(await snapshot(d));
  }, []);
  useEffect(() => {
    let cancelled = false;
    let owned: LedgerDB | undefined;
    void (async () => {
      try {
        const d = database || (await openLedger());
        if (!database) owned = d;
        if (cancelled) {
          owned?.close();
          return;
        }
        try {
          announce(await reconcile(d));
        } catch (e) {
          setReconcileError(
            `Recurring entries could not be reconciled: ${(e as Error).message}`,
          );
        }
        await refresh(d);
        setDb(d);
      } catch (e) {
        if (!cancelled)
          setFatal(`Cannot open your local ledger: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      owned?.close();
    };
  }, [database, refresh, announce]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const persisted = await navigator.storage?.persist?.();
        if (live)
          setStorage(
            persisted
              ? "Persistent storage granted. Keep regular JSON backups too."
              : "Storage is best effort; iOS may remove it.",
          );
      } catch {
        if (live)
          setStorage(
            "Persistent storage could not be requested. Storage is best effort.",
          );
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    const version = () =>
      setFatal(
        "Ledger was updated in another window. Close other Ledger windows, then reload.",
      );
    const blocked = () =>
      setFatal(
        "Close other Ledger windows, then reload to finish the database upgrade.",
      );
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    window.addEventListener("ledger-versionchange", version);
    window.addEventListener("ledger-blocked", blocked);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
      window.removeEventListener("ledger-versionchange", version);
      window.removeEventListener("ledger-blocked", blocked);
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme =
        data.preferences.appearance === "system"
          ? mq.matches
            ? "dark"
            : "light"
          : data.preferences.appearance;
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#191918" : "#faf9f6");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [data]);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const update = () =>
      document.documentElement.classList.toggle(
        "keyboard-open",
        v.height < document.documentElement.clientHeight - 140,
      );
    v.addEventListener("resize", update);
    return () => {
      v.removeEventListener("resize", update);
      document.documentElement.classList.remove("keyboard-open");
    };
  }, []);
  const channel = useRef<BroadcastChannel | undefined>(undefined);
  useEffect(() => {
    if (!db) return;
    const reload = () => {
      void (async () => {
        try {
          announce(await reconcile(db));
          setReconcileError("");
          channel.current?.postMessage("reconciled");
        } catch (e) {
          setReconcileError(
            `Recurring entries could not be reconciled: ${(e as Error).message}`,
          );
        }
        await refresh(db);
      })().catch((e) => setFatal((e as Error).message));
    };
    const focus = () => {
      if (document.visibilityState === "visible") reload();
    };
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("ledger-updates");
      channel.current.onmessage = () => {
        void refresh(db).catch((e) => setFatal((e as Error).message));
      };
    }
    window.addEventListener("focus", reload);
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", focus);
      channel.current?.close();
      channel.current = undefined;
    };
  }, [db, refresh, announce]);
  async function run(work: () => Promise<void>, message: string) {
    try {
      await work();
      await refresh(db!);
      channel.current?.postMessage("updated");
      if (message) {
        setToast(message);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(""), 4500);
      }
      return true;
    } catch (e) {
      setToast(
        (e as Error).message || "Could not save. Your input has been kept.",
      );
      return false;
    }
  }
  const onSave = (t: Transaction, editing: boolean) =>
    run(
      () => saveTransaction(db!, t, editing),
      editing ? "Transaction updated" : "Transaction saved",
    );
  if (fatal)
    return (
      <main className="loading">
        <h1>Your ledger needs attention</h1>
        <p role="alert">{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          Reload
        </button>
        <p>Do not clear website data; it contains your records.</p>
      </main>
    );
  if (!data || !db)
    return (
      <main className="loading" role="status">
        Opening your ledger…
      </main>
    );
  return (
    <NoticeContext.Provider value={toast}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="brand-bar">
          <span className="wordmark">
            ledger<span>.</span>
          </span>
          <span className="local-label">
            <span className="status-dot" />
            {online ? "LOCAL & PRIVATE" : "OFFLINE"}
          </span>
        </header>
        {reconcileError && (
          <p className="error" role="alert">
            {reconcileError}{" "}
            <button
              className="text-button"
              onClick={() =>
                void (async () => {
                  try {
                    announce(await reconcile(db));
                    setReconcileError("");
                    await refresh(db);
                  } catch (e) {
                    setReconcileError((e as Error).message);
                  }
                })()
              }
            >
              Retry reconciliation
            </button>
          </p>
        )}
        {!!automatic.length && (
          <section
            className="automatic-notice"
            aria-label="Automatically added transactions"
          >
            <details open>
              <summary>
                {automatic.length} recurring{" "}
                {automatic.length === 1 ? "transaction" : "transactions"} added
              </summary>
              <ul>
                {automatic.slice(0, autoLimit).map((t) => (
                  <li key={t.id}>
                    {t.localDate} ·{" "}
                    {data.schedules.find((s) => s.id === t.recurringScheduleId)
                      ?.name || "Recurring entry"}{" "}
                    · {t.type} · {money(t.amount)}
                  </li>
                ))}
              </ul>
              {automatic.length > autoLimit && (
                <button
                  className="text-button"
                  onClick={() => setAutoLimit((n) => n + 50)}
                >
                  Show more automatic entries
                </button>
              )}
            </details>
            <button
              className="text-button"
              onClick={() => {
                setAutomatic([]);
                setAutoLimit(20);
              }}
            >
              Dismiss automatic entries
            </button>
          </section>
        )}
        {backupReminderDue(data) && (
          <aside
            className="backup-reminder"
            aria-label="Monthly backup reminder"
          >
            <span>
              A monthly JSON backup is due. Save one in Settings → Data &
              backups.
            </span>
            <button
              className="text-button"
              onClick={() =>
                void run(
                  () =>
                    saveBackupPreference(db, {
                      backupReminderDismissedMonth:
                        localParts().localDate.slice(0, 7),
                    }),
                  "Reminder dismissed for this month",
                )
              }
            >
              Dismiss this month
            </button>
          </aside>
        )}
        <BudgetWarnings data={data} />
        <main
          id="main-content"
          className="content"
          tabIndex={-1}
          aria-label={tab}
          key={tab}
        >
          {tab === "Add" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
                  <h1>Add transaction</h1>
                </div>
                <span className="date-label">
                  {new Date().toLocaleDateString("en-MX", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <TransactionForm
                data={data}
                onSave={onSave}
                onCategorySelect={(type, id) => {
                  void run(() => saveLastCategory(db, type, id), "");
                }}
              />
            </>
          )}
          {tab === "History" && (
            <History
              data={data}
              onSave={onSave}
              initialMerchant={merchantHistory}
              onDelete={(id) =>
                run(() => deleteTransaction(db, id), "Transaction deleted")
              }
            />
          )}
          {tab === "Home" && (
            <Summary
              data={data}
              onMode={(mode) => run(() => saveSummaryMode(db, mode), "")}
            />
          )}
          {tab === "Settings" && (
            <Settings
              data={data}
              db={db}
              onDataChanged={async (restored) => {
                if (restored) {
                  setAutomatic([]);
                  setReconcileError("");
                }
                await refresh(db);
                channel.current?.postMessage("updated");
              }}
              storage={storage}
              pwaStatus={pwa.status}
              onUpdate={pwa.update}
              onBudget={(b) => run(() => saveBudget(db, b), "Budget saved")}
              onDeleteBudget={(id) =>
                run(() => deleteBudget(db, id), "Budget removed")
              }
              onSchedule={(s, editing) =>
                run(async () => {
                  announce(await saveSchedule(db, s, editing));
                }, "Schedule saved")
              }
              onDeleteSchedule={(id) =>
                run(() => deleteSchedule(db, id), "Schedule deleted")
              }
              onAppearance={(a) =>
                run(() => saveAppearance(db, a), "Appearance saved")
              }
              onCategory={(c) =>
                run(() => saveCategory(db, c), "Category saved")
              }
              onMerchant={(m) =>
                run(() => saveMerchant(db, m), "Merchant saved")
              }
              onMerchantHistory={(id) => {
                setMerchantHistory(id);
                setTab("History");
              }}
            />
          )}
        </main>
        <nav className="tab-bar" aria-label="Primary navigation">
          {[
            { name: "Home", icon: House },
            { name: "History", icon: List },
            { name: "Add", icon: Plus },
            { name: "Settings", icon: SettingsIcon },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => {
                if (name === "History") setMerchantHistory("");
                setTab(name);
                window.scrollTo?.(0, 0);
              }}
            >
              <span>
                <Icon size={21} strokeWidth={tab === name ? 2 : 1.5} />
              </span>
              {name}
            </button>
          ))}
        </nav>
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <button aria-label="Dismiss message" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </NoticeContext.Provider>
  );
}
