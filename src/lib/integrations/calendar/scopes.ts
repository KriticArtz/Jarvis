/**
 * Google Calendar OAuth scopes (pure; safe to import anywhere).
 *
 *  - calendar.events.readonly — Phase 1 connections: read events only.
 *  - calendar.events          — requested since Calendar phase 2: read AND
 *    write events. Deliberately NOT the broader `calendar` scope, which would
 *    also allow managing calendars, settings and sharing (ACLs).
 */
export const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const CALENDAR_SCOPES = new Set([GOOGLE_CALENDAR_READONLY_SCOPE, GOOGLE_CALENDAR_EVENTS_SCOPE]);

/** The calendar scopes among those Google granted (what we store). */
export function calendarScopes(granted: readonly string[]): string[] {
  return [...new Set(granted.filter((s) => CALENDAR_SCOPES.has(s)))];
}

export function hasCalendarReadAccess(scopes: readonly string[]): boolean {
  return scopes.some((s) => CALENDAR_SCOPES.has(s));
}

export function hasCalendarWriteAccess(scopes: readonly string[]): boolean {
  return scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE);
}
