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
  descriptions, attendees or links, and no raw health samples, heart rate,
  routes or clinical records.
- **Read-only for now.** No tool can create, change or delete calendar events
  or health data. The assistant says calendar changes are "coming later".

## Data model

| Table | What | Idempotency key |
|---|---|---|
| `integration_connections` | One row per user and provider: status (`connected` / `error`), scopes, `last_synced_at`, `last_error` | `(user_id, provider)` |
| `integration_credentials` | Encrypted access/refresh tokens. Server-only. | `connection_id` |
| `calendar_events` | Normalized events: provider, provider event id, calendar id, title, start/end, timezone, all-day (with dates), location, status (confirmed/tentative/cancelled), busy/free, `last_synced_at` | `(user_id, provider, calendar_id, provider_event_id)` |
| `fitness_daily_summaries` | Per day: steps, active energy (kcal), distance (m), sleep (minutes) | `(user_id, provider, summary_date)` |
| `fitness_workouts` | Workout summaries: type, start/end, duration, active energy, distance | `(user_id, provider, provider_workout_id)` |

Migration: `supabase/migrations/20261005000000_integrations.sql`. The RLS
checks are in `supabase/tests/rls_test.sql`.

## Google Calendar (web, available now)

- **Flow:** OAuth 2.0 authorization code with PKCE, plus `state` (CSRF).
  - `GET /api/integrations/google/start` sets a single-use, encrypted,
    httpOnly cookie that binds the state, the PKCE verifier, the signed-in
    user id and a 10-minute expiry.
  - `GET /api/integrations/google/callback` checks all four before
    exchanging the code.
  - Demo (anonymous) users can't connect.
- **Scope:** `https://www.googleapis.com/auth/calendar.events.readonly` only.
  The app reads the user's **primary** calendar.
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
  - `list_calendar_events` (read-only) looks at up to 30 days.
  - The weekly review gets the week's event count and busy hours.
  - Code: `src/lib/integrations/calendar/`.

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

**These require the native mobile apps.** HealthKit is only available to iOS
apps with the HealthKit entitlement and per-type user permission. Health
Connect is only available to Android apps that declare and are granted each
permission. A website can access neither. Settings shows both as "Coming with
the iOS/Android app".

The server side is ready. Native apps authenticate with
`Authorization: Bearer <Supabase access token>` (the signed-in user; demo
users are refused):

| Endpoint | Body | Effect |
|---|---|---|
| `POST /api/integrations/fitness/connect` | `{ "provider": "apple_health" \| "health_connect" }` | Creates the connection, after the user grants permission on the device |
| `POST /api/integrations/fitness/sync` | see below | Idempotent upsert of aggregates and workouts |
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
