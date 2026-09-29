import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

type Msg = { from: "ai" | "me"; text: string; time?: string };

/** Illustrative text-message thread in a neutral phone frame (no real device branding). */
export function PhoneMock({ messages, className }: { messages: Msg[]; className?: string }) {
  return (
    <div className={cn("relative mx-auto w-[300px] shrink-0 rounded-[48px] bg-[#0f1113] p-[10px] shadow-[0_40px_80px_-30px_rgba(16,24,40,0.45)]", className)} aria-label="Example text conversation">
      <div className="overflow-hidden rounded-[40px] bg-surface">
        <div className="flex flex-col items-center gap-1 border-b border-hairline bg-surface-2/60 pb-3 pt-7">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient text-[15px] font-semibold text-white">{brand.name.charAt(0)}</span>
          <span className="text-[12px] font-semibold">{brand.name}</span>
        </div>
        <div className="flex min-h-[380px] flex-col gap-2 px-3 py-4 text-left text-[14px] leading-snug">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col", m.from === "me" ? "items-end" : "items-start")}>
              {m.time ? <span className="mb-1 self-center text-[10.5px] text-muted">{m.time}</span> : null}
              <p
                className={cn(
                  "max-w-[82%] animate-rise rounded-[20px] px-3.5 py-2",
                  m.from === "me" ? "rounded-br-[6px] bg-accent text-accent-foreground" : "rounded-bl-[6px] bg-surface-2 text-foreground",
                )}
                style={{ animationDelay: `${250 + i * 260}ms` }}
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
