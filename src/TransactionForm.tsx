import { PaymentField } from "./PaymentField";
import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  merchantLabel,
  requirePaymentMethod,
  type Merchant,
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
  onSaveMerchant,
}: {
  data: Snapshot;
  onSaveMerchant?: (merchant: Merchant) => Promise<boolean>;
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
  const [merchantName, setMerchantName] = useState(initial?.merchantName || "");
  const merchantLock = useRef(false);
  const merchantText = merchantId
    ? merchantLabel({ merchantId }, data.merchants)
    : merchantName;
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
      requirePaymentMethod(paymentMethod);
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
          merchantName:
            !merchantId && merchantName.trim()
              ? initial?.merchantName === merchantName
                ? merchantName
                : merchantName.trim()
              : undefined,
          description: description.trim(),
          paymentMethod:
            initial?.paymentMethod === paymentMethod
              ? paymentMethod
              : paymentMethod.trim(),
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
        setMerchantName("");
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
      <div className="optional-fields">
        <label>
          Merchant / payee
          <input
            type="text"
            placeholder="Optional"
            value={merchantText}
            maxLength={80}
            disabled={busy}
            autoComplete="off"
            onChange={(e) => {
              setMerchantId("");
              setMerchantName(e.target.value);
            }}
          />
        </label>
        <label>
          Recurring merchant
          <select
            disabled={busy}
            value={merchantId}
            onChange={(e) => {
              const id = e.target.value;
              setMerchantName(id ? "" : merchantText);
              setMerchantId(id);
              const merchant = data.merchants.find((m) => m.id === id);
              const preferred = data.categories.find(
                (c) =>
                  c.id === merchant?.defaultCategoryId &&
                  !c.archived &&
                  c.kind === categoryKind(type),
              );
              if (preferred) selectCategory(preferred.id);
            }}
          >
            <option value="">One-time / none</option>
            {data.merchants
              .filter((m) => !m.archived || m.id === initial?.merchantId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.archived ? " (archived)" : ""}
                </option>
              ))}
          </select>
        </label>
        {!merchantId && merchantName.trim() && onSaveMerchant && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (merchantLock.current) return;
              merchantLock.current = true;
              setBusy(true);
              try {
                const merchant: Merchant = {
                  id: crypto.randomUUID(),
                  name: merchantName.trim(),
                  normalizedName: "",
                  archived: false,
                };
                if (await onSaveMerchant(merchant)) {
                  setMerchantId(merchant.id);
                  setMerchantName("");
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                merchantLock.current = false;
                setBusy(false);
              }
            }}
          >
            Save as recurring merchant
          </button>
        )}
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
      <div className="optional-fields">
        <label>
          Description
          <input
            placeholder="What was it for?"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <PaymentField
          key={token.current}
          methods={data.paymentMethods}
          value={paymentMethod}
          onChange={setPaymentMethod}
        />
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
                    {merchantLabel(t, data.merchants) ||
                      data.categories.find((c) => c.id === t.categoryId)?.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
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
        <p className="entry-footer" aria-hidden="true">
          &nbsp;
        </p>
      )}
    </form>
  );
}
