import type { Frequency } from "./model";
const DAY = 86400000;
/** Pure Gregorian dates. UTC is used only as a calendar calculator, never to infer an entry's local day. */
export function dateNumber(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Choose a valid date.");
  const n = Date.parse(date + "T00:00:00Z");
  if (
    !Number.isFinite(n) ||
    new Date(n).toISOString().slice(0, 10) !== date ||
    Number(date.slice(0, 4)) < 1000 ||
    Number(date.slice(0, 4)) > 9998
  )
    throw new Error("Use a valid date between 1000 and 9998.");
  return Math.round(n / DAY);
}
export function fromNumber(n: number) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}
export const addDays = (date: string, n: number) =>
  fromNumber(dateNumber(date) + n);
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function monthRange(month: string) {
  const from = month + "-01";
  dateNumber(from);
  return { from, to: monthEnd(month) };
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function anchoredDate(
  start: string,
  frequency: Frequency,
  index: number,
) {
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency))
    throw new Error("Invalid frequency.");
  const n = dateNumber(start);
  if (!Number.isInteger(index) || index < 0)
    throw new Error("Invalid occurrence index.");
  if (frequency === "daily" || frequency === "weekly")
    return fromNumber(n + index * (frequency === "weekly" ? 7 : 1));
  const [y, m, d] = start.split("-").map(Number);
  const target = new Date(
    Date.UTC(
      y + (frequency === "yearly" ? index : 0),
      m - 1 + (frequency === "monthly" ? index : 0),
      1,
    ),
  );
  const year = target.getUTCFullYear(),
    month = target.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export function* dueDates(
  start: string,
  frequency: Frequency,
  from: string,
  through: string,
) {
  dateNumber(start);
  dateNumber(from);
  dateNumber(through);
  if (from > through || start > through) return;
  const floor = from > start ? from : start;
  let i = 0;
  if (frequency === "daily" || frequency === "weekly")
    i = Math.max(
      0,
      Math.floor(
        (dateNumber(floor) - dateNumber(start)) /
          (frequency === "weekly" ? 7 : 1),
      ),
    );
  else {
    const [sy, sm] = start.split("-").map(Number),
      [fy, fm] = floor.split("-").map(Number);
    i = Math.max(
      0,
      frequency === "monthly" ? (fy - sy) * 12 + fm - sm : fy - sy,
    );
  }
  for (; ; i++) {
    const day = anchoredDate(start, frequency, i);
    if (day > through) return;
    if (day >= floor) yield day;
  }
}
export function weekStart(date: string) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
