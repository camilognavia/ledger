import { useContext, useEffect, useRef, useState, useId } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  emptyFilters,
  filterTransactions,
  money,
  type Filters,
  type Snapshot,
  type Transaction,
} from "./model";
import { NoticeContext } from "./notices";
import { CategoryIcon } from "./icons";
import { TransactionForm } from "./TransactionForm";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const notice = useContext(NoticeContext);
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    if (el && !el.open) el.showModal();
    return () => {
      el?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      aria-labelledby={titleId}
      className="modal"
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      {children}
      {notice && (
        <p role="status" className="hint">
          {notice}
        </p>
      )}
    </dialog>
  );
}
export function History({
  data,
  onSave,
  onDelete,
  initialMerchant = "",
}: {
  data: Snapshot;
  onSave: (t: Transaction, editing: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  initialMerchant?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    ...emptyFilters,
    merchantId: initialMerchant,
  });
  const [limit, setLimit] = useState(60);
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState(false);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setLimit(60);
  };
  let results: Transaction[] = [];
  let filterError = "";
  try {
    results = filterTransactions(data.transactions, data.merchants, filters);
  } catch {
    filterError = "Amounts must be positive, with up to two decimal places.";
  }
  if (filters.from && filters.to && filters.from > filters.to)
    filterError = "Start date must not follow end date.";
  const dayTotals = new Map<string, number>();
  for (const row of results)
    dayTotals.set(
      row.localDate,
      (dayTotals.get(row.localDate) || 0) +
        (row.type === "expense" ? -row.amount : row.amount),
    );
  const visible = results.slice(0, limit);
  const groups = new Map<string, Transaction[]>();
  for (const row of visible) {
    groups.set(row.localDate, [...(groups.get(row.localDate) || []), row]);
  }
  const active = data.transactions.find((t) => t.id === selected);
  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const merchant = (id?: string) => data.merchants.find((m) => m.id === id);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE EVERYDAY, RECORDED</p>
          <h1>History</h1>
        </div>
        <span className="count">{results.length} entries</span>
      </div>
      <label className="search-field">
        <Search size={18} />
        <input
          type="search"
          aria-label="Search history"
          placeholder="Search merchants or descriptions"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
        />
      </label>
      <details className="filters">
        <summary>
          <SlidersHorizontal size={16} /> Filters & sort{" "}
          <span>
            {Object.entries(filters).filter(
              ([k, v]) => k !== "order" && k !== "query" && v,
            ).length || ""}
          </span>
        </summary>
        <div className="optional-fields">
          <div className="two-col">
            <label>
              Type
              <select
                value={filters.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="">All types</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="refund">Refund</option>
              </select>
            </label>
            <label>
              Sort
              <select
                value={filters.order}
                onChange={(e) =>
                  set("order", e.target.value as Filters["order"])
                }
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <label>
            Category
            <select
              value={filters.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
            >
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} ({c.kind}){c.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Merchant
            <select
              value={filters.merchantId}
              onChange={(e) => set("merchantId", e.target.value)}
            >
              <option value="">All merchants</option>
              {data.merchants.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                  {m.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="two-col">
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(e) => set("from", e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={filters.to}
                onChange={(e) => set("to", e.target.value)}
              />
            </label>
          </div>
          <div className="two-col">
            <label>
              Minimum MXN
              <input
                inputMode="decimal"
                placeholder="No minimum"
                value={filters.min}
                onChange={(e) => set("min", e.target.value)}
              />
            </label>
            <label>
              Maximum MXN
              <input
                inputMode="decimal"
                placeholder="No maximum"
                value={filters.max}
                onChange={(e) => set("max", e.target.value)}
              />
            </label>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setFilters(emptyFilters);
              setLimit(60);
            }}
          >
            Clear filters
          </button>
        </div>
      </details>
      {filterError && (
        <p role="alert" className="error">
          {filterError}
        </p>
      )}
      {!results.length && !filterError && (
        <div className="empty-state">
          <div className="empty-symbol">—</div>
          <h2>
            {data.transactions.length ? "No matching entries" : "A clean slate"}
          </h2>
          <p>
            {data.transactions.length
              ? "Try a different search or filter."
              : "Your transactions will appear here."}
          </p>
        </div>
      )}
      {[...groups].map(([day, rows]) => (
        <section key={day} className="day-group">
          <header>
            <h2>
              {new Date(day + "T12:00:00").toLocaleDateString("en-MX", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <span title="Income + refunds − expenses">
              Net {money(dayTotals.get(day) || 0)}
            </span>
          </header>
          {rows.map((t) => (
            <button
              className="transaction-row"
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setEditing(false);
              }}
            >
              <span className="row-icon">
                <CategoryIcon
                  name={cat(t.categoryId)?.icon || "circle"}
                  size={20}
                />
              </span>
              <span className="row-main">
                <strong>
                  {merchant(t.merchantId)?.name ||
                    cat(t.categoryId)?.name ||
                    "Unknown category"}
                </strong>
                <span>
                  {cat(t.categoryId)?.name}
                  {t.description ? " · " + t.description : ""}
                </span>
                <small>
                  {t.localTime} · {t.type[0].toUpperCase() + t.type.slice(1)}
                  {t.automatic ? " · Automatic" : ""}
                </small>
              </span>
              <span
                className={
                  "row-amount " + (t.type !== "expense" ? "positive" : "")
                }
              >
                {t.type === "expense" ? "−" : "+"}
                {money(t.amount)}
                <span>
                  {t.type === "expense" ? (
                    <ArrowUpRight size={12} />
                  ) : t.type === "refund" ? (
                    <RotateCcw size={12} />
                  ) : (
                    <ArrowDownLeft size={12} />
                  )}
                </span>
              </span>
            </button>
          ))}
        </section>
      ))}
      {results.length > limit && (
        <button
          className="secondary wide"
          onClick={() => setLimit((n) => n + 60)}
        >
          Show 60 more ({results.length - limit} remaining)
        </button>
      )}
      {active && (
        <Modal
          title={editing ? "Edit transaction" : "Transaction details"}
          onClose={() => setSelected(undefined)}
        >
          {editing ? (
            <TransactionForm
              data={data}
              initial={active}
              onSave={async (t, e) => {
                const ok = await onSave(t, e);
                if (ok) setSelected(undefined);
                return ok;
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <p className="detail-amount">
                {active.type === "expense" ? "−" : "+"}
                {money(active.amount)}
              </p>
              <dl className="detail-list">
                {[
                  ["Type", active.type],
                  ["Category", cat(active.categoryId)?.name],
                  ["Merchant", merchant(active.merchantId)?.name || "None"],
                  ["Description", active.description || "—"],
                  ["Payment method", active.paymentMethod || "—"],
                  ["Date", `${active.localDate} at ${active.localTime}`],
                  ["Entry", active.automatic ? "Automatic" : "Manual"],
                  ...(active.recurringScheduleId
                    ? [
                        [
                          "Schedule",
                          data.schedules.find(
                            (s) => s.id === active.recurringScheduleId,
                          )?.name || "Deleted schedule",
                        ],
                      ]
                    : []),
                  ...(active.originalExpenseId
                    ? [
                        [
                          "Original expense",
                          `${data.transactions.find((t) => t.id === active.originalExpenseId)?.localDate || ""} · ${money(data.transactions.find((t) => t.id === active.originalExpenseId)?.amount || 0)}`,
                        ],
                      ]
                    : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <button className="primary wide" onClick={() => setEditing(true)}>
                Edit transaction
              </button>
              <button
                className="danger wide"
                onClick={async () => {
                  if (
                    window.confirm(
                      "Delete this transaction permanently? This cannot be undone.",
                    )
                  ) {
                    if (await onDelete(active.id)) setSelected(undefined);
                  }
                }}
              >
                Delete transaction
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
