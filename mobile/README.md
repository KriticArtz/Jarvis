# Jarvis mobile (iOS + Android)

A small Expo (React Native) companion app whose only job is health data: it
signs in with the user's existing Jarvis account, reads **Apple Health**
(HealthKit, iOS) or **Health Connect** (Android) with the user's permission,
and syncs daily totals and workout summaries to the existing Jarvis backend.
Everything else stays in the web app.

## What it reads (read-only)

| Jarvis field | Apple Health (HealthKit) | Health Connect |
|---|---|---|
| Steps | `HKQuantityTypeIdentifierStepCount` (daily sum) | `Steps` (daily aggregate) |
| Active energy | `HKQuantityTypeIdentifierActiveEnergyBurned` | `ActiveCaloriesBurned` |
| Distance | `HKQuantityTypeIdentifierDistanceWalkingRunning` | `Distance` |
| Sleep | `HKCategoryTypeIdentifierSleepAnalysis` (asleep stages only) | `SleepSession` (asleep stages, or the whole session) |
| Workouts | `HKWorkoutTypeIdentifier` | `ExerciseSession` (+ energy/distance aggregated within it) |

Nothing else is requested: no heart rate, locations/routes, clinical records,
or write access. iOS: `NSHealthUpdateUsageDescription` is disabled (read
only). Android: exactly five `android.permission.health.READ_*` permissions.

## How it works

```
App opens / returns to foreground (≥30 min since last sync)
  → read the last 7 days (30 on first connect) from HealthKit / Health Connect
  → normalize (src/health/normalize.ts): local dates, merged sleep, workout
    type mapping, rounding, server limits
  → POST /api/integrations/fitness/sync   (Authorization: Bearer <Supabase access token>)
```

- **Auth:** Supabase email/password sign-in, the same account as the web app.
  The session is kept in the iOS Keychain / Android Keystore
  (`expo-secure-store`). The backend takes the user id ONLY from the verified
  access token; payloads contain no user id.
- **Endpoints used** (already in the web app): `connect`, `sync`,
  `disconnect`, and `status` (GET status / POST a problem report) under
  `/api/integrations/fitness/`.
- **Idempotent:** days are keyed by date and workouts by the platform's id, so
  re-sending a week is safe.
- **Health data is never stored by this app** — it goes from the platform
  store straight to the API, and is never logged.
- **Status on the web:** Settings → Integrations → Health & Fitness shows
  Not connected / Syncing / Connected / Needs attention.

## Setup

```bash
cd mobile
cp .env.example .env          # public values only — see the file
npm install
npx expo install --fix        # align native module versions with the Expo SDK
npx expo prebuild             # generates ios/ and android/ (gitignored)
npx expo run:ios              # needs macOS + Xcode, and a real iPhone for Health data
npx expo run:android          # needs Android Studio; Health Connect on Android 8+
```

HealthKit and Health Connect do **not** work in Expo Go; use a development
build (`expo-dev-client`, included) or EAS Build.

Checks that run in the web repo: `normalize.test.ts` (validated against the
server's real sync schema) runs with the root `npm test`. Inside `mobile/`,
`npm run typecheck` type-checks the app against the installed libraries.

## Not done yet (TODO)

- **Background sync:** syncs on app open/foreground only. Next: HealthKit
  background delivery (`enableBackgroundDelivery` + the plugin's
  `background: true`) and an Android WorkManager job with the
  `READ_HEALTH_DATA_IN_BACKGROUND` permission.
- **Incremental sync:** re-reads a 7-day window each time; could use HealthKit
  anchors / Health Connect change tokens.
- **Sign in with Google/Apple** in the app (email/password only for now).
- **App icon, splash and store listing.**
- **iOS can't report "permission off":** HealthKit hides whether read access
  was denied (denied types just return nothing). Android reports it
  (`permission_denied` → "Needs attention" on the web).
