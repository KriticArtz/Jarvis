# Integrations: calendar and fitness

Calendar and health data are **sensitive personal data**. The rules every
integration follows:

- **User-scoped.** Every row carries `user_id`. Row Level Security lets a user
  *read* only their own rows. Nobody writes these tables through the public
  API: all writes happen in server code (service role), after the server has
  authenticated the user and validated the data. The user id always comes from
  the verified session or token, never from input.
- **Secrets stay server-side.** OAuth tokens are encrypted with AES-256-GCM
  (`INTEGRATIONS_ENCRYPTION_KEY`) before they reach the database. They live in
  `integration_credentials`, which has no API grants at all: not even the
  owner can read it through Supabase. The browser never sees a token.
- **Disconnectable.** Disconnecting deletes the connection. By cascade that
  removes its tokens and every synced event or fitness record. Google access
  is also revoked at Google. Deleting the account does all of this too.
- **Minimal data.** Only the fields the assistant needs are stored: no event
  descriptions, attendee identities or links (those are fetched from Google
  only when the user opens an event), and no raw health samples, heart rate,
  routes or clinical records.
- **Health data comes only from the user's phone.** The Jarvis mobile app
  (`mobile/`) reads Apple Health / Health Connect read-only and syncs daily
  totals and workout summaries.
- **Calendar writes need the user's OK.** Google Calendar events can be
  created, changed, moved and deleted (see "Calendar writes" below). Every
  change the assistant makes is a proposal the user confirms first. Health
  data stays read-only.

## Data model

| Table | What | Idempotency key |
|---|---|---|
| `integration_connections` | One row per user and provider: status (`connected` / `error`), scopes, `last_synced_at`, `last_error` | `(user_id, provider)` |
| `integration_credentials` | Encrypted access/refresh tokens. Server-only. | `connection_id` |
| `calendar_events` | Normalized events: provider, provider event id, calendar id, title, start/end, timezone, all-day (with dates), location, status (confirmed/tentative/cancelled), busy/free, `last_synced_at`; since phase 2 also `color_id`, `recurring_event_id`, `is_organizer`, `attendee_count` | `(user_id, provider, calendar_id, provider_event_id)` |
| `fitness_daily_summaries` | Per day: steps, active energy (kcal), distance (m), sleep (minutes) | `(user_id, provider, summary_date)` |
| `fitness_workouts` | Workout summaries: type, start/end, duration, active energy, distance | `(user_id, provider, provider_workout_id)` |

Migrations: `supabase/migrations/20261005000000_integrations.sql` and
`20261006000000_calendar_phase2.sql` (event metadata columns). The RLS checks
are in `supabase/tests/rls_test.sql`.

## Google Calendar (web, available now)

- **Flow:** OAuth 2.0 authorization code with PKCE, plus `state` (CSRF).
  - `GET /api/integrations/google/start` sets a single-use, encrypted,
    httpOnly cookie that binds the state, the PKCE verifier, the signed-in
    user id and a 10-minute expiry.
  - `GET /api/integrations/google/callback` checks all four before
    exchanging the code.
  - Demo (anonymous) users can't connect.
- **Scope:** `https://www.googleapis.com/auth/calendar.events` (read and
  write *events* only — not the broader `calendar` scope, which would also
  allow managing calendars, settings and sharing). The app uses the user's
  **primary** calendar.
  - Connections made before phase 2 hold `calendar.events.readonly`. They keep
    syncing; Settings and the Calendar page show "Read-only" with a
    **Reconnect to enable editing** button (the same OAuth flow; Google asks
    for the new permission). Writes are refused with that explanation until
    then. If Google ever answers a write with an insufficient-scope error, the
    stored scopes are downgraded so the UI offers the reconnect.
- **Sync:** the window is from the start of the user's today to 30 days ahead.
  - Recurring events are expanded and deletions included (`showDeleted`).
  - Each run upserts by provider event id and marks cancelled instances.
  - It removes stored events in the window that Google no longer returns.
  - Past events are pruned after 35 days.
  - Triggers: after connecting, **Sync now** in Settings (rate-limited), and in
    the background from the Today screen when the last sync is over an hour old.
- **Expired or revoked access:** tokens refresh automatically. If Google
  rejects the refresh token (`invalid_grant`, or 401 after a refresh), the
  connection is marked "Needs reconnecting", the dead tokens are deleted, and
  its events stop feeding the assistant until the user reconnects.
- **Assistant:**
  - Today and the next two days appear in the context as fixed commitments.
    They also count as busy time when free windows and plans are computed, so
    plans never overlap them.
  - Read tools (no confirmation): `list_calendar_events`,
    `find_calendar_events`, `get_calendar_event` (description and guests,
    fetched on demand) and `find_free_time` (events, work hours, commitments
    and timed tasks are hard busy blocks; a few spread-out slots, not every
    free minute).
  - Write tools (always a proposal): `create_calendar_event`,
    `reschedule_calendar_event`, `update_calendar_event`,
    `delete_calendar_event`. See "Calendar writes".
  - The weekly review gets the week's event count and busy hours.
  - Code: `src/lib/integrations/calendar/`, tools in
    `src/lib/assistant/actions/calendar.ts`.

## Calendar writes (phase 2)

