"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Same five states as the live Presence (src/components/ui/presence.tsx), so the seal can replace it without API changes. */
export type SealState = "idle" | "listening" | "thinking" | "acting" | "complete";
const SEAL_STATES: SealState[] = ["idle", "listening", "thinking", "acting", "complete"];

const LABEL: Record<SealState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  acting: "Working on it",
  complete: "Done",
};

/**
 * PREVIEW of the Arovenna seal. `emblem` is the URL of the supplied logo
 * image; the face shows a circular crop of its A emblem (see .seal-emblem).
 * Without it, a labelled placeholder stands in — never a substitute logo.
 */
export function Seal({ state = "idle", size = 96, emblem }: { state?: SealState; size?: number; emblem: string | null }) {
  return (
    <span
      className="seal"
      data-state={state}
      style={{ "--s": `${size}px`, ...(emblem ? { "--emblem": `url(${emblem})` } : {}) } as CSSProperties}
      role="img"
      aria-label={`Arovenna — ${LABEL[state]}`}
    >
      <span className="seal-halo" />
      <span className="seal-impression" />
      <svg className="seal-ring" viewBox="0 0 100 100" aria-hidden>
        <circle className="track" cx="50" cy="50" r="49" />
        {/* Start the arc at 12 o'clock; the CSS rotation (thinking) turns the circle itself. */}
        <g transform="rotate(-90 50 50)">
          <circle className="arc" cx="50" cy="50" r="49" pathLength={100} />
        </g>
      </svg>
      <span className="seal-face">
        {emblem ? <span className="seal-emblem" /> : <span className="seal-placeholder">Emblem</span>}
        <span className="seal-sheen" />
      </span>
    </span>
  );
}

export function SealStateLabel({ state }: { state: SealState }) {
  return <>{LABEL[state]}</>;
}

/**
 * Step through the states by hand (review only). There is deliberately no
 * autoplay: the seal must never imply activity that isn't happening. "Complete"
 * returns to idle on its own, as it does after a real action finishes.
 */
export function SealLab({ emblem }: { emblem: string | null }) {
  const [state, setState] = useState<SealState>("idle");
  useEffect(() => {
    if (state !== "complete") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <div className="flex flex-col items-center gap-4">
        <Seal state={state} size={144} emblem={emblem} />
        <p className="serif text-[24px] leading-none" aria-live="polite">
          <SealStateLabel state={state} />
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start" role="group" aria-label="Seal state">
        {SEAL_STATES.map((s) => (
          <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)} className={`btn ${state === s ? "btn-primary" : "btn-secondary"} capitalize`}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Toggle to preview reduced motion without changing the OS setting. */
export function MotionToggle() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".arv").forEach((el) => {
      if (reduce) el.dataset.motion = "reduce";
      else delete el.dataset.motion;
    });
  }, [reduce]);
  return (
    <button type="button" aria-pressed={reduce} onClick={() => setReduce((r) => !r)} className="btn btn-secondary whitespace-nowrap">
      {reduce ? "Motion: reduced" : "Motion: full"}
    </button>
  );
}
