"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Marks its children as shown (data-shown) once it scrolls into view, which
 * plays the CSS reveal/stagger in globals.css (.landing .r). Plays once. With
 * no IntersectionObserver, or reduced motion, everything shows immediately.
 */
export function Reveal({
  children,
  className,
  threshold = 0.25,
  onShow,
  id,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
  onShow?: () => void;
  id?: string;
  as?: "div" | "section" | "li" | "ul";
}) {
  const ref = useRef<HTMLElement>(null);
  const shown = useRef(onShow);
  useEffect(() => {
    shown.current = onShow;
  }, [onShow]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => {
      el.dataset.shown = "true";
      shown.current?.();
    };
    if (typeof IntersectionObserver === "undefined") return show();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show();
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <Tag ref={ref as never} id={id} data-reveal="" className={cn(className)}>
      {children}
    </Tag>
  );
}
