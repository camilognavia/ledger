import { savePaymentMethod } from "./db";
import { lazy, Suspense, useState } from "react";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react";
import {
  icons,
  type PaymentMethod,
  type Budget,
  type RecurringSchedule,
  type Category,
  type Merchant,
  type Preferences,
  type Snapshot,
} from "./model";
import { CategoryIcon } from "./icons";
import { BudgetManager, ScheduleManager } from "./FinanceSettings";
import type { LedgerDB } from "./db";
const DataTools = lazy(() =>
  import("./DataTools").then((m) => ({ default: m.DataTools })),
);
import { Modal } from "./History";
export function Settings({
  data,
  onAppearance,
  onCategory,
  onMerchant,
  onMerchantHistory,
  storage,
  pwaStatus,
  onUpdate,
  onBudget,
  onDeleteBudget,
  onSchedule,
  onDeleteSchedule,
  db,
  onDataChanged,
}: {
  data: Snapshot;
  db: LedgerDB;
  onDataChanged: (restored?: boolean) => Promise<void>;
  onAppearance: (a: Preferences["appearance"]) => Promise<boolean>;
  onCategory: (c: Category) => Promise<boolean>;
  onMerchant: (m: Merchant) => Promise<boolean>;
  onMerchantHistory: (id: string) => void;
  storage: string;
  pwaStatus: string;
  onUpdate?: () => void;
  onBudget: (b: Budget) => Promise<boolean>;
  onDeleteBudget: (id: string) => Promise<boolean>;
  onSchedule: (s: RecurringSchedule, editing: boolean) => Promise<boolean>;
  onDeleteSchedule: (id: string) => Promise<boolean>;
}) {
  const [section, setSection] = useState<
    | "payments"
    | "main"
    | "categories"
    | "merchants"
    | "about"
    | "budgets"
    | "recurring"
    | "transfer"
  >("main");
  const [payment, setPayment] = useState<PaymentMethod>();
  const [paymentError, setPaymentError] = useState("");
  const [category, setCategory] = useState<Category>();
  const [merchant, setMerchant] = useState<Merchant>();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (category && (await onCategory(category))) setCategory(undefined);
      if (merchant && (await onMerchant(merchant))) setMerchant(undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {section !== "main" && (
        <button
          className="back"
          onClick={() => {
            setSection("main");
            setQuery("");
          }}
        >
          <ArrowLeft size={16} /> Settings
        </button>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow" aria-hidden="true">
            &nbsp;
          </p>
          <h1>
            {section === "main"
              ? "Settings"
              : section === "payments"
                ? "Payment methods"
                : section === "categories"
                  ? "Categories"
                  : section === "merchants"
                    ? "Merchants"
                    : section === "budgets"
                      ? "Budgets"
                      : section === "recurring"
                        ? "Recurring transactions"
                        : section === "transfer"
                          ? "Data & backups"
                          : "About Ledger"}
          </h1>
        </div>
      </div>
      {section === "main" && (
        <>
          <section className="settings-section">
            <h2>Appearance</h2>
            <p className="hint" aria-hidden="true">
              &nbsp;
            </p>
            <div className="segmented">
              {(["system", "light", "dark"] as const).map((a) => (
                <button
                  key={a}
                  aria-pressed={data.preferences.appearance === a}
                  onClick={() => onAppearance(a)}
                >
                  {a === "system" ? "System" : a === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </section>
          <section className="settings-section">
            <h2>Your ledger</h2>
            {(
              [
                "categories",
                "merchants",
                "payments",
                "recurring",
                "budgets",
                "transfer",
                "about",
              ] as const
            ).map((s) => (
              <button
                className="settings-link"
                key={s}
                onClick={() => setSection(s)}
              >
                <span>
                  {s === "payments"
                    ? "Payment methods"
                    : s === "about"
                      ? "Storage & installation"
                      : s === "recurring"
                        ? "Recurring transactions"
                        : s === "transfer"
                          ? "Data & backups"
                          : s[0].toUpperCase() + s.slice(1)}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </section>
          <p className="hint version">
            Ledger · v1.1.0
            <br />
            &nbsp;
          </p>
        </>
      )}
      {section === "payments" && (
        <>
          <p className="hint">
            Renaming changes future choices. Existing entries keep their
            recorded payment label. Archive to hide a method from new entries.
          </p>
          <button
            className="secondary wide"
            onClick={() => {
              setPaymentError("");
              setPayment({
                id: crypto.randomUUID(),
                name: "",
                normalizedName: "",
                archived: false,
              });
            }}
          >
            <Plus size={16} /> Add payment method
          </button>
          <section className="settings-section">
            {data.paymentMethods.map((method) => (
              <button
                className="entity-row"
                key={method.id}
                onClick={() => {
                  setPaymentError("");
                  setPayment({ ...method });
                }}
              >
                <span>
                  {method.name}
                  <small>{method.archived ? "Archived" : ""}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </section>
        </>
      )}
      {payment && (
        <Modal
          title={
            data.paymentMethods.some((m) => m.id === payment.id)
              ? "Edit payment method"
              : "New payment method"
          }
          onClose={() => setPayment(undefined)}
        >
          <form
            className="optional-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setPaymentError("");
              try {
                await savePaymentMethod(db, payment);
                await onDataChanged();
                setPayment(undefined);
              } catch (error) {
                setPaymentError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={80}
                value={payment.name}
                onChange={(e) =>
                  setPayment({ ...payment, name: e.target.value })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={payment.archived}
                onChange={(e) =>
                  setPayment({ ...payment, archived: e.target.checked })
                }
              />
              Archived (hide from new entries)
            </label>
            {paymentError && (
              <p role="alert" className="error">
                {paymentError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save payment method
            </button>
          </form>
        </Modal>
      )}
      {section === "transfer" && (
        <Suspense fallback={<p role="status">Opening data tools…</p>}>
          <DataTools db={db} data={data} onChanged={onDataChanged} />
        </Suspense>
      )}
      {section === "budgets" && (
        <BudgetManager
          data={data}
          onSave={onBudget}
          onDelete={onDeleteBudget}
        />
      )}
      {section === "recurring" && (
        <ScheduleManager
          data={data}
          onSave={onSchedule}
          onDelete={onDeleteSchedule}
        />
      )}
      {section === "categories" && (
        <>
          <p className="hint">
            Archive categories to hide them from new entries. Existing entries
            keep their category. Other stays available.
          </p>
          <button
            className="secondary wide"
            onClick={() =>
              setCategory({
                id: crypto.randomUUID(),
                kind: "expense",
                name: "",
                icon: "circle",
                color: "",
                archived: false,
              })
            }
          >
            <Plus size={16} /> Add category
          </button>
          {(["expense", "income"] as const).map((kind) => (
            <section className="settings-section" key={kind}>
              <h2>{kind === "expense" ? "Expense & refund" : "Income"}</h2>
              {data.categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <button
                    className="entity-row"
                    key={c.id}
                    onClick={() => setCategory({ ...c })}
                  >
                    <CategoryIcon name={c.icon} />
                    <span>
                      {c.name}
                      <small>
                        {c.archived
                          ? "Archived"
                          : c.isFallback
                            ? "Default fallback"
                            : ""}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
            </section>
          ))}
        </>
      )}
      {section === "merchants" && (
        <>
          <p className="hint">
            Selecting a merchant applies its default category. You can change
            it.
          </p>
          <input
            aria-label="Search saved merchants"
            type="search"
            placeholder="Search saved merchants"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="secondary wide"
            onClick={() =>
              setMerchant({
                id: crypto.randomUUID(),
                name: "",
                normalizedName: "",
                archived: false,
              })
            }
          >
            <Plus size={16} /> Add merchant
          </button>
          {data.merchants
            .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => (
              <div key={m.id} className="merchant-row">
                <button
                  className="entity-row"
                  onClick={() => setMerchant({ ...m })}
                >
                  <span>
                    {m.name}
                    <small>
                      {m.archived
                        ? "Archived"
                        : data.categories.find(
                            (c) => c.id === m.defaultCategoryId,
                          )?.name || "No default category"}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
                <button
                  className="text-button"
                  onClick={() => onMerchantHistory(m.id)}
                >
                  View transactions
                </button>
              </div>
            ))}
          {!data.merchants.length && (
            <p className="hint">No saved merchants yet.</p>
          )}
        </>
      )}
      {section === "about" && (
        <>
          <section className="settings-section">
            <h2>On this device</h2>
            <p>
              {data.transactions.length} transactions · {data.merchants.length}{" "}
              merchants
            </p>
            <p className="hint">IndexedDB database · Schema 3 · MXN</p>
            <p className="hint">{storage}</p>
            <p>{pwaStatus}</p>
            {onUpdate && (
              <button className="secondary" onClick={onUpdate}>
                Install update & reload
              </button>
            )}
          </section>
          <section className="settings-section">
            <h2>Install on iPhone</h2>
            <p>
              Open your deployed HTTPS address in Safari. Tap Share → Add to
              Home Screen → Add. Open Ledger from its new icon while online
              once, and wait for “Ready offline” here.
            </p>
            <p className="hint">
              Start recording in the installed app. Safari and Home Screen
              storage can differ. Closing or switching apps preserves your
              entries.
            </p>
          </section>
          <section className="settings-section">
            <h2>Storage matters</h2>
            <p className="hint">
              Your records stay in this browser on this device. Clearing website
              data, removing the app, or browser eviction may erase them.
              Persistent storage is requested where supported, but retention is
              not guaranteed.
            </p>
            <p className="hint">
              Save a complete JSON backup in Settings → Data & backups.
              CSV/Excel files transfer manual records; use JSON to preserve all
              recurring history and settings.
            </p>
          </section>
        </>
      )}
      {category && (
        <Modal
          title={
            data.categories.some((c) => c.id === category.id)
              ? "Edit category"
              : "New category"
          }
          onClose={() => setCategory(undefined)}
        >
          <form onSubmit={submit} className="optional-fields">
            <label>
              Name
              <input
                autoFocus
                value={category.name}
                maxLength={50}
                required
                disabled={category.isFallback}
                onChange={(e) =>
                  setCategory({ ...category, name: e.target.value })
                }
              />
            </label>
            <label>
              Type
              <select
                value={category.kind}
                disabled={data.categories.some((c) => c.id === category.id)}
                onChange={(e) =>
                  setCategory({
                    ...category,
                    kind: e.target.value as Category["kind"],
                  })
                }
              >
                <option value="expense">Expense & refund</option>
                <option value="income">Income</option>
              </select>
            </label>
            <fieldset>
              <legend>Icon</legend>
              <div className="icon-picker">
                {icons.map((icon) => (
                  <button
                    type="button"
                    aria-label={icon}
                    aria-pressed={icon === category.icon}
                    key={icon}
                    onClick={() => setCategory({ ...category, icon })}
                  >
                    <CategoryIcon name={icon} />
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Optional color</legend>
              <div className="colors">
                {[
                  ["", "Neutral"],
                  ["#73735c", "Olive"],
                  ["#97715a", "Clay"],
                  ["#82748a", "Mauve"],
                  ["#738679", "Sage"],
                ].map(([color, label]) => (
                  <button
                    type="button"
                    key={label}
                    aria-label={label}
                    aria-pressed={category.color === color}
                    style={{ color: color || undefined }}
                    onClick={() => setCategory({ ...category, color })}
                  >
                    ●
                  </button>
                ))}
              </div>
            </fieldset>
            {!category.isFallback && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={category.archived}
                  onChange={(e) =>
                    setCategory({ ...category, archived: e.target.checked })
                  }
                />
                Archived (hide from new entries)
              </label>
            )}
            <button className="primary" disabled={busy}>
              Save category
            </button>
          </form>
        </Modal>
      )}
      {merchant && (
        <Modal
          title={
            data.merchants.some((m) => m.id === merchant.id)
              ? "Edit merchant"
              : "New merchant"
          }
          onClose={() => setMerchant(undefined)}
        >
          <form onSubmit={submit} className="optional-fields">
            <label>
              Name
              <input
                autoFocus
                value={merchant.name}
                maxLength={80}
                required
                onChange={(e) =>
                  setMerchant({ ...merchant, name: e.target.value })
                }
              />
            </label>
            <label>
              Default category (optional)
              <select
                value={merchant.defaultCategoryId || ""}
                onChange={(e) =>
                  setMerchant({
                    ...merchant,
                    defaultCategoryId: e.target.value || undefined,
                  })
                }
              >
                <option value="">None</option>
                {data.categories
                  .filter(
                    (c) => !c.archived || c.id === merchant.defaultCategoryId,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.kind})
                    </option>
                  ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={merchant.archived}
                onChange={(e) =>
                  setMerchant({ ...merchant, archived: e.target.checked })
                }
              />
              Archived (hide from new entries)
            </label>
            <p className="hint">
              Archiving preserves existing transactions and prevents new
              duplicates. Unarchive here to use this merchant again.
            </p>
            <button className="primary" disabled={busy}>
              Save merchant
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
