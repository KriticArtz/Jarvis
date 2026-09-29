"use client";

import { useActionState, useState } from "react";
import type { Goal } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { CATEGORY_SUGGESTIONS, GOAL_TEMPLATES, UNIT_OPTIONS, type GoalTemplate } from "@/lib/goal-options";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

interface Values {
  title: string;
  description: string;
  category: string;
  goal_type: "recurring" | "one_time";
  target_value: string;
  target_unit: string;
  period: string;
  due_date: string;
  priority: string;
}

function toValues(goal?: Partial<Goal> | GoalTemplate): Values {
  const g = (goal ?? {}) as Partial<Goal>;
  return {
    title: g.title ?? "",
    description: g.description ?? "",
    category: g.category ?? "",
    goal_type: g.goal_type ?? "recurring",
    target_value: g.target_value != null ? String(g.target_value) : "",
    target_unit: g.target_unit ?? "times",
    period: g.period ?? "week",
    due_date: g.due_date ?? "",
    priority: g.priority ?? "medium",
  };
}

/**
 * Create/edit form for goals. Supports recurring goals ("4 times per week")
 * and one-time goals ("save $300 by Dec 1"). Categories and units are free-form.
 */
export function GoalForm({
  action,
  goal,
  submitLabel = "Save goal",
  showTemplates = false,
  onSaved,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  goal?: Goal;
  submitLabel?: string;
  showTemplates?: boolean;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<Values>(() => toValues(goal));
  const isPreset = (unit: string) => UNIT_OPTIONS.some((u) => u.value === unit);
  const [customUnit, setCustomUnit] = useState(() => !isPreset(toValues(goal).target_unit));
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      if (!goal) {
        setValues(toValues());
        setCustomUnit(false);
        setFormKey((k) => k + 1);
      }
      onSaved?.();
    }
    return result;
  }, { ok: false });

  const set = <K extends keyof Values>(key: K, v: Values[K]) => setValues((prev) => ({ ...prev, [key]: v }));
  const err = state.fieldErrors ?? {};

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
      {showTemplates ? (
        <div>
          <p className="mb-2 text-sm text-muted">Start from an example, or write your own:</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setValues(toValues(t));
                  setCustomUnit(false);
                }}
                className="rounded-full bg-surface-2 px-3.5 py-1.5 text-sm transition-all hover:bg-accent-soft hover:text-accent active:scale-95"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Field label="Goal" htmlFor="title" error={err.title}>
        <Input id="title" name="title" value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Work out" required maxLength={120} aria-invalid={!!err.title} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="category" error={err.category}>
          <Input id="category" name="category" list="category-suggestions" value={values.category} onChange={(e) => set("category", e.target.value)} placeholder="fitness" maxLength={40} />
          <datalist id="category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" value={values.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["recurring", "Ongoing habit", "e.g. 4 times a week"],
              ["one_time", "One-time goal", "e.g. save $300"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-2xl border-2 p-3.5 text-sm transition-all duration-200",
                values.goal_type === value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2 hover:bg-surface-2/70",
              )}
            >
              <input type="radio" name="goal_type" value={value} checked={values.goal_type === value} onChange={() => set("goal_type", value)} className="sr-only" />
              <span className="block font-medium">{label}</span>
              <span className="text-muted">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-[1fr_1.2fr] gap-3 sm:grid-cols-3">
        <Field label="Target" htmlFor="target_value" error={err.target_value} hint="Optional">
          <Input id="target_value" name="target_value" type="number" inputMode="decimal" min="0" step="any" value={values.target_value} onChange={(e) => set("target_value", e.target.value)} placeholder="4" aria-invalid={!!err.target_value} />
        </Field>
        <Field label="Unit" htmlFor="target_unit">
          <Select
            id="target_unit"
            name="target_unit"
            value={customUnit ? "__custom" : values.target_unit}
            onChange={(e) => {
              const custom = e.target.value === "__custom";
              setCustomUnit(custom);
              set("target_unit", custom ? "" : e.target.value);
            }}
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
            <option value="__custom">other…</option>
          </Select>
        </Field>
        {values.goal_type === "recurring" ? (
          <Field label="Every" htmlFor="period" error={err.period} className="col-span-2 sm:col-span-1">
            <Select id="period" name="period" value={values.period} onChange={(e) => set("period", e.target.value)}>
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
            </Select>
          </Field>
        ) : (
          <Field label="By (optional)" htmlFor="due_date" error={err.due_date} className="col-span-2 sm:col-span-1">
            <Input id="due_date" name="due_date" type="date" value={values.due_date} onChange={(e) => set("due_date", e.target.value)} />
          </Field>
        )}
      </div>
      {customUnit ? (
        <Field label="Custom unit" htmlFor="target_unit_custom">
          <Input id="target_unit_custom" name="target_unit_custom" value={values.target_unit} onChange={(e) => set("target_unit", e.target.value)} placeholder="e.g. lbs, chapters" maxLength={24} />
        </Field>
      ) : null}

      <Field label="Why it matters / notes" htmlFor="description" hint="Optional — your assistant uses this for context.">
        <Textarea id="description" name="description" value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} rows={2} />
      </Field>

      <FormMessage>{state.ok ? null : state.error}</FormMessage>
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
