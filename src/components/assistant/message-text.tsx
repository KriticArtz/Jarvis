import { parseReply, type Inline } from "@/lib/assistant/format";

function Line({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => (p.strong ? <strong key={i} className="font-semibold text-foreground">{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/**
 * An assistant reply as typography: paragraphs, lists and bold — rendered
 * as React elements from parsed text, never as HTML.
 */
export function MessageText({ text }: { text: string }) {
  const blocks = parseReply(text);
  return (
    <div className="flex flex-col gap-3.5 text-[17px] leading-[1.6] text-foreground/90">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                <Line parts={l} />
              </span>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="flex flex-col gap-1.5 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-subtle" />
                <span className="min-w-0">
                  <Line parts={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="flex flex-col gap-1.5 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="type-time mt-[3px] w-5 shrink-0 text-right text-[13px] text-subtle">
                  {j + 1}.
                </span>
                <span className="min-w-0">
                  <Line parts={item} />
                </span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
