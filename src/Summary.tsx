import { useState } from "react";
import {
  localParts,
  money,
  totals,
  merchantLabel,
  merchantTotals,
  type Snapshot,
  type Transaction,
} from "./model";
import { addDays, dateNumber, monthRange, shiftMonth } from "./calendar";
import { averageDaily, inRange, trend, type Granularity } from "./finance";
import { BudgetProgress } from "./FinanceSettings";
import { CategoryIcon } from "./icons";
export function Summary({
  data,
  onMode,
}: {
  data: Snapshot;
  onMode: (mode: "basic" | "analytical") => Promise<boolean>;
}) {
  const today = localParts().localDate;
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState("month");
  let valid = true;
  try {
    dateNumber(from);
    dateNumber(to);
    if (from > to) valid = false;
  } catch {
    valid = false;
  }
  const rows = valid ? inRange(data.transactions, from, to) : [];
  const sum = totals(rows);
  const analytical = data.preferences.summaryMode === "analytical";
  const pick = (value: string) => {
    setPreset(value);
    if (value === "month") {
      setFrom(today.slice(0, 7) + "-01");
      setTo(today);
    }
    if (value === "lastMonth") {
      const r = monthRange(shiftMonth(today.slice(0, 7), -1));
      setFrom(r.from);
      setTo(r.to);
    }
    if (value === "year") {
      setFrom(today.slice(0, 4) + "-01-01");
      setTo(today);
    }
    if (value === "30") {
      setFrom(addDays(today, -29));
      setTo(today);
    }
    if (value === "all") {
      setFrom(
        data.transactions.reduce(
          (d, t) => (t.localDate < d ? t.localDate : d),
          today,
        ),
      );
      setTo(
        data.transactions.reduce(
          (d, t) => (t.localDate > d ? t.localDate : d),
          today,
        ),
      );
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow" aria-hidden="true">
            &nbsp;
          </p>
          <h1>Your ledger</h1>
        </div>
      </div>
      <div className="segmented" aria-label="Summary mode">
        {(["basic", "analytical"] as const).map((mode) => (
          <button
            key={mode}
            aria-pressed={(analytical ? "analytical" : "basic") === mode}
            onClick={() => onMode(mode)}
          >
            {mode === "basic" ? "Basic" : "Analytical"}
          </button>
        ))}
      </div>
      <div className="range-controls">
        <label>
          Summary range
          <select value={preset} onChange={(e) => pick(e.target.value)}>
            <option value="month">This month to date</option>
            <option value="lastMonth">Last month</option>
            <option value="year">This year to date</option>
            <option value="30">Last 30 days</option>
            <option value="all">All entries</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <div className="two-col">
          <label>
            Summary from
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
            />
          </label>
          <label>
            Summary through
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
            />
          </label>
        </div>
      </div>
      {!valid ? (
        <p className="error" role="alert">
          Choose a valid date range with the start before the end.
        </p>
      ) : (
        <>
          <section className="home-hero">
            <span>Net spending</span>
            <p>{money(sum.netSpending)}</p>
            <small>Gross expenses less refunds · {rows.length} entries</small>
          </section>
          <dl className="summary-totals">
            {[
              ["Gross expenses", sum.expenses],
              ["Income", sum.income],
              ["Refunds", sum.refunds],
              ["Net cash flow", sum.netCashFlow],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{money(value as number)}</dd>
              </div>
            ))}
          </dl>
          <CategoryBreakdown data={data} rows={rows} />
          {analytical && (
            <Analytics data={data} rows={rows} from={from} to={to} />
          )}
        </>
      )}
      <section className="settings-section">
        <h2>Monthly budgets · {today.slice(0, 7)}</h2>
        <p className="hint">
          Current calendar month, independent of the summary range. Income never
          expands these limits.
        </p>
        <BudgetProgress data={data} />
      </section>
    </>
  );
}
function CategoryBreakdown({
  data,
  rows,
}: {
  data: Snapshot;
  rows: Transaction[];
}) {
  const [selected, setSelected] = useState("");
  const categories = data.categories.filter(
    (c) =>
      c.kind === "expense" &&
      rows.some((t) => t.categoryId === c.id && t.type !== "income"),
  );
  const values = categories.map(
    (c) => totals(rows.filter((t) => t.categoryId === c.id)).netSpending,
  );
  const max = Math.max(1, ...values.map(Math.abs));
  const detail = totals(rows.filter((t) => t.categoryId === selected));
  return (
    <section className="settings-section">
      <h2>By category</h2>
      <p className="hint">
        Net spending · tap a category for gross expenses and refunds.
      </p>
      {categories.map((c, i) => (
        <div key={c.id}>
          <button
            className="breakdown-row category-breakdown"
            aria-pressed={selected === c.id}
            onClick={() => setSelected(selected === c.id ? "" : c.id)}
          >
            <CategoryIcon name={c.icon} size={18} />
            <span>{c.name}</span>
            <strong>{money(values[i])}</strong>
          </button>
          <div className="category-meter" aria-hidden="true">
            <span style={{ width: `${(Math.abs(values[i]) / max) * 100}%` }} />
          </div>
          {selected === c.id && (
            <p className="hint">
              Gross expenses {money(detail.expenses)} · Refunds{" "}
              {money(detail.refunds)}
            </p>
          )}
        </div>
      ))}
      {!categories.length && <p className="hint">No spending in this range.</p>}
    </section>
  );
}
function Analytics({
  data,
  rows,
  from,
  to,
}: {
  data: Snapshot;
  rows: Transaction[];
  from: string;
  to: string;
}) {
  const [unit, setUnit] = useState<Granularity>("daily");
  const [merchant, setMerchant] = useState("all");
  const [largestLimit, setLargestLimit] = useState(5);
  const [monthLimit, setMonthLimit] = useState(12);
  const name = (t: Transaction) =>
    merchantLabel(t, data.merchants) ||
    data.categories.find((c) => c.id === t.categoryId)?.name ||
    "Transaction";
  const merchants = merchantTotals(rows, data.merchants);
  let monthly: ReturnType<typeof trend> = [];
  let monthError = "";
  try {
    monthly = trend(rows, from, to, "monthly");
  } catch (e) {
    monthError = (e as Error).message;
  }
  return (
    <>
      <section className="settings-section">
        <h2>Daily average</h2>
        <p className="analytic-value">{money(averageDaily(rows, from, to))}</p>
        <p className="hint">
          Net spending per calendar day, including days with no entries. Rounded
          to the nearest centavo.
        </p>
      </section>
      <section className="settings-section">
        <h2>Trends</h2>
        <label>
          Trend interval
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Granularity)}
          >
            {["daily", "weekly", "monthly", "yearly"].map((u) => (
              <option key={u} value={u}>
                {u[0].toUpperCase() + u.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <TrendChart rows={rows} from={from} to={to} unit={unit} />
      </section>
      <section className="settings-section">
        <h2>Month-to-month</h2>
        {monthError && <p className="hint">{monthError}</p>}
        <p className="hint">
          Only dates inside your selected range. First/last months can be
          partial. Change compares adjacent selected months; refunds reduce net
          spending.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Net spending</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {monthly.slice(-monthLimit).map((m, i, subset) => {
                const previous = i
                  ? subset[i - 1]
                  : monthly[monthly.indexOf(m) - 1];
                return (
                  <tr key={m.label}>
                    <th scope="row">{m.label}</th>
                    <td>{money(m.netSpending)}</td>
                    <td>
                      {previous
                        ? money(m.netSpending - previous.netSpending)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {monthly.length > monthLimit && (
          <button
            className="text-button"
            onClick={() => setMonthLimit((n) => n + 12)}
          >
            Show earlier months
          </button>
        )}
      </section>
      <section className="settings-section">
        <h2>Merchant spending</h2>
        <label>
          Inspect merchant
          <select
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          >
            <option value="all">All merchants</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Expenses</th>
                <th>Refunds</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {merchants
                .filter((m) => merchant === "all" || m.id === merchant)
                .map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.name}</th>
                    <td>{money(m.expenses)}</td>
                    <td>{money(m.refunds)}</td>
                    <td>{money(m.netSpending)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!merchants.length && (
          <p className="hint">No merchant spending in this range.</p>
        )}
      </section>
      <section className="settings-section">
        <h2>Largest transactions</h2>
        <p className="hint">
          Ranked by amount, with transaction types kept separate.
        </p>
        {[...rows]
          .sort(
            (a, b) =>
              b.amount - a.amount || b.localDate.localeCompare(a.localDate),
          )
          .slice(0, largestLimit)
          .map((t) => (
            <div className="largest-row" key={t.id}>
              <span>
                {name(t)}
                <small>
                  {t.localDate} · {t.type}
                  {t.automatic ? " · Automatic" : ""}
                </small>
              </span>
              <strong>{money(t.amount)}</strong>
            </div>
          ))}
        {!rows.length && <p className="hint">No entries in this range.</p>}
        {rows.length > largestLimit && (
          <button
            className="text-button"
            onClick={() => setLargestLimit((n) => n + 10)}
          >
            Show more transactions
          </button>
        )}
      </section>
    </>
  );
}
function TrendChart({
  rows,
  from,
  to,
  unit,
}: {
  rows: Transaction[];
  from: string;
  to: string;
  unit: Granularity;
}) {
  const [index, setIndex] = useState(0);
  const [series, setSeries] = useState({
    expenses: true,
    income: true,
    refunds: true,
  });
  let points: ReturnType<typeof trend> = [];
  let error = "";
  try {
    points = trend(rows, from, to, unit);
  } catch (e) {
    error = (e as Error).message;
  }
  if (error) return <p className="hint">{error}</p>;
  const i = Math.min(index, points.length - 1),
    selected = points[i];
  if (!selected) return <p className="hint">No trend periods.</p>;
  const keys = ["expenses", "income", "refunds"] as const;
  const scale = Math.max(
    1,
    ...points.flatMap((p) => keys.filter((k) => series[k]).map((k) => p[k])),
  );
  const x = (j: number) =>
    points.length === 1 ? 300 : 20 + (j / (points.length - 1)) * 560;
  const y = (v: number) => 155 - (v / scale) * 130;
  return (
    <>
      <div className="chart-legend">
        {keys.map((k) => (
          <label className="checkbox" key={k}>
            <input
              type="checkbox"
              checked={series[k]}
              onChange={(e) => setSeries({ ...series, [k]: e.target.checked })}
            />
            {k[0].toUpperCase() + k.slice(1)}
          </label>
        ))}
      </div>
      <svg
        className="trend-chart"
        viewBox="0 0 600 180"
        role="img"
        aria-label={`${unit} income, expense and refund trends. Use the period slider for exact values.`}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setIndex(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(
                  ((((e.clientX - r.left) / r.width) * 600 - 20) / 560) *
                    (points.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <title>Income, expenses and refunds</title>
        <line x1="20" x2="580" y1="155" y2="155" className="chart-baseline" />
        {keys
          .filter((k) => series[k])
          .map((k) => (
            <polyline
              key={k}
              points={points.map((p, j) => `${x(j)},${y(p[k])}`).join(" ")}
              fill="none"
              className={"chart-series " + k}
              strokeWidth="2"
              strokeDasharray={
                k === "expenses" ? "" : k === "income" ? "7 4" : "2 4"
              }
            />
          ))}
        <line
          x1={x(i)}
          x2={x(i)}
          y1="20"
          y2="155"
          className="chart-selection"
        />
        {keys
          .filter((k) => series[k])
          .map((k) => (
            <circle
              key={k}
              cx={x(i)}
              cy={y(selected[k])}
              r="3"
              className={"chart-dot " + k}
            />
          ))}
      </svg>
      <label>
        Selected trend period
        <input
          aria-label="Selected trend period"
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={Math.max(0, i)}
          onChange={(e) => setIndex(Number(e.target.value))}
        />
      </label>
      <div className="chart-detail" aria-live="polite">
        <strong>{selected.label}</strong>
        <span>
          Expenses {money(selected.expenses)} · Income {money(selected.income)}{" "}
          · Refunds {money(selected.refunds)}
        </span>
        <span>
          Net spending {money(selected.netSpending)} · Cash flow{" "}
          {money(selected.netCashFlow)}
        </span>
      </div>
      <p className="hint">
        Tap the chart or move the slider. Weeks start Monday; edge periods
        contain only selected dates. Lines show gross amounts.
      </p>
    </>
  );
}
