"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { brand } from "@/config/brand";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/cn";

interface Insight {
  content: string;
  source: "ai" | "rules";
}

/** The assistant's note for today. Loads after first paint so the page never waits on AI. */
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
    <section className="bg-assistant animate-rise rounded-[28px] p-5 shadow-card sm:p-6" aria-labelledby="insight-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-7" />
          <p id="insight-title" className="text-[14px] font-semibold">
            {brand.assistantName} <span className="font-normal text-muted">· your plan for today</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>
      <div className="mt-3 min-h-[3.2em]" aria-live="polite">
        {loading && !insight ? (
          <div className="space-y-2.5 pt-1">
            <div className="h-4 w-full animate-pulse rounded-full bg-surface-2" />
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-2" />
          </div>
        ) : error ? (
          <p className="text-muted">Couldn&apos;t load today&apos;s note right now.</p>
        ) : insight ? (
          <p className="animate-fade-in text-[18px] leading-[1.5] tracking-[-0.01em] sm:text-[19px]">{insight.content}</p>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Link href="/assistant" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent transition-[gap] hover:gap-2.5">
          Ask a follow-up <ArrowRight className="size-4" />
        </Link>
        {insight?.source === "rules" ? <span className="text-[12px] text-muted">From your data · AI not configured</span> : null}
      </div>
    </section>
  );
}
