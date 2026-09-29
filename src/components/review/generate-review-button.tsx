"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateWeeklyReview } from "@/lib/actions/review";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

export function GenerateReviewButton({ week, hasReview }: { week: string; hasReview: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={hasReview ? "secondary" : "primary"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await generateWeeklyReview(week);
            setError(res.ok ? null : (res.error ?? "Couldn't generate the review."));
          })
        }
      >
        {pending ? <Spinner /> : <Sparkles className="size-4" />}
        {pending ? "Reviewing your week…" : hasReview ? "Refresh summary" : "Generate my weekly review"}
      </Button>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}
