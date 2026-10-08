import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Grouped rows — the default way to present settings, options and short
 * lists instead of stacking cards. A group is one quiet surface with inset
 * hairlines between rows; its title sits above it as an eyebrow.
 */
export function ListGroup({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title ? <h3 className="type-eyebrow mb-2 px-1">{title}</h3> : null}
      <ul className="overflow-hidden rounded-panel bg-surface-raised shadow-card [&>li+li>*]:shadow-[inset_0_1px_0_var(--hairline)]">{children}</ul>
      {footer ? <p className="mt-2 px-1 text-[13px] leading-snug text-muted">{footer}</p> : null}
    </section>
  );
}

interface RowProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icon or avatar on the left. */
  leading?: ReactNode;
  /** Value, switch or badge on the right. */
  trailing?: ReactNode;
  /** A full-width control under the title (e.g. a segmented control that won't fit on the right). */
  below?: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
  className?: string;
}

/**
 * One row: optional leading visual, title + description, trailing control.
 * With `href` or `onClick` the whole row is the target (≥56px tall) and
 * presses down slightly; links get a chevron.
 */
export function ListRow({ title, description, leading, trailing, below, href, onClick, tone = "default", className }: RowProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {leading ? <span className="flex shrink-0 items-center text-muted">{leading}</span> : null}
      <span className="min-w-0 flex-1 py-0.5">
        <span className={cn("block text-[15px] font-medium leading-snug", tone === "danger" && "text-danger")}>{title}</span>
        {description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span> : null}
        {below ? <span className="mt-3 block">{below}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2 text-[14px] text-muted">{trailing}</span> : null}
      {href ? <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden /> : null}
    </>
  );
  const cls = cn(
    "flex min-h-14 w-full gap-3.5 px-4 py-3 text-left",
    below ? "items-start" : "items-center",
    interactive && "transition-[background-color,transform] duration-(--dur-2) ease-soft hover:bg-surface-2/60 active:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2",
    className,
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