- **Where:** the Calendar page (`/calendar`: day, week, month; phones get an
  agenda for the week and dots + the day's agenda for the month), the
  assistant, and "Add to calendar" on timed items in *Plan my day*.
- **Server-only:** `src/lib/integrations/calendar/mutations.ts`
  (`createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`,
  `getCalendarEventDetails`, `calendarWriteState`). The user id always comes
  from the session; each event is loaded with an explicit `user_id` filter
  before Google is called; only organizers can edit (invited events are
  view-only).
- **Confirmation:** the assistant's write tools are `confirm` tools in the
  existing action registry — they store a proposal in `assistant_actions`
  (e.g. "Move “Dentist” / Current: Wed 2:00 PM / New: Thu 3:00 PM") and
  nothing reaches Google until `confirm_action` runs in a later turn. The chat
  shows **Confirm / Cancel** on the proposal; the buttons call the same
  `confirm_action` / `decline_action` path (`answerProposal`). On the Calendar
  page, pressing Save is the user's explicit action; Delete asks "Yes, delete"
  first. Plan items are added only when the user ticks "Add to calendar".
- **Idempotency:** creates use a deterministic Google event id derived from
  the user and a request key (the proposal, the form's request id, or
  `plan:<id>:<item>`), so retries return the existing event instead of a
  duplicate.
- **Time zones and DST:** timed events are sent as UTC instants computed from
  the user's local date/time in their IANA zone, plus that zone. Moving an
  event without a new time keeps its local start time across DST changes.
- **Recurring events:** changes apply to the single occurrence (instance id).
- **Failures:** 401 → refresh once, then "Needs reconnecting"; 404/410 on
  change → the local copy is removed and the user is told it no longer
  exists; deleting an already-deleted event counts as done; other errors are
  reported without claiming success. Logs carry only user id, failure kind and
  HTTP status.

## Apple Calendar (future iOS app)

A website **cannot** read Apple Calendar. The data sits in EventKit on the
user's device and is available only to a native app the user grants calendar
permission. The web app has no fake Apple Calendar support.

Plan:
1. The iOS app requests EventKit access (`requestFullAccessToEvents`) and reads
   events in the same 30-day window.
2. It maps each `EKEvent` to `NormalizedCalendarEvent`
   (`src/lib/integrations/calendar/types.ts`):
   - `calendarItemIdentifier` → `providerEventId`
   - `calendar.calendarIdentifier` → `calendarId`
   - `isAllDay`, `startDate`/`endDate`, `timeZone`, `location`
   - `status` / `availability` → `status` / `isBusy`
3. It submits them with the user's Supabase access token to an authenticated
   endpoint that mirrors `/api/integrations/fitness/sync`. That endpoint
   (`/api/integrations/calendar/sync`, provider `apple_calendar`, which the
   schema already allows) is not built yet.
4. The rest (storage, AI context, planning) already works from the normalized
   table.

## Fitness: Apple Health (iOS) and Health Connect (Android)

**These require the native mobile app** (`mobile/`, Expo / React Native — see
`mobile/README.md`). HealthKit is only available to iOS apps with the
HealthKit entitlement and per-type user permission; Health Connect only to
Android apps that declare and are granted each permission. A website can
access neither, so Settings → Integrations → **Health & Fitness** explains
that connecting happens in the Jarvis iPhone/Android app and never shows a
connection the phone hasn't made.

Status shown on the web and returned to the app (derived from
`integration_connections`, no extra columns): **Not connected**, **Syncing**
(connected, first data not yet received), **Connected**, **Needs attention**
(the phone reported a problem — `permission_denied` / `sync_failed`, stored as
a code in `last_error` — or no data for 3 days).

The native app authenticates with `Authorization: Bearer <Supabase access
token>` (the signed-in user; demo users are refused). The user id always
comes from the token; a `user_id` in a body is rejected:

| Endpoint | Body | Effect |
|---|---|---|
| `POST /api/integrations/fitness/connect` | `{ "provider": "apple_health" \| "health_connect" }` | Creates (or restores) the connection, after the user grants permission on the device |
| `POST /api/integrations/fitness/sync` | see below | Idempotent upsert of aggregates and workouts (409 until connected) |
| `GET /api/integrations/fitness/status` | — | Both sources' state, issue and last sync time (no health data) |
| `POST /api/integrations/fitness/status` | `{ "provider": …, "issue": "permission_denied" \| "sync_failed" }` | Marks the connection "needs attention"; syncing resumes after `connect` |
| `POST /api/integrations/fitness/disconnect` | `{ "provider": … }` | Deletes the connection and all of its data |

The user can also disconnect (and delete) from Settings on the web.

Sync payload (strictly validated; at most 62 days and 300 workouts per call,
256 KB; days older than 60 days are skipped):

```json
{
  "provider": "apple_health",
  "days": [
    { "date": "2026-09-30", "steps": 8412, "activeCaloriesKcal": 512, "distanceMeters": 6120, "sleepMinutes": 431 }
  ],
  "workouts": [
    { "id": "HKWorkout-UUID", "activityType": "running", "startedAt": "2026-09-30T06:30:00-05:00",
      "endedAt": "2026-09-30T07:05:00-05:00", "activeCaloriesKcal": 350, "distanceMeters": 5200 }
  ]
}
```

`activityType` is one of `walking, running, cycling, swimming, strength, hiit,
yoga, other`. The native app maps platform types (for example
`HKWorkoutActivityType` or `ExerciseSessionRecord.EXERCISE_TYPE_*`) to these.

**Assistant access.** The context only notes that a fitness source is
connected. The model calls the read-only `get_fitness_summary` tool when a
request actually needs activity data ("How am I doing toward my fitness
goal?", "I haven't worked out yet, plan my evening"). No data is shared when
nothing is connected. The prompt forbids diagnoses, medical claims and
medical advice.

## Configuration

See `.env.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`INTEGRATIONS_ENCRYPTION_KEY`, and `NEXT_PUBLIC_APP_URL` (used for the
redirect URI). Without them, Settings shows the calendar as "Not configured on
this server" and nothing else changes.
