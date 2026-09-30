"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Goal } from "@/lib/types/domain";
import { createGoal } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GoalForm } from "./goal-form";
import { GoalRanker } from "./goal-ranker";
import { usePersonalization } from "@/components/app/personalization";

export function GoalsToolbar({ activeGoals, startOpen }: { activeGoals: Goal[]; startOpen: boolean }) {
  const { assistantName } = usePersonalization();
  const [mode, setMode] = useState<"none" | "new" | "rank">(startOpen ? "new" : "none");
  return (
    <div className="mb-5 flex flex-col gap-4">
      <div className="flex gap-2">
        <Button onClick={() => setMode(mode === "new" ? "none" : "new")} aria-expanded={mode === "new"}>
          <Plus className="size-4" /> New goal
        </Button>
        {activeGoals.length > 1 ? (
          <Button variant="secondary" onClick={() => setMode(mode === "rank" ? "none" : "rank")} aria-expanded={mode === "rank"}>
            Reorder
          </Button>
        ) : null}
      </div>
      {mode === "new" ? (
        <Card className="animate-fade-in">
          <GoalForm action={createGoal} submitLabel="Add goal" showTemplates onSaved={() => setMode("none")} />
        </Card>
      ) : null}
      {mode === "rank" ? (
        <Card className="animate-fade-in">
          <p className="mb-3 text-sm text-muted">What matters most right now? {assistantName} prioritizes the top goals when time is tight.</p>
          <GoalRanker goals={activeGoals} onSaved={() => setMode("none")} />
        </Card>
      ) : null}
    </div>
  );
}
