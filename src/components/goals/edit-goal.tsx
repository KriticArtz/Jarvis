"use client";

import { useState } from "react";
import type { Goal } from "@/lib/types/domain";
import { updateGoal } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { GoalForm } from "./goal-form";

export function EditGoal({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit goal
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <GoalForm action={updateGoal.bind(null, goal.id)} goal={goal} submitLabel="Save changes" onSaved={() => setOpen(false)} />
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
