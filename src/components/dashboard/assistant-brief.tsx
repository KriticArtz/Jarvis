"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, Check, Crosshair, RefreshCw, Sunrise } from "lucide-react";
import type { Focus } from "@/lib/dashboard/today";
import { setTaskStatus } from "@/lib/actions/tasks";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { usePersonalization } from "@/components/app/personalization";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface Insight {
  content: string;
  source: "ai" | "rules";
}

export interface NextUp {
  id: string;
  title: string;
  when: string | null;
  meta: string | null;
}

/**
 * The top of Today: the assistant's note for the day (loaded after first
 * paint so the page never waits on AI), today's focus, the next action with a
 * one-tap "done", and a quick way to ask the assistant anything.
 */
export function AssistantBrief({ status, focus, nextUp }: { status: string; focus: Focus; nextUp: NextUp | null }) {
  const { assistantName } = usePersonalization();

  return (
    <section className="bg-assistant animate-rise rounded-[30px] p-5 shadow-lift sm:p-7" aria-labelledby="brief-title">
      <InsightNote assistantName={assistantName} status={status} />

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <FocusTile focus={focus} />
        <NextUpTile nextUp={nextUp} />
      </div>

      <form action="/assistant" method="get" className="mt-4 flex items-center gap-2 rounded-full bg-surface p-1.5 pl-4 shadow-card transition-shadow focus-within:ring-4 focus-within:ring-ring">
        <label htmlFor="ask-assistant" className="sr-only">
          Ask {assistantName}
        </label>
        <input
          id="ask-assistant"
          name="q"
          required
          maxLength={4000}
          autoComplete="off"
          placeholder={`Ask ${assistantName} anything…`}
          className="min-h-10 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform active:scale-90"
          aria-label={`Send to ${assistantName}`}
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </section>
  );
}

function InsightNote({ assistantName, status }: { assistantName: string; status: string }) {
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

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <AssistantAvatar name={assistantName} />
          <p id="brief-title" className="min-w-0 truncate text-[14px] font-semibold">
            {assistantName} <span className="font-normal text-muted">· {status}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchInsight(true);
          }}
          disabled={loading}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
          aria-label={`Refresh ${assistantName}'s note`}
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
          <p className="animate-fade-in text-[19px] leading-[1.45] tracking-[-0.012em] sm:text-[21px]">{insight.content}</p>
        ) : null}
        {insight?.source === "rules" ? <p className="mt-2 text-[12px] text-muted">From your data · AI not configured</p> : null}
      </div>
    </>
  );
}

function Tile({ icon, label, children, aside }: { icon: React.ReactNode; label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[22px] bg-surface/80 p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-muted">
          {icon}
          {label}
        </p>
        {aside}
      </div>
      {children}
    </div>
  );
}

function FocusTile({ focus }: { focus: Focus }) {
  return (
    <Tile icon={<Crosshair className="size-3.5 text-accent" aria-hidden />} label="Today's focus">
      {focus ? (
        <>
          <p className={cn("mt-2 line-clamp-2 text-[17px] font-semibold leading-snug", focus.kind === "priority" && focus.done && "text-muted line-through")}>
            {focus.title}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {focus.kind === "intention" ? "Your #1 for today" : focus.kind === "priority" ? (focus.done ? "Done — nice work" : "Top priority") : focus.progress || "Your top goal"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-muted">
          <Link href="/goals" className="font-medium text-accent hover:underline">
            Add a goal
          </Link>{" "}
          to set your focus.
        </p>
      )}
    </Tile>
  );
}

function NextUpTile({ nextUp }: { nextUp: NextUp | null }) {
  const [pending, startTransition] = useTransition();
  const [doneId, setDoneId] = useState<string | null>(null);
  const done = nextUp != null && doneId === nextUp.id;

  return (
    <Tile
      icon={<Sunrise className="size-3.5 text-accent" aria-hidden />}
      label="Next up"
      aside={nextUp?.when ? <span className="text-[13px] font-semibold tabular-nums text-accent">{nextUp.when}</span> : null}
    >
      {nextUp ? (
        <>
          <p className={cn("mt-2 line-clamp-2 text-[17px] font-semibold leading-snug transition-opacity", done && "text-muted line-through opacity-60")}>{nextUp.title}</p>
          {nextUp.meta ? <p className="mt-1 truncate text-[13px] text-muted">{nextUp.meta}</p> : null}
          <div className="mt-3">
            <Button
              size="sm"
              variant={done ? "secondary" : "primary"}
              disabled={pending || done}
              onClick={() =>
                startTransition(async () => {
                  setDoneId(nextUp.id);
                  const res = await setTaskStatus(nextUp.id, "done");
                  if (!res.ok) setDoneId(null);
                })
              }
            >
              <Check className="size-4" strokeWidth={2.6} aria-hidden /> {done ? "Done" : "Mark done"}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-muted">
          Nothing pending.{" "}
          <Link href="/plan" className="font-medium text-accent hover:underline">
            Plan the rest of your day
          </Link>
        </p>
      )}
    </Tile>
  );
}
