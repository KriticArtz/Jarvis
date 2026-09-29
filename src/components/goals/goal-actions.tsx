"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Goal } from "@/lib/types/domain";
import { deleteGoal, setGoalStatus } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";

export function GoalStatusActions({ goal }: { goal: Goal }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const set = (status: Goal["status"]) => startTransition(() => void setGoalStatus(goal.id, status));

  return (
    <div className="flex flex-wrap gap-2">
      {goal.status !== "completed" ? (
        <Button size="sm" disabled={pending} onClick={() => set("completed")}>
          Mark complete
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => set("active")}>
          Reopen
        </Button>
      )}
      {goal.status === "active" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => set("paused")}>
          Pause
        </Button>
      ) : goal.status === "paused" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => set("active")}>
          Resume
        </Button>
      ) : null}
      {goal.status !== "archived" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => set("archived")}>
          Archive
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => set("active")}>
          Unarchive
        </Button>
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete "${goal.title}" and all its progress? This can't be undone. (Archive keeps the history.)`)) return;
          startTransition(async () => {
            await deleteGoal(goal.id);
            router.push("/goals");
          });
        }}
      >
        Delete
      </Button>
    </div>
  );
}

export function DeleteProgressButton({ action }: { action: () => Promise<unknown> }) {
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => void action())} className="text-sm text-muted hover:text-danger">
      Remove
    </button>
  );
}
