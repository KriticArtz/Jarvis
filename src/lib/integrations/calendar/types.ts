/**
 * Provider-agnostic calendar model. Every calendar source — Google today,
 * Apple Calendar (EventKit) via the future iOS app — is normalized into this
 * shape and stored in `calendar_events`. Everything downstream (AI context,
 * planning, dashboard) reads only this model, never a provider's API.
 *
 * Two kinds of providers:
 *  - Server-pulled (Google): the server holds an OAuth token and fetches a
 *    time window (see ./google.ts and ./sync.ts).
 *  - Device-pushed (Apple EventKit): calendar data lives on the user's device
 *    and is only reachable from a native app with the user's permission. A
 *    browser cannot read it. The iOS app will read EventKit and submit
 *    NormalizedCalendarEvent records to an authenticated server endpoint,
 *    exactly like fitness data (see docs/integrations.md). Not built yet.
 */
export type CalendarProviderId = "google_calendar" | "apple_calendar";

export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export interface NormalizedCalendarEvent {
  providerEventId: string;
  calendarId: string;
  /** "Busy" when the provider hides the title (private events). */
  title: string;
  /** ISO timestamps (UTC). For all-day events: local midnight of the first/after-last day. */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  /** All-day events only: calendar dates, end exclusive. */
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  location: string | null;
  status: CalendarEventStatus;
  /** False when the event is marked "free" and doesn't block time. */
  isBusy: boolean;
  /** Provider color ("1".."11" for Google); null = calendar default. */
  colorId?: string | null;
  /** Series id when this is one occurrence of a recurring event. */
  recurringEventId?: string | null;
  /** False when the user was invited rather than organizing (can't edit). */
  isOrganizer?: boolean;
  /** Number of guests other than the user. */
  attendeeCount?: number;
}

export interface CalendarWindow {
  timeMin: Date;
  timeMax: Date;
}

/** Days of upcoming events synced (and shown to the assistant at most). */
export const CALENDAR_SYNC_DAYS = 30;
