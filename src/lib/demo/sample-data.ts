import { addDays, isoWeekday, weekStart } from "@/lib/time";

/**
 * Sample data for demo sessions, laid out relative to the visitor's "today"
 * so the demo always looks current. Pure (no I/O) so it can be unit-tested.
 */

export type DemoGoalKey = "exercise" | "school" | "business" | "savings";

export interface DemoGoal {
  key: DemoGoalKey;
  title: string;
  description: string;
  category: string;
  goal_type: "recurring" | "one_time";
  target_value: number;
  target_unit: string;
  period: "day" | "week" | "month" | null;
  priority: "high" | "medium" | "low";
  rank: number;
}

export interface DemoTask {
  goal: DemoGoalKey | null;
  title: string;
  task_date: string;
  scheduled_start: string | null;
  duration_minutes: number;
  is_priority: boolean;
  status: "pending" | "done" | "skipped";
}

export interface DemoProgress {
  goal: DemoGoalKey;
  amount: number;
  logged_for: string;
  source: "task" | "manual";
  note: string | null;
}

export const DEMO_PROFILE = {
  wake_time: "06:30",
  sleep_time: "23:00",
  work_start: "09:00",
  work_end: "17:00",
  work_days: [1, 2, 3, 4, 5],
  work_label: "Work",
  accountability_style: "balanced" as const,
  // Demo accounts start with (and reset to) the default assistant name,
  // personality and theme.
  assistant_name: null,
  assistant_personality: null,
  theme: null,
  appearance: null,
};

export const DEMO_COMMITMENTS = [
  { title: "Commute home", days_of_week: [1, 2, 3, 4, 5], start_time: "17:00", end_time: "17:30" },
  { title: "Online class", days_of_week: [2, 4], start_time: "20:30", end_time: "21:30" },
];

export const DEMO_GOALS: DemoGoal[] = [
  {
    key: "exercise",
    title: "Exercise",
    description: "Feel stronger and sleep better. Right after work is when it actually happens.",
    category: "fitness",
    goal_type: "recurring",
    target_value: 4,
    target_unit: "times",
    period: "week",
    priority: "high",
    rank: 0,
  },
  {
    key: "school",
    title: "Finish college coursework",
    description: "Online degree — capstone project due in December. Studying goes better before 9 PM.",
    category: "school",
    goal_type: "recurring",
    target_value: 5,
    target_unit: "hours",
    period: "week",
    priority: "high",
    rank: 1,
  },
  {
    key: "business",
    title: "Build my business",
    description: "Freelance design studio on the side. Goal: three paying clients by spring.",
    category: "business",
    goal_type: "recurring",
    target_value: 30,
    target_unit: "minutes",
    period: "day",
    priority: "medium",
    rank: 2,
  },
  {
    key: "savings",
    title: "Emergency fund",
    description: "Build a $1,000 cushion before the end of the year.",
    category: "money",
    goal_type: "one_time",
    target_value: 1000,
    target_unit: "dollars",
    period: null,
    priority: "low",
    rank: 3,
  },
];

export const DEMO_MEMORIES = [
  "I'm most focused before 9 PM — late study sessions usually don't happen.",
  "I'd rather study first and work out after, when I can.",
];

/**
 * Build the sample history ending yesterday, plus today's plan. Today's items
 * whose time has already passed (`nowMinutes`, local) are marked done, so the
 * current week never looks empty — even on a Monday evening.
 */
export function buildDemoData(today: string, nowMinutes = 0) {
  const tasks: DemoTask[] = [];
  const progress: DemoProgress[] = [];
  const thisWeek = weekStart(today);
  const start = addDays(thisWeek, -7);

  for (let d = start, i = 0; d < today; d = addDays(d, 1), i++) {
    const wd = isoWeekday(d);
    const weekday = wd <= 5;

    // Exercise: Mon/Wed/Fri/Sat, with an occasional miss.
    if ([1, 3, 5, 6].includes(wd)) {
      const done = i % 6 !== 4;
      tasks.push({ goal: "exercise", title: "Workout", task_date: d, scheduled_start: weekday ? "17:45" : "09:00", duration_minutes: 45, is_priority: true, status: done ? "done" : "pending" });
      if (done) progress.push({ goal: "exercise", amount: 1, logged_for: d, source: "task", note: null });
    }

    // Coursework: evening sessions slip more often than weekend mornings.
    if (weekday && wd !== 2 && wd !== 4) {
      const done = i % 3 !== 1;
      tasks.push({ goal: "school", title: "Coursework session", task_date: d, scheduled_start: "19:30", duration_minutes: 60, is_priority: true, status: done ? "done" : "pending" });
      if (done) progress.push({ goal: "school", amount: 1, logged_for: d, source: "task", note: null });
    }
    if (wd === 6 || wd === 7) {
      tasks.push({ goal: "school", title: "Capstone deep work", task_date: d, scheduled_start: "10:30", duration_minutes: 90, is_priority: true, status: "done" });
      progress.push({ goal: "school", amount: 1.5, logged_for: d, source: "task", note: null });
    }

    // Business: most days, 20–30 minutes at lunch.
    if (i % 4 !== 3) {
      const minutes = i % 2 === 0 ? 30 : 20;
      tasks.push({ goal: "business", title: "Client outreach", task_date: d, scheduled_start: "12:30", duration_minutes: minutes, is_priority: false, status: "done" });
      progress.push({ goal: "business", amount: minutes, logged_for: d, source: "task", note: null });
    }
  }

  // Savings: a few deposits over the last weeks.
  progress.push({ goal: "savings", amount: 250, logged_for: addDays(today, -20), source: "manual", note: "Paycheck" });
  progress.push({ goal: "savings", amount: 120, logged_for: addDays(today, -9), source: "manual", note: "Sold old monitor" });
  progress.push({ goal: "savings", amount: 150, logged_for: addDays(today, -2), source: "manual", note: "Paycheck" });

  // Today. Anything already in the past is done (and logged); the rest is still ahead.
  const todays: Omit<DemoTask, "task_date" | "status">[] = [
    { goal: null, title: "Morning walk + stretch", scheduled_start: "07:00", duration_minutes: 20, is_priority: false },
    { goal: "business", title: "Email 3 potential clients", scheduled_start: "12:30", duration_minutes: 30, is_priority: false },
    { goal: "exercise", title: "Workout — upper body", scheduled_start: "18:00", duration_minutes: 45, is_priority: true },
    { goal: "school", title: "Capstone: draft section 3", scheduled_start: "19:15", duration_minutes: 60, is_priority: true },
  ];
  for (const t of todays) {
    const [h, m] = (t.scheduled_start ?? "00:00").split(":").map(Number);
    const done = nowMinutes >= h * 60 + m + t.duration_minutes;
    tasks.push({ ...t, task_date: today, status: done ? "done" : "pending" });
    if (done && t.goal) {
      const amount = t.goal === "business" ? t.duration_minutes : t.goal === "school" ? t.duration_minutes / 60 : 1;
      progress.push({ goal: t.goal, amount, logged_for: today, source: "task", note: null });
    }
  }

  const yesterday = addDays(today, -1);
  const checkIn = {
    check_in_date: yesterday,
    kind: "evening" as const,
    rating: 3,
    content: "Got the workout in. Skipped studying again — too tired after 9.",
  };

  return { tasks, progress, checkIn };
}
