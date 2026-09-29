/** Suggestions only — users can type any category or unit. */
export const CATEGORY_SUGGESTIONS = ["fitness", "health", "school", "career", "business", "money", "reading", "relationships", "personal", "other"];

export const UNIT_OPTIONS = [
  { value: "times", label: "times" },
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "dollars", label: "dollars" },
  { value: "pages", label: "pages" },
];

export interface GoalTemplate {
  label: string;
  title: string;
  category: string;
  goal_type: "recurring" | "one_time";
  target_value?: number;
  target_unit?: string;
  period?: "day" | "week" | "month";
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { label: "Lose weight", title: "Lose weight", category: "health", goal_type: "one_time" },
  { label: "Finish school", title: "Finish my degree", category: "school", goal_type: "recurring", target_value: 5, target_unit: "hours", period: "week" },
  { label: "Save money", title: "Save money", category: "money", goal_type: "one_time", target_value: 300, target_unit: "dollars" },
  { label: "Build a business", title: "Work on my business", category: "business", goal_type: "recurring", target_value: 30, target_unit: "minutes", period: "day" },
  { label: "Read more", title: "Read", category: "reading", goal_type: "recurring", target_value: 20, target_unit: "minutes", period: "day" },
  { label: "Exercise consistently", title: "Work out", category: "fitness", goal_type: "recurring", target_value: 4, target_unit: "times", period: "week" },
  { label: "Improve relationships", title: "Quality time with people I care about", category: "relationships", goal_type: "recurring", target_value: 2, target_unit: "times", period: "week" },
];

export const WEEKDAY_OPTIONS = [
  { value: 1, short: "M", label: "Monday" },
  { value: 2, short: "T", label: "Tuesday" },
  { value: 3, short: "W", label: "Wednesday" },
  { value: 4, short: "T", label: "Thursday" },
  { value: 5, short: "F", label: "Friday" },
  { value: 6, short: "S", label: "Saturday" },
  { value: 7, short: "S", label: "Sunday" },
];
