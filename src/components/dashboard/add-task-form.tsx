"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";
import { addTask } from "@/lib/actions/tasks";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

/**
 * Quick add, kept quiet: a single row that opens into a short form. Adding
 * closes it again and confirms with a toast; the day refreshes on its own.
 */
export function AddTaskForm({ goals }: { goals: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const [state, action] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const res = await addTask(prev, formData);
    if (res.ok) {
      setOpen(false);
      toast({ title: "Task added", tone: "success" });
    }
    return res;
  }, { ok: false });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-1 pl-1.5 pr-4 text-left text-[15px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-11 items-center justify-center">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-surface-2 text-foreground">
            <Plus className="size-3.5" strokeWidth={2.6} aria-hidden />
          </span>
        </span>
        Add a task
      </button>
    );
  }

  return (
    <form action={action} className="flex animate-fade-in flex-col gap-3 p-4" noValidate>
      <Field label="Task" htmlFor="task-title" error={state.fieldErrors?.title}>
        <Input id="task-title" name="title" placeholder="e.g. Book the dentist" maxLength={200} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Time (optional)" htmlFor="task-time">
          <Input id="task-time" name="scheduled_start" type="time" />
        </Field>
        <Field label="Minutes" htmlFor="task-duration" error={state.fieldErrors?.duration_minutes}>
          <Input id="task-duration" name="duration_minutes" type="number" inputMode="numeric" min={5} max={720} placeholder="30" />
        </Field>
      </div>
      {goals.length ? (
        <Field label="Toward goal" htmlFor="task-goal">
          <Select id="task-goal" name="goal_id" defaultValue="">
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="is_priority" className="size-[18px] accent-[var(--accent)]" /> One of today&apos;s priorities
      </label>
      <FormMessage>{state.ok ? null : state.error}</FormMessage>
      <div className="flex gap-2">
        <SubmitButton pendingText="Adding…">Add task</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-4 text-[15px] text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
