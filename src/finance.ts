import { totals, type Budget, type Transaction } from "./model";
import { dateNumber, weekStart, addDays, shiftMonth } from "./calendar";
export function inRange(rows: Transaction[], from: string, to: string) {
  return rows.filter((t) => t.localDate >= from && t.localDate <= to);
}
export function budgetUsage(
  budget: Budget,
  rows: Transaction[],
  month: string,
) {
  const sum = totals(
    rows.filter(
      (t) =>
        t.localDate.startsWith(month) &&
        (!budget.categoryId || t.categoryId === budget.categoryId),
    ),
  );
  const used = sum.netSpending;
  const ratio = used / budget.limit;
  return {
    used,
    available: budget.limit - used,
    ratio,
    progress: Math.min(1, Math.max(0, ratio)),
    warning: ratio >= 1 ? "exceeded" : ratio >= 0.8 ? "near" : undefined,
  };
}
export function averageDaily(rows: Transaction[], from: string, to: string) {
  const days = dateNumber(to) - dateNumber(from) + 1;
  if (days < 1) throw new Error("Invalid date range.");
  const net = totals(inRange(rows, from, to)).netSpending;
  return Math.sign(net) * Math.round(Math.abs(net) / days);
}
export type Granularity = "daily" | "weekly" | "monthly" | "yearly";
export function trend(
  rows: Transaction[],
  from: string,
  to: string,
  unit: Granularity,
) {
  dateNumber(from);
  dateNumber(to);
  const bucket = (day: string) =>
    unit === "daily"
      ? day
      : unit === "weekly"
        ? weekStart(day)
        : unit === "monthly"
          ? day.slice(0, 7)
          : day.slice(0, 4);
  const map = new Map<string, Transaction[]>();
  let day = from;
  while (day <= to) {
    if (map.size >= 2000)
      throw new Error(
        "Choose a coarser trend interval or a shorter range (maximum 2,000 chart periods).",
      );
    map.set(bucket(day), []);
    if (unit === "daily" || unit === "weekly")
      day = addDays(
        unit === "weekly" ? weekStart(day) : day,
        unit === "weekly" ? 7 : 1,
      );
    else if (unit === "monthly") day = shiftMonth(day.slice(0, 7), 1) + "-01";
    else day = String(Number(day.slice(0, 4)) + 1) + "-01-01";
  }
  for (const t of inRange(rows, from, to)) {
    const key = bucket(t.localDate);
    map.get(key)?.push(t);
  }
  return [...map].map(([label, entries]) => ({ label, ...totals(entries) }));
}
