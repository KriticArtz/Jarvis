"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";
import { addTask } from "@/lib/actions/tasks";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddTaskForm({ goals }: { goals: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(addTask, { ok: false });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 py-3.5 text-left text-[16px] text-accent transition-opacity hover:opacity-80">
        <span className="flex size-[26px] items-center justify-center rounded-full bg-accent-soft">
          <Plus className="size-4" strokeWidth={2.5} />
        </span>
        Add a task
      </button>
    );
  }

  return (
    <form action={action} className="flex animate-fade-in flex-col gap-3 py-4" noValidate>
      <Field label="Task" htmlFor="task-title" error={state.fieldErrors?.title}>
        <Input id="task-title" name="title" placeholder="e.g. Finish chapter 3" maxLength={200} autoFocus />
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
      <label className="flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="is_priority" className="size-[18px] accent-[var(--accent)]" /> One of today&apos;s priorities
      </label>
      <FormMessage>{state.ok ? null : state.error}</FormMessage>
      <div className="flex gap-2">
        <SubmitButton pendingText="Adding…">Add task</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 text-[15px] text-muted hover:text-foreground">
          Done
        </button>
      </div>
    </form>
  );
}
