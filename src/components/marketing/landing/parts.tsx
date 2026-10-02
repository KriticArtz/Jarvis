import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { ProgressBar } from "@/components/ui/progress-bar";

/**
 * Building blocks for the landing page's product scenes. They reuse the app's
 * own pieces (assistant avatar, chat bubble shapes, action chips, progress
 * bars) so the page shows what Jarvis actually looks like.
 */

export const ASSISTANT = brand.assistantName;

export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Bubble({ from, children, className, style }: { from: "me" | "ai"; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("r flex", from === "me" ? "justify-end" : "justify-start", className)} style={style}>
      <p
        className={cn(
          "max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-[1.45] sm:max-w-[82%]",
          from === "me" ? "rounded-br-[7px] bg-accent text-accent-foreground" : "rounded-bl-[7px] bg-surface-2 text-foreground",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** "…" while the assistant is "thinking"; disappears before the reply. */
export function Typing({ at, life = 1000 }: { at: number; life?: number }) {
  return (
    <div className="typing flex text-muted" style={{ "--d": `${at}ms`, "--life": `${life}ms` } as CSSProperties} aria-hidden>
      <span className="inline-flex items-center gap-1 rounded-[20px] rounded-bl-[7px] bg-surface-2 px-4 py-3.5">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

/** The app's "done" action chip. */
export function DoneChip({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <p className={cn("r inline-flex items-start gap-1.5 rounded-2xl bg-success-soft px-3 py-1.5 text-[13px] leading-snug text-success", className)} style={style}>
      <Check className="mt-[2px] size-3.5 shrink-0" strokeWidth={3} aria-hidden /> {children}
    </p>
  );
}

export function AssistantHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
      <AssistantAvatar name={ASSISTANT} className="size-9 text-[15px]" />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight">{ASSISTANT}</p>
        <p className="truncate text-[12.5px] text-muted">{subtitle}</p>
      </div>
      <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted">
        <span className="size-1.5 rounded-full bg-success" /> Online
      </span>
    </div>
  );
}

export function PanelTitle({ icon, children, aside }: { icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-muted">
      <span className="text-accent">{icon}</span>
      {children}
      {aside ? <span className="ml-auto normal-case tracking-normal">{aside}</span> : null}
    </div>
  );
}

export function GoalRow({ title, detail, value }: { title: string; detail: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 text-[12px] text-muted">{detail}</span>
      </div>
      <div aria-hidden className="mt-1.5">
        <ProgressBar value={value} label={title} />
      </div>
    </div>
  );
}

/** Section heading used across the page. */
export function SectionIntro({ eyebrow, title, children, className, center }: { eyebrow: string; title: ReactNode; children?: ReactNode; className?: string; center?: boolean }) {
  return (
    <div className={cn(center && "mx-auto text-center", "max-w-2xl", className)}>
      <p className="r text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 className="r mt-3 text-[34px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[46px]" style={delay(60)}>
        {title}
      </h2>
      {children ? (
        <p className="r mt-4 text-[17px] leading-relaxed text-muted sm:text-[18px]" style={delay(120)}>
          {children}
        </p>
      ) : null}
    </div>
  );
}
