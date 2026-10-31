import { PaymentField } from "./PaymentField";
import { useRef, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { Modal } from "./History";
import {
  amountInput,
  categoryKind,
  localParts,
  money,
  parseMoney,
  type Budget,
  type RecurringSchedule,
  requirePaymentMethod,
  type Snapshot,
} from "./model";
import { budgetUsage } from "./finance";
export function BudgetProgress({
  data,
  month = localParts().localDate.slice(0, 7),
}: {
  data: Snapshot;
  month?: string;
}) {
  return (
    <>
      {data.budgets.map((b) => {
        const usage = budgetUsage(b, data.transactions, month);
        const label = b.categoryId
          ? data.categories.find((c) => c.id === b.categoryId)?.name ||
            "Category"
          : "Overall";
        return (
          <div className="budget-card" key={b.id}>
            <div>
              <strong>{label}</strong>
              <span>
                {money(usage.used)} / {money(b.limit)}
              </span>
            </div>
            <progress
              aria-label={`${label} budget usage`}
              value={usage.progress}
              max={1}
            />
            <p className={usage.warning ? "budget-warning" : "hint"}>
              {usage.warning === "exceeded"
                ? "100% reached · "
                : usage.warning === "near"
                  ? "80% reached · "
                  : ""}
              {usage.available < 0
                ? `${money(-usage.available)} over budget`
                : `${money(usage.available)} available`}
            </p>
          </div>
        );
      })}
      {!data.budgets.length && (
        <p className="hint">
          No monthly limits set. Add an optional budget in Settings.
        </p>
      )}
    </>
  );
}
export function BudgetWarnings({ data }: { data: Snapshot }) {
  const warnings = data.budgets.filter(
    (b) =>
      budgetUsage(b, data.transactions, localParts().localDate.slice(0, 7))
        .warning,
  );
  return warnings.length ? (
    <details className="budget-notice">
      <summary>Monthly budget notice · {warnings.length}</summary>
      <BudgetProgress data={{ ...data, budgets: warnings }} />
      <p className="hint">Budget limits never block a transaction.</p>
    </details>
  ) : null;
}
export function BudgetManager({
  data,
  onSave,
  onDelete,
}: {
  data: Snapshot;
  onSave: (b: Budget) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<Budget>();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <>
      <p className="hint">
        Limits repeat each calendar month. Usage resets; unused amounts do not
        carry forward. Refunds restore availability in their receipt month and
        category. Income never adds budget.
      </p>
      <BudgetProgress data={data} />
      <button
        className="secondary wide"
        onClick={() => {
          setEditing({ id: "overall", limit: 0 });
          setAmount("");
          setError("");
        }}
      >
        <Plus size={16} /> Set a budget
      </button>
      {data.budgets.map((b) => (
        <button
          className="settings-link"
          key={b.id}
          onClick={() => {
            setEditing({ ...b });
            setAmount(amountInput(b.limit));
            setError("");
          }}
        >
          <span>
            {b.categoryId
              ? data.categories.find((c) => c.id === b.categoryId)?.name
              : "Overall"}{" "}
            · {money(b.limit)}
          </span>
          <ChevronRight size={18} />
        </button>
      ))}
      {editing && (
        <Modal title="Monthly budget" onClose={() => setEditing(undefined)}>
          <form
            className="optional-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const limit = parseMoney(amount);
                if (await onSave({ ...editing, limit })) setEditing(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Budget for
              <select
                value={editing.categoryId || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  setEditing({
                    ...editing,
                    id: id || "overall",
                    categoryId: id || undefined,
                  });
                  const existing = data.budgets.find(
                    (b) => b.id === (id || "overall"),
                  );
                  setAmount(existing ? amountInput(existing.limit) : "");
                }}
              >
                <option value="">Overall spending</option>
                {data.categories
                  .filter((c) => c.kind === "expense")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Monthly limit (MXN)
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                maxLength={12}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <p className="hint">
              Saving updates this limit for every month. Category limits are
              independent of the overall limit; they do not add to it.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save budget
            </button>
            {data.budgets.some((b) => b.id === editing.id) && (
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm(
                      "Remove this budget limit? Transactions will remain.",
                    )
                  ) {
                    if (await onDelete(editing.id)) setEditing(undefined);
                  }
                }}
              >
                Remove budget
              </button>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
export function ScheduleManager({
  data,
  onSave,
  onDelete,
}: {
  data: Snapshot;
  onSave: (s: RecurringSchedule, editing: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RecurringSchedule>();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const edit = (s?: RecurringSchedule) => {
    setError("");
    setAmount(s ? amountInput(s.amount) : "");
    setDraft(
      s
        ? { ...s }
        : {
            id: crypto.randomUUID(),
            name: "",
            type: "expense",
            amount: 0,
            categoryId:
              data.categories.find((c) => c.kind === "expense" && !c.archived)
                ?.id || "",
            description: "",
            paymentMethod: "",
            frequency: "monthly",
            startDate: localParts().localDate,
            paused: false,
            createdAt: 0,
            updatedAt: 0,
          },
    );
  };
  const exists = !!draft && data.schedules.some((s) => s.id === draft.id);
  return (
    <>
      <p className="hint">
        Fixed amounts are recorded automatically when Ledger opens or resumes.
        New schedules backfill due dates from their start, without confirmation.
        Monthly 29th–31st and yearly leap-day dates clamp to month end, then
        return to their original anchor.
      </p>
      <button className="secondary wide" onClick={() => edit()}>
        <Plus size={16} /> Add schedule
      </button>
      {!data.schedules.length && (
        <p className="hint">No recurring transactions yet.</p>
      )}
      {data.schedules.map((s) => (
        <div className="schedule-row" key={s.id}>
          <button className="entity-row" onClick={() => edit(s)}>
            <span>
              {s.name}
              <small>
                {!s.paymentMethod.trim() && (
                  <>
                    Payment method required · entries held
                    <br />
                  </>
                )}
                {s.frequency} · {s.type} · {money(s.amount)} ·{" "}
                {s.paused
                  ? "Paused"
                  : s.endDate && s.endDate < localParts().localDate
                    ? "Ended"
                    : "Active"}
                <br />
                {s.startDate}
                {s.endDate ? " → " + s.endDate : ""}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            className="text-button"
            disabled={busy || !s.paymentMethod.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ ...s, paused: !s.paused }, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {s.paused ? "Resume" : "Pause"}
          </button>
        </div>
      ))}
      {draft && (
        <Modal
          title={exists ? "Edit schedule" : "New schedule"}
          onClose={() => setDraft(undefined)}
        >
          {exists &&
            !data.schedules
              .find((s) => s.id === draft.id)
              ?.paymentMethod.trim() && (
              <p className="hint">
                Choose a payment method to resume reconciliation. Missed dates
                use the original schedule terms and this method; existing
                entries and deleted/skipped dates stay unchanged.
              </p>
            )}
          <form
            className="optional-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const cents = parseMoney(amount);
                requirePaymentMethod(draft.paymentMethod);
                if (await onSave({ ...draft, amount: cents }, exists))
                  setDraft(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Schedule name
              <input
                autoFocus
                value={draft.name}
                maxLength={80}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="two-col">
              <label>
                Transaction type
                <select
                  value={draft.type}
                  onChange={(e) => {
                    const type = e.target.value as RecurringSchedule["type"];
                    setDraft({
                      ...draft,
                      type,
                      categoryId:
                        data.categories.find(
                          (c) => c.kind === categoryKind(type) && !c.archived,
                        )?.id || "",
                    });
                  }}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="refund">Refund</option>
                </select>
              </label>
              <label>
                Fixed amount (MXN)
                <input
                  inputMode="decimal"
                  value={amount}
                  maxLength={12}
                  required
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </div>
            <label>
              Schedule category
              <select
                value={draft.categoryId}
                onChange={(e) =>
                  setDraft({ ...draft, categoryId: e.target.value })
                }
                required
              >
                {data.categories
                  .filter(
                    (c) =>
                      c.kind === categoryKind(draft.type) &&
                      (!c.archived || c.id === draft.categoryId),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Schedule merchant
              <select
                value={draft.merchantId || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    merchantId: e.target.value || undefined,
                  })
                }
              >
                <option value="">None</option>
                {data.merchants
                  .filter((m) => !m.archived || m.id === draft.merchantId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.archived ? " (archived)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Schedule description
              <input
                value={draft.description}
                maxLength={500}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <PaymentField
              label="Schedule payment method"
              methods={data.paymentMethods}
              value={draft.paymentMethod}
              onChange={(paymentMethod) =>
                setDraft({ ...draft, paymentMethod })
              }
            />
            <label>
              Frequency
              <select
                value={draft.frequency}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    frequency: e.target.value as RecurringSchedule["frequency"],
                  })
                }
              >
                {["daily", "weekly", "monthly", "yearly"].map((f) => (
                  <option key={f} value={f}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <div className="two-col">
              <label>
                Start date
                <input
                  type="date"
                  min="1000-01-01"
                  max="9998-12-31"
                  value={draft.startDate}
                  required
                  onChange={(e) =>
                    setDraft({ ...draft, startDate: e.target.value })
                  }
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  min={draft.startDate}
                  max="9998-12-31"
                  value={draft.endDate || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, endDate: e.target.value || undefined })
                  }
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.paused}
                onChange={(e) =>
                  setDraft({ ...draft, paused: e.target.checked })
                }
              />
              Paused
            </label>
            <p className="hint">
              Dates are inclusive and due at local midnight. Paused dates,
              including the day you resume, are skipped. Editing settles
              existing dues first; new terms apply after today. Existing entries
              are never rewritten.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Save schedule
            </button>
            {exists && (
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirm(
                      "Delete this schedule? Generated entries and deleted-occurrence records will remain. Future automation will stop.",
                    )
                  ) {
                    if (await onDelete(draft.id)) setDraft(undefined);
                  }
                }}
              >
                Delete schedule
              </button>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
