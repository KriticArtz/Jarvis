"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { createEventAction, updateEventAction, type CalendarEventForm } from "@/lib/actions/calendar";
import { GOOGLE_EVENT_COLORS } from "@/lib/integrations/calendar/view";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface EventFormValues {
  title: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  /** undefined = not loaded (left unchanged on save). */
  description: string | undefined;
  colorId: string | null;
}

/**
 * Create or edit an event. Saving is the user's explicit confirmation; the
 * server re-checks the user, the event's ownership and the connection.
 * New events carry a request id so a double-submit can't create two.
 */
export function EventForm({
  mode,
  eventId,
  initial,
  recurring,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  eventId?: string;
  initial: EventFormValues;
  recurring?: boolean;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EventFormValues>(k: K, value: EventFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const overnight = !v.allDay && v.startTime && v.endTime && v.endTime < v.startTime;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const payload: CalendarEventForm = {
      title: v.title,
      allDay: v.allDay,
      date: v.date,
      endDate: v.allDay ? v.endDate || v.date : null,
      startTime: v.allDay ? null : v.startTime || null,
      endTime: v.allDay ? null : v.endTime || null,
      location: v.location.trim() || null,
      description: v.description === undefined ? undefined : v.description.trim() || null,
      colorId: v.colorId,
    };
    startTransition(async () => {
      const res = mode === "create" ? await createEventAction({ ...payload, requestId }) : await updateEventAction({ ...payload, id: eventId! });
      if (res.ok) onSaved(res.message ?? "Saved.");
      else {
        setError(res.error ?? "Something went wrong.");
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  const err = (k: string) => fieldErrors[k];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h2 className="text-[22px] font-bold leading-tight">{mode === "create" ? "New event" : "Edit event"}</h2>
      {recurring ? <p className="-mt-2 text-[14px] text-muted">This is a repeating event — changes apply to this occurrence only.</p> : null}

      <Field label="Title" htmlFor="ev-title" error={err("title")}>
        <Input id="ev-title" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required autoFocus aria-invalid={Boolean(err("title"))} />
      </Field>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4">
        <span className="text-[15px] font-medium">All day</span>
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} />
      </label>

      {v.allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="ev-date" error={err("date")}>
            <Input id="ev-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Ends" htmlFor="ev-end-date" error={err("endDate")}>
            <Input id="ev-end-date" type="date" value={v.endDate || v.date} min={v.date} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor="ev-date" error={err("date")} className="col-span-2 sm:col-span-1">
            <Input id="ev-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field label="Starts" htmlFor="ev-start" error={err("startTime")}>
            <Input id="ev-start" type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} required step={300} />
          </Field>
          <Field label="Ends" htmlFor="ev-end" error={err("endTime")} hint={overnight ? "Ends the next day" : undefined}>
            <Input id="ev-end" type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} required step={300} />
          </Field>
        </div>
      )}

      <Field label="Location" htmlFor="ev-location" error={err("location")}>
        <Input id="ev-location" value={v.location} onChange={(e) => set("location", e.target.value)} maxLength={300} placeholder="Optional" />
      </Field>

      {v.description !== undefined ? (
        <Field label="Notes" htmlFor="ev-notes" error={err("description")}>
          <Textarea id="ev-notes" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} placeholder="Optional" />
        </Field>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-1.5">
          {[null, ...Object.keys(GOOGLE_EVENT_COLORS)].map((id) => {
            const selected = v.colorId === id;
            const name = id ? GOOGLE_EVENT_COLORS[id].name : "Default";
            return (
              <button
                key={id ?? "default"}
                type="button"
                onClick={() => set("colorId", id)}
                aria-pressed={selected}
                aria-label={name}
                title={name}
                className="flex size-11 items-center justify-center rounded-full"
              >
                <span
                  className={cn("flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-shadow", selected && "ring-2 ring-foreground")}
                  style={{ background: id ? GOOGLE_EVENT_COLORS[id].hex : "var(--accent)" }}
                >
                  {selected ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div aria-live="polite">{error ? <FormMessage>{error}</FormMessage> : null}</div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : mode === "create" ? "Add to calendar" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
