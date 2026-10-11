import { describe, expect, it } from "vitest";
import { comingUp, dayWindow, weekRhythm, weekSoFar } from "./overview";

describe("weekRhythm", () => {
  // 2026-10-05 is a Monday.
  const tasks = [
    { task_date: "2026-10-05", status: "done" },
    { task_date: "2026-10-05", status: "pending" },
    { task_date: "2026-10-05", status: "skipped" },
    { task_date: "2026-10-07", status: "done" },
    { task_date: "2026-10-09", status: "pending" },
    { task_date: "2026-10-04", status: "done" }, // previous week
  ];
  const week = weekRhythm(tasks, "2026-10-05", "2026-10-07");

  it("counts planned (not skipped) and done per day, Monday first", () => {
    expect(week.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week[0]).toMatchObject({ date: "2026-10-05", planned: 2, done: 1, isToday: false, isFuture: false });
    expect(week[2]).toMatchObject({ planned: 1, done: 1, isToday: true });
    expect(week[4]).toMatchObject({ planned: 1, done: 0, isFuture: true });
  });

  it("totals only the days so far", () => {
    expect(weekSoFar(week)).toEqual({ planned: 3, done: 2 });
  });

  it("is all zeros with no tasks", () => {
    expect(weekSoFar(weekRhythm([], "2026-10-05", "2026-10-07"))).toEqual({ planned: 0, done: 0 });
  });
});

describe("comingUp", () => {
  const base = { today: "2026-10-07", days: 3, events: [], tasks: [], routines: [], limit: 10 };

  it("merges events, scheduled tasks and routines after today, in time order", () => {
    const items = comingUp({
      ...base,
      events: [
        { id: "e1", date: "2026-10-08", title: "Dentist", start: "15:00", allDay: false },
        { id: "e0", date: "2026-10-07", title: "Today's event", start: "09:00", allDay: false },
        { id: "e2", date: "2026-10-09", title: "Holiday", start: null, allDay: true },
      ],
      tasks: [
        { id: "t1", task_date: "2026-10-08", title: "Gym", scheduled_start: "07:30:00", status: "pending" },
        { id: "t2", task_date: "2026-10-08", title: "Untimed", scheduled_start: null, status: "pending" },
        { id: "t3", task_date: "2026-10-08", title: "Already done", scheduled_start: "08:00", status: "done" },
      ],
      routines: [{ id: "r1", title: "Online class", days_of_week: [4], start_time: "20:30:00" }], // Thursday
    });
    expect(items.map((i) => [i.date, i.start, i.title, i.kind])).toEqual([
      ["2026-10-08", "07:30", "Gym", "task"],
      ["2026-10-08", "15:00", "Dentist", "event"],
      ["2026-10-08", "20:30", "Online class", "routine"],
      ["2026-10-09", null, "Holiday", "event"],
    ]);
  });

  it("respects the limit and the number of days", () => {
    const routines = [{ id: "r", title: "Commute", days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: "17:00" }];
    expect(comingUp({ ...base, routines, days: 2 })).toHaveLength(2);
    expect(comingUp({ ...base, routines, limit: 1 })).toHaveLength(1);
  });

  it("is empty when nothing is coming up", () => {
    expect(comingUp(base)).toEqual([]);
  });
});

describe("dayWindow", () => {
  it("uses waking hours", () => {
    expect(dayWindow({ wake: "06:30:00", sleep: "22:30:00", entries: [] })).toEqual({ start: 390, end: 1350 });
  });
  it("widens to fit planned things outside them, on the hour", () => {
    expect(dayWindow({ wake: "07:00", sleep: "22:00", entries: [{ start: "05:45", end: "06:15" }, { start: "22:30", end: "23:10" }] })).toEqual({ start: 300, end: 1440 });
  });
  it("falls back to 7 AM–11 PM, and handles sleep after midnight", () => {
    expect(dayWindow({ wake: null, sleep: null, entries: [] })).toEqual({ start: 420, end: 1380 });
    expect(dayWindow({ wake: "08:00", sleep: "00:30", entries: [] })).toEqual({ start: 480, end: 1440 });
  });
});
