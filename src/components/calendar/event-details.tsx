"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, ExternalLink, MapPin, Repeat, Users } from "lucide-react";
import { deleteEventAction, getEventDetailsAction } from "@/lib/actions/calendar";
import type { EventDetails } from "@/lib/integrations/calendar/mutations";
import type { LocalCalendarEvent } from "@/lib/integrations/calendar/local";
import { describeTimes } from "@/lib/integrations/calendar/times";
import { eventColor } from "@/lib/integrations/calendar/view";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

const RESPONSE: Record<string, string> = { accepted: "Going", declined: "Not going", tentative: "Maybe", needsAction: "Hasn't replied" };

/**
 * What the user sees when they open an event: time, place, repeat and guest
 * info immediately; notes and the guest list are fetched from Google on
 * demand (they are never stored). Edit/Delete only when the calendar is
 * writable and the user organizes the event; delete asks once more.
 */
export function EventDetailsView({
  event,
  timezone,
  writable,
  canConnect,
  onEdit,
  onDeleted,
}: {
  event: LocalCalendarEvent;
  timezone: string;
  writable: boolean;
  canConnect: boolean;
  onEdit: (details: EventDetails | null) => void;
  onDeleted: (message: string) => void;
}) {
  const [details, setDetails] = useState<EventDetails | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(event.id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!event.id) return;
    let cancelled = false;
    getEventDetailsAction({ id: event.id })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDetails(res.details);
        else setDetailsError(res.error);
      })
      .catch(() => !cancelled && setDetailsError("Couldn't load the event's notes and guests."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const when =
    event.startsAt && event.endsAt
      ? describeTimes({ starts_at: event.startsAt, ends_at: event.endsAt, all_day: event.allDay, start_date: null, end_date: null }, timezone)
      : event.allDay
        ? "All day"
        : "";
  const editable = event.editable !== false;
  const color = eventColor(event.colorId) ?? "var(--accent)";

  function remove() {
    if (!event.id) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteEventAction({ id: event.id! });
      if (res.ok) onDeleted(res.message ?? "Deleted.");
      else {
        setError(res.error ?? "Something went wrong.");
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-2 size-3.5 shrink-0 rounded-[5px]" style={{ background: color }} aria-hidden />
        <div className="min-w-0">
          <h2 className="break-words text-[22px] font-bold leading-tight">{event.title}</h2>
          {event.tentative ? <p className="mt-0.5 text-[13px] text-muted">Tentative</p> : null}
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 text-[15px]">
        <li className="flex items-start gap-3">
          <Clock className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
          <span>{when}</span>
        </li>
        {event.recurring ? (
          <li className="flex items-start gap-3">
            <Repeat className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
            <span>Repeating event{writable && editable ? " — changes apply to this occurrence" : ""}</span>
          </li>
        ) : null}
        {event.location ? (
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
            <span className="break-words">{event.location}</span>
          </li>
        ) : null}
        {event.attendeeCount ? (
          <li className="flex items-start gap-3">
            <Users className="mt-0.5 size-[18px] shrink-0 text-muted" aria-hidden />
            <span>
              {details?.attendees.length ? (
                <span className="flex flex-col gap-0.5">
                  {details.attendees.map((a, i) => (
                    <span key={i}>
                      {a.self ? "You" : a.name}
                      <span className="text-muted">
                        {a.organizer ? " · organizer" : ""}
                        {a.responseStatus && RESPONSE[a.responseStatus] ? ` · ${RESPONSE[a.responseStatus]}` : ""}
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                `${event.attendeeCount} guest${event.attendeeCount === 1 ? "" : "s"}`
              )}
            </span>
          </li>
        ) : null}
      </ul>

      {loading ? (
        <p className="inline-flex items-center gap-2 text-[14px] text-muted">
          <Spinner className="size-3.5" /> Loading details…
        </p>
      ) : details?.description ? (
        <p className="whitespace-pre-line break-words rounded-2xl bg-surface-2/70 px-4 py-3 text-[15px] leading-relaxed">{details.description}</p>
      ) : detailsError ? (
        <p className="text-[13px] text-muted">{detailsError}</p>
      ) : null}

      {!editable ? (
        <p className="rounded-2xl bg-surface-2/70 px-4 py-3 text-[14px] text-muted">
          You were invited{details?.organizer ? ` by ${details.organizer}` : ""}, so only the organizer can change this event.
        </p>
      ) : !writable ? (
        <p className="rounded-2xl bg-warning-soft px-4 py-3 text-[14px] text-warning">
          Your calendar is connected read-only.{" "}
          {canConnect ? (
            <a href="/api/integrations/google/start" className="font-semibold underline underline-offset-2">
              Reconnect to enable editing
            </a>
          ) : null}
        </p>
      ) : null}

      <div aria-live="polite">{error ? <FormMessage>{error}</FormMessage> : null}</div>

      <div className="flex flex-wrap gap-2">
        {writable && editable && event.id ? (
          confirmDelete ? (
            <>
              <Button variant="danger" onClick={remove} disabled={pending}>
                {pending ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={pending}>
                Keep it
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onEdit(details)} disabled={loading}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </>
          )
        ) : null}
        {details?.htmlLink ? (
          <a href={details.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] font-medium text-accent">
            Open in Google Calendar <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
      {confirmDelete ? (
        <p className="-mt-2 text-[13px] text-muted" role="note">
          {event.recurring ? "Only this occurrence is deleted. " : ""}
          {event.attendeeCount ? "Guests will be notified. " : ""}This removes it from Google Calendar.
        </p>
      ) : null}
    </div>
  );
}
