"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface Insight {
  content: string;
  source: "ai" | "rules";
}

/** Loads today's insight after first paint so the dashboard never waits on AI. */
export function InsightCard() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchInsight = (refresh: boolean) =>
    fetch(`/api/insight${refresh ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setInsight(await res.json());
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

  useEffect(() => {
    void fetchInsight(false);
  }, []);

  const load = (refresh: boolean) => {
    setLoading(true);
    void fetchInsight(refresh);
  };

  return (
    <Card className="bg-accent-soft/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Insight for today</p>
            <button type="button" onClick={() => load(true)} disabled={loading} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-40" aria-label="Refresh insight">
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
          </div>
          {loading && !insight ? (
            <div className="mt-2 space-y-2">
              <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface" />
            </div>
          ) : error ? (
            <p className="mt-1 text-sm text-muted">Couldn&apos;t load an insight right now.</p>
          ) : insight ? (
            <>
              <p className="mt-1 leading-relaxed">{insight.content}</p>
              {insight.source === "rules" ? <p className="mt-1.5 text-xs text-muted">Based on your data (AI not configured)</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
