import { describe, it, expect } from "vitest";
import {
  addDays,
  anchoredDate,
  dateNumber,
  dueDates,
  monthRange,
  weekStart,
} from "./calendar";
describe("Gregorian recurrence calendar", () => {
  it.each([29, 30, 31])(
    "clamps monthly anchor %s without drift, including leap years",
    (day) => {
      const start = `2024-01-${day}`;
      expect(
        [0, 1, 2, 3].map((i) => anchoredDate(start, "monthly", i)),
      ).toEqual([
        start,
        "2024-02-29",
        `2024-03-${day}`,
        "2024-04-" + Math.min(day, 30),
      ]);
      expect(anchoredDate(`2025-01-${day}`, "monthly", 1)).toBe("2025-02-28");
    },
  );
  it("returns Feb 29 in the next leap year instead of drifting to Feb 28 forever", () => {
    expect(
      [0, 1, 2, 3, 4].map((i) => anchoredDate("2024-02-29", "yearly", i)),
    ).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
  it("handles Gregorian century rules", () => {
    expect(anchoredDate("2096-02-29", "yearly", 4)).toBe("2100-02-28");
    expect(anchoredDate("1996-02-29", "yearly", 4)).toBe("2000-02-29");
  });
  it("daily and weekly increments cross months, years and DST using dates", () => {
    expect([
      ...dueDates("2026-12-30", "daily", "2026-12-30", "2027-01-02"),
    ]).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect([
      ...dueDates("2026-03-01", "weekly", "2026-03-01", "2026-03-22"),
    ]).toEqual(["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22"]);
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
  it("includes start and end, skips already processed dates, and does not invent future dues", () => {
    expect([
      ...dueDates("2026-01-31", "monthly", "2026-02-01", "2026-04-30"),
    ]).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect([
      ...dueDates("2026-01-31", "monthly", "2026-03-01", "2026-03-30"),
    ]).toEqual([]);
    expect([
      ...dueDates("2027-01-01", "daily", "2026-01-01", "2026-12-31"),
    ]).toEqual([]);
  });
  it("seeks directly from old anchors without losing an end-of-month occurrence", () =>
    expect([
      ...dueDates("1900-01-31", "monthly", "2026-02-15", "2026-04-01"),
    ]).toEqual(["2026-02-28", "2026-03-31"]));
  it("validates dates and exposes month and Monday boundaries", () => {
    expect(() => dateNumber("2025-02-29")).toThrow();
    expect(monthRange("2024-02")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
  });
});
