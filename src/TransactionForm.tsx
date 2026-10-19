import { useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import {
  amountInput,
  categoryKind,
  localParts,
  money,
  parseLocal,
  parseMoney,
  type Snapshot,
  type Transaction,
  type TransactionType,
} from "./model";
import { CategoryIcon } from "./icons";
export function TransactionForm({
  data,
  initial,
  onSave,
  onCancel,
  onCategorySelect,
}: {
  data: Snapshot;
  initial?: Transaction;
  onSave: (t: Transaction, editing: boolean) => Promise<boolean>;
  onCancel?: () => void;
  onCategorySelect?: (type: TransactionType, id: string) => void;
}) {
  const [type, setType] = useState<TransactionType>(initial?.type || "expense");
  const chooseCategory = (kind: TransactionType) =>
    data.categories.find(
      (c) =>
        c.id === data.preferences.lastCategory[kind] &&
        !c.archived &&
        c.kind === categoryKind(kind),
    )?.id ||
    data.categories.find((c) => c.kind === categoryKind(kind) && !c.archived)
      ?.id ||
    "";
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId || chooseCategory("expense"),
  );
  const selections = useRef({
    ...data.preferences.lastCategory,
    ...(initial ? { [initial.type]: initial.categoryId } : {}),
  });
  const selectCategory = (id: string) => {
    selections.current[type] = id;
    setCategoryId(id);
    onCategorySelect?.(type, id);
  };
  const [amount, setAmount] = useState(
    initial ? amountInput(initial.amount) : "",
  );
  const [merchantId, setMerchantId] = useState(initial?.merchantId || "");
  const [merchantQuery, setMerchantQuery] = useState("");
  const [description, setDescription] = useState(initial?.description || "");
  const [paymentMethod, setPaymentMethod] = useState(
    initial?.paymentMethod || "",
  );
  const [override, setOverride] = useState(!!initial);
  const [date, setDate] = useState(
    initial?.localDate || localParts().localDate,
  );
  const [time, setTime] = useState(
    initial?.localTime || localParts().localTime,
  );
  const [originalExpenseId, setOriginalExpenseId] = useState(
    initial?.originalExpenseId || "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const token = useRef(crypto.randomUUID());
  const selected = data.merchants.find((m) => m.id === merchantId);
  const suggestion = data.categories.find(
    (c) =>
      c.id === selected?.defaultCategoryId &&
      !c.archived &&
      c.kind === categoryKind(type) &&
      c.id !== categoryId,
  );
  const categories = data.categories.filter(
    (c) =>
      c.kind === categoryKind(type) &&
      (!c.archived || c.id === initial?.categoryId),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const cents = parseMoney(amount);
      const parts = override
        ? { localDate: date, localTime: time }
        : localParts();
      const now = Date.now();
      const ok = await onSave(
        {
          id: initial?.id || token.current,
          type,
          amount: cents,
          categoryId,
          merchantId: merchantId || undefined,
          description: description.trim(),
          paymentMethod: paymentMethod.trim(),
          ...parts,
          occurredAt: override ? parseLocal(date, time) : now,
          createdAt: initial?.createdAt || now,
          updatedAt: now,
          automatic: initial?.automatic || false,
          originalExpenseId:
            type === "refund" && originalExpenseId
              ? originalExpenseId
              : undefined,
          recurringScheduleId: initial?.recurringScheduleId,
          occurrenceKey: initial?.occurrenceKey,
        },
        !!initial,
      );
      if (ok && !initial) {
        token.current = crypto.randomUUID();
        setAmount("");
        setMerchantId("");
        setMerchantQuery("");
        setDescription("");
        setPaymentMethod("");
        setOverride(false);
        setOriginalExpenseId("");
        amountRef.current?.focus();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="entry-form">
      <div className="segmented" aria-label="Transaction type">
        {(["expense", "income", "refund"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => {
              setType(t);
              setCategoryId(
                data.categories.find(
                  (c) => c.id === selections.current[t] && !c.archived,
                )?.id || chooseCategory(t),
              );
              setOriginalExpenseId("");
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <label
        className="amount-label"
        htmlFor={initial ? "edit-amount" : "amount"}
      >
        Amount <span>MXN</span>
      </label>
      <div className="amount-wrap">
        <span aria-hidden="true">$</span>
        <input
          ref={amountRef}
          id={initial ? "edit-amount" : "amount"}
          autoFocus={!initial}
          aria-label="Amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          maxLength={12}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="section-label">
        Category <span>Required</span>
      </div>
      <div className="category-grid" aria-label="Categories">
        {categories.map((c) => (
          <button
            type="button"
            key={c.id}
            className={categoryId === c.id ? "category selected" : "category"}
            aria-pressed={categoryId === c.id}
            onClick={() => selectCategory(c.id)}
          >
            <span
              className="category-symbol"
              style={{ color: c.color || undefined }}
            >
              <CategoryIcon name={c.icon} />
              {categoryId === c.id && (
                <Check size={10} className="category-check" />
              )}
            </span>
            <span>
              {c.name}
              {c.archived ? " (archived)" : ""}
            </span>
          </button>
        ))}
      </div>
      <details className="optional" open={initial ? true : undefined}>
        <summary>
          More details{" "}
          <span>
            Optional <ChevronDown size={14} />
          </span>
        </summary>
        <div className="optional-fields">
          <label>
            Find a saved merchant
            <input
              type="search"
              placeholder="Search merchants"
              value={merchantQuery}
              maxLength={80}
              onChange={(e) => setMerchantQuery(e.target.value)}
            />
          </label>
          <label>
            Merchant / payee
            <select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              <option value="">None</option>
              {data.merchants
                .filter(
                  (m) =>
                    (!m.archived || m.id === initial?.merchantId) &&
                    (!merchantQuery ||
                      m.name
                        .toLowerCase()
                        .includes(merchantQuery.toLowerCase()) ||
                      m.id === merchantId),
                )
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </label>
          {!data.merchants.some((m) => !m.archived) && (
            <p className="hint">Save merchants in Settings → Merchants.</p>
          )}
          {suggestion && (
            <button
              type="button"
              className="suggestion"
              onClick={() => selectCategory(suggestion.id)}
            >
              Use {suggestion.name} for {selected?.name}
            </button>
          )}
          <label>
            Description
            <input
              placeholder="What was it for?"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Payment method
            <input
              list="payment-methods"
              placeholder="Optional"
              value={paymentMethod}
              maxLength={80}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <datalist id="payment-methods">
              <option>Cash</option>
              <option>Debit card</option>
              <option>Credit card</option>
              <option>Bank transfer</option>
            </datalist>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => {
                setOverride(e.target.checked);
                if (e.target.checked && !initial) {
                  const p = localParts();
                  setDate(p.localDate);
                  setTime(p.localTime);
                }
              }}
            />
            Set date and time
          </label>
          {override && (
            <div className="two-col">
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </label>
            </div>
          )}
          {type === "refund" && (
            <label>
              Original expense (optional)
              <select
                value={originalExpenseId}
                onChange={(e) => setOriginalExpenseId(e.target.value)}
              >
                <option value="">No linked expense</option>
                {data.transactions
                  .filter((t) => t.type === "expense" && t.id !== initial?.id)
                  .sort((a, b) => b.occurredAt - a.occurredAt)
                  .map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.localDate} · {money(t.amount)} ·{" "}
                      {data.merchants.find((m) => m.id === t.merchantId)
                        ?.name ||
                        data.categories.find((c) => c.id === t.categoryId)
                          ?.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary save" disabled={busy}>
        {busy ? "Saving…" : initial ? "Save changes" : "Save transaction"}
      </button>
      {onCancel && (
        <button className="text-button" type="button" onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      )}
      {!initial && (
        <p className="entry-footer">On your device. For your eyes only.</p>
      )}
    </form>
  );
}
