# LifePilot

A personal AI accountability assistant: it knows your goals, helps you plan your time, and keeps you accountable. ("LifePilot" is a working name; see [Rebranding](#rebranding).)

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Auth + Postgres with Row Level Security) and the OpenAI API. It deploys to Vercel. The SMS architecture is designed for Twilio.

---

## Quick start

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

The app needs a Supabase project. OpenAI and Twilio are optional; without them the app runs in clearly labelled demo/test modes.

## Environment variables

Every variable is documented in [`.env.example`](.env.example).

| Variable | Required | Where to get it | Exposed to browser? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → API | yes (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | ✅ | Supabase → API keys | yes (safe: RLS-restricted) |
| `NEXT_PUBLIC_APP_URL` | recommended | Your site origin (`http://localhost:3000` locally) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | for SMS | Supabase → API keys (secret) | **never** |
| `OPENAI_API_KEY` | for AI | platform.openai.com → API keys | **never** |
| `OPENAI_MODEL` | no (default `gpt-5-mini`) | any chat model with JSON-schema output | no |
| `SMS_MODE` | no (default `test`) | `test` / `live` / `disabled` | no |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | for live SMS | Twilio Console → Account Info | **never** |
| `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | for live SMS | Twilio Console → Messaging | no |
| `CRON_SECRET` | for scheduled SMS | `openssl rand -hex 32` | no |

Secrets are read only in `src/lib/env.ts`, which imports `server-only`, so the build fails if client code ever imports it.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema, using either option:
   - **SQL editor:** paste and run [`supabase/migrations/20260928000000_initial_schema.sql`](supabase/migrations/20260928000000_initial_schema.sql).
   - **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Auth → URL Configuration:**
   - Site URL: `http://localhost:3000` (and your production URL later).
   - Redirect URLs: add `http://localhost:3000/**` and `https://<your-domain>/**`.
4. **Auth → Providers → Email:** email/password is on by default. With "Confirm email" enabled, users confirm through a link that lands on `/auth/callback`. With it disabled, signup goes straight to onboarding.
5. Copy the URL and keys into `.env.local`.

**Local Supabase (optional):** `supabase/config.toml` is included, so `npx supabase start` (requires Docker) followed by `npx supabase db reset` gives you a local stack. The CLI prints the local URL and keys. Auth emails appear in Mailpit at http://localhost:54324.

### Database overview

| Table | Purpose |
| --- | --- |
| `profiles` | Name, phone, **timezone**, wake/sleep, work/school hours, accountability style, onboarding state. Created automatically on signup. |
| `recurring_commitments` | Fixed blocks the planner must never schedule over. |
| `goals` | Recurring ("4×/week") and one-time ("save $300") goals, with priority, rank and status. |
| `goal_progress` | Append-only progress log (manual, from completed tasks, and later from SMS). |
| `habits` (view) | Recurring goals. A view, so a dedicated table can replace it later without touching callers. |
| `tasks` | Per-day tasks, optionally tied to a goal or an accepted plan. |
| `daily_plans` | AI/rule-generated proposals and whether they were accepted. |
| `daily_check_ins` | Morning intention / evening reflection (app or SMS). |
| `daily_insights` | Cached dashboard insight (one per day). |
| `weekly_reviews` | Computed stats + AI summary. |
| `conversations`, `conversation_messages` | Chat history, with a rolling summary per conversation. |
| `user_memories` | Durable facts the assistant should always know. |
| `notification_preferences` | Explicit SMS consent (timestamp + exact text), schedule and quiet hours. |
| `notifications` | Outbound message log (with a dedupe key). Server-written only. |
| `inbound_messages` | Raw inbound SMS log. Server-written only. |

**Security.** Every user table has RLS enabled and users can only reach their own rows. Restrictive policies stop anyone from linking rows to another user's goals, plans or conversations. Column grants stop users from setting `phone_verified_at` themselves. The `anon` role has no table access. `notifications` and `inbound_messages` can only be written by the service role on the server.

To validate the migration and RLS policies against a throwaway local Postgres (no Supabase or Docker needed):

```bash
npm run db:verify
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run typecheck` | Route type generation + `tsc` |
| `npm test` | Vitest unit tests |
| `npm run db:verify` | Apply migrations + RLS isolation tests on a temporary Postgres |
| `npm run check` | lint + typecheck + tests |

## Deploying to Vercel

1. Import the repo into Vercel and add the environment variables. Set `NEXT_PUBLIC_APP_URL` to the production URL.
2. Add the production URL to Supabase's redirect URLs.
3. `vercel.json` schedules `/api/cron/dispatch` every 15 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Note that Vercel's Hobby plan only allows daily crons, so use Pro or an external scheduler that sends the same header.

---

## What works in this version

- **Landing page** with the requested messaging and a "How it works" section.
- **Auth:** sign up, log in, log out, forgot/reset password, and the email confirmation callback. The proxy (`src/proxy.ts`, Next 16's replacement for middleware) refreshes sessions and redirects signed-out users to `/login`. The authenticated layout sends users to `/onboarding` until it's finished. Redirects after login are restricted to same-site paths.
- **Onboarding (6 steps):** name (timezone auto-detected), multiple goals (with example templates, any category), schedule (every field skippable) plus recurring commitments, goal ranking, accountability style, and phone number with explicit, unchecked-by-default SMS consent (skippable). Progress is saved per step, so users can resume.
- **Goals:** create, edit, pause/resume, archive, complete and delete. Recurring goals are per day/week/month, one-time goals can have a due date, and each goal has a priority, a ranking, free-form units, progress history and manual logging. Completing a task linked to a goal logs progress automatically: minutes/hours use the task duration and "times" counts one; other units such as dollars are logged manually.
- **Dashboard:** greeting in the user's timezone, date, priorities, other tasks (check off, skip, delete, add), goal progress bars with pace ("behind", "on track"), the day's AI insight (loaded after the page renders and cached per day), a morning/evening check-in, and prominent "Chat with Assistant" and "Plan my day" buttons.
- **AI assistant:** streaming chat with saved conversations and history. Each call receives:
  - a **structured context** rebuilt from the database: goals with live progress and pace, schedule, today's commitments, free windows and remaining minutes, today's tasks, check-ins, the last 7 days, the last weekly review, and remembered facts;
  - only the **last 12 messages**, plus a **rolling summary** of older messages and summaries of recent other conversations.

  The full history is never sent. The system prompt states exactly what the assistant can and cannot do. Requests are rate-limited per user.
- **Daily planning:** computes free windows from wake/sleep, work hours, commitments and already-timed tasks, and never plans in the past. If waking hours are unknown and the user gives no availability, it asks instead of inventing a schedule. The AI returns structured JSON, which the code then validates: items that overlap a commitment, fall outside free time, overlap each other, exceed available time, or reference goals/tasks the user doesn't own are dropped with a visible explanation. Users can edit, add, remove, accept or discard the plan. Accepting creates tasks (or schedules existing ones).
- **Weekly review:** stats computed only from stored rows — completed, missed (a past day left undone), skipped and still-open tasks, priorities, per-goal amount vs. target, habit consistency, and completion by time of day. The AI summary receives only those numbers and is told not to add any. You can browse previous weeks.
- **Settings:** profile and timezone, schedule and commitments, accountability style, phone/SMS consent, message schedule and quiet hours, a test message, a log of recent messages, "things to remember", and log out.
- **SMS architecture**, described in the next section.

### Demo / test modes (when credentials are missing)

| Missing | Behaviour |
| --- | --- |
| `OPENAI_API_KEY` | Chat says clearly that AI isn't configured and only reflects your stored data. Plans come from a deterministic rule-based planner (ranked goals into free windows, ≤70% of free time). Insights and weekly summaries are generated from the numbers without AI. All of these are labelled in the UI. |
| Twilio credentials (or `SMS_MODE=test`) | Messages go through the same pipeline but are stored with status `test` and **never sent**. Settings shows them as "test — not sent". |
| `SUPABASE_SERVICE_ROLE_KEY` | Core app works. Sending, recording messages, cron dispatch and the SMS webhook are unavailable, and the UI says so. |

## SMS architecture (Twilio)

```
Outbound: Vercel Cron → /api/cron/dispatch → dueNotifications() (pure, per-user timezone,
          quiet hours, dedupe keys) → deliverNotification() → SmsProvider (Twilio | Test)

Inbound:  SMS → Twilio → POST /api/sms/inbound → verify X-Twilio-Signature → log (dedupe by MessageSid)
          → identify user by phone → STOP/START/HELP handling → save as check-in if it answers a
          recent check-in → store in the user's SMS conversation → build context → AI reply
          → deliverNotification() → Twilio
```

- `src/lib/notifications/providers/`: the `SmsProvider` interface, the Twilio REST provider (no SDK) and the test provider.
- `src/lib/notifications/service.ts`: the **only** way to send a message. It enforces phone number + consent + no opt-out, and records every attempt.
- `src/lib/notifications/scheduler.ts`: morning check-in, reminders before timed priority tasks ("You planned to work out at 6:30. Still happening?"), and the evening check-in, all in the user's own timezone.
- `src/lib/notifications/inbound.ts`: the two-way pipeline. It replies after the webhook has returned, because Twilio times out at 15 seconds.
- `src/app/api/sms/status`: the delivery-status callback, which marks failed or undelivered messages.

**To go live with Twilio:**

1. Buy a number and create a Messaging Service in Twilio. For US numbers, complete A2P 10DLC registration.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL=https://<your-domain>` and `SMS_MODE=live`.
3. In the Messaging Service (or phone number) settings, set **"A message comes in"** to `POST https://<your-domain>/api/sms/inbound`.
4. Keep Twilio's default opt-out handling on. It sends the carrier-required STOP/HELP replies, and the app mirrors opt-outs in its own database.
5. Add phone number verification (e.g. Twilio Verify, which will set `profiles.phone_verified_at`) before sending at scale.

## Intentionally not implemented yet

- **Phone number verification.** Numbers are stored with consent but not verified by code. The column exists; the flow needs Twilio Verify.
- **Real SMS delivery** in this environment (no credentials). The pipeline is complete and unit-tested, and runs in test mode.
- **The assistant changing data from chat.** It gives advice only, and says so. Saving plans happens on the "Plan my day" screen.
- **Automatic memory extraction.** "Things to remember" are entered by the user. The `user_memories.source = 'assistant'` value is reserved for this.
- Calendar, finance or fitness integrations, voice, billing and native apps: the architecture leaves room for them (provider interfaces, structured context, a channel column on conversations and messages), but there are no placeholder buttons.
- Multi-day or future-date planning. Planning covers the rest of today.

## Project structure

```
src/
  app/                 routes (landing, (auth), onboarding, (app)/…, api/…)
  components/          UI primitives + feature components
  config/brand.ts      product name, tagline, copy
  lib/
    ai/                context builder/renderer, prompts, chat, planner, insight, review, memory
    actions/           server actions (all validate input with zod and check the session)
    data/              typed queries (always scoped by user_id, and RLS applies too)
    notifications/     SMS providers, scheduler, service, inbound pipeline, signature check
    planning/          free-window computation, plan validation, rule-based planner
    progress/          goal progress + pace
    review/            weekly statistics
    supabase/          server / browser / admin / proxy clients
supabase/migrations/   schema + RLS
supabase/tests/        local RLS verification
```

## Rebranding

- Name, tagline and copy: `src/config/brand.ts`
- Colors: CSS tokens at the top of `src/app/globals.css` (`--accent` etc., light and dark)
- Logo mark: `src/components/logo.tsx` and `src/app/icon.svg`
- Consent text: `src/lib/notifications/consent.ts` (it uses the brand name)
