# Testing the Assistant

Two layers. The **mock model** proves the plumbing deterministically and runs in CI-style tests. The **real model** proves the replies feel intelligent, and must be checked by a person on a preview deployment.

## 1. Mock model (automated)

`scripts/mock-openai.mjs` is a small, scripted stand-in for the OpenAI Responses API, for tests only. It speaks the same HTTP protocol, including streaming, so the app runs its normal pipeline:

> real context and history → mock reply or tool call → the app runs the real tool against the database → the mock's final reply reports what the tool actually returned.

The mock never invents data. Its replies are computed from the context and messages the app sends:
- the current time, tasks, calendar, free windows and memories;
- pending changes;
- the task the user acted on from Today.

It also answers the planner's structured `daily_plan` request, so `replan_today` goes through the real planner.

**How the app reaches it.** `OPENAI_BASE_URL` is honoured only in this narrow case:
- it must point at this machine (`127.0.0.1`, `localhost` or `[::1]`);
- it is never honoured on a Vercel production deployment (`VERCEL_ENV=production`).

Any other value is ignored and the real API is used (`src/lib/env.ts`). The base URL is always passed to the SDK explicitly, so the SDK can't pick the variable up on its own.

```bash
npm run mock:openai                                   # listens on http://127.0.0.1:4010/v1
OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:4010/v1 npm run build && npm start
```

Test controls (not part of the OpenAI API):

| Endpoint | What it does |
| --- | --- |
| `GET /__requests` | What the app sent: context, message counts and sizes, tool calls and tool outputs |
| `POST /__reset` | Clears the captured requests and any scripted behaviour |
| `POST /__script {"lie": true}` | The next final reply claims success regardless of the tool result, to prove the server's honesty guard |
| `POST /__script {"status": 400}` | The next request fails with that HTTP status |

**Automated coverage:** `src/lib/ai/assistant-pipeline.integration.test.ts`, part of `npm run test:integration`, starts the mock in-process. It runs the acceptance scenarios against a real local Supabase:
- what to do now;
- moving a task;
- multi-turn continuity;
- planning, then confirming;
- feeling overwhelmed;
- a change made on Today showing up in the Assistant;
- a new conversation not inheriting old messages;
- memory: saving, using later, and forgetting with an OK;
- honesty after a failed change;
- a plan that only partly applies;
- Today's "Move it".

## 2. Real model: acceptance on a Vercel Preview

The mock can't judge tone or reasoning. Before calling the Assistant done, run the ten scenarios below against the real model on a **Vercel Preview** deployment. Production stays untouched: separate environment variables, a separate database, and a branch that isn't the production branch.

### 2.1 A Preview database (recommended: a separate Supabase project)

The Assistant needs the additive migration `20261008000000_assistant_action_results.sql` (`assistant_actions.result`). Without it, proposals fail to save. Applying it to the production database would change production, so:

1. Create a second Supabase project, e.g. "jarvis-preview".
2. Apply every migration in `supabase/migrations/` to it, in order (`supabase db push` against that project, or paste them into its SQL editor).
3. Under **Authentication → URL Configuration**, add `https://*.vercel.app/**` (or your branch's preview URL) to Redirect URLs.
4. Create the test user under **Authentication → Users → Add user**, with "Auto confirm" on, so no email is needed.

### 2.2 Preview environment variables (Vercel → Settings → Environment Variables)

Set these with the **Preview** environment ticked only. Ideally scope them to the preview branch. Enter values in the Vercel dashboard, never in code, the repository or a chat.

| Variable | Preview value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | the **Preview** Supabase project URL | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the Preview project's publishable key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | the Preview project's secret key | yes (usage tracking, calendar writes) |
| `OPENAI_API_KEY` | a real OpenAI key, ideally a separate project key with a spend limit | yes |
| `OPENAI_MODEL` | the same model as production (default `gpt-5-mini`) | recommended |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | only to test the calendar. Register `https://<preview-url>/api/integrations/google/callback` in Google Cloud and use a Preview-only encryption key | optional |

**Must not be set (or inherited) for Preview.** Check every existing variable's environments in Vercel. Anything that also has "Preview" ticked is inherited by preview deployments.

| Variable | Why |
| --- | --- |
| `OPENAI_BASE_URL` | Test-only. The app ignores it except for loopback addresses, so leave it out entirely. |
| `NEXT_PUBLIC_APP_URL` (production domain) | Leave unset on Preview: auth emails and Google OAuth would otherwise send people to production. When unset, the app uses the preview's own URL. |
| Production Supabase URL and keys | The Preview must not read or write the production database. |
| `SMS_MODE=live`, `TWILIO_*`, `EMAIL_MODE=live`, `RESEND_*` | No real texts or emails from a preview. When unset, they default to test mode, which logs instead of sending. |
| `GOOGLE_API_TEST_BASE_URL`, `TWILIO_API_BASE_URL`, `RESEND_API_BASE_URL` | Test overrides only. |
| `CRON_SECRET`, `DESIGN_PREVIEW` | Not needed. |

Changing a variable's environments only affects new deployments. The running production deployment keeps its own values.

### 2.3 Deploy the Preview

1. Push the work to a branch that is **not** Vercel's Production Branch (Vercel → Settings → Git), for example `phase-4-preview`. Vercel builds a Preview and gives it a stable branch URL. Alternatively, run `vercel deploy` (without `--prod`) from a checkout.
2. Open the Preview URL, sign in as the test user and finish onboarding: wake and sleep times, and your real time zone.
3. In the Preview project's SQL editor, run [`preview-acceptance-seed.sql`](preview-acceptance-seed.sql) with the test email filled in. It gives today:
   - a priority with a deadline ("Finish the proposal");
   - a "Workout" later today;
   - a task that has already slipped ("Call the bank");
   - two small tasks;
   - two goals;
   - a saved preference ("I prefer working out in the evening").
   
   Re-run it to reset between attempts.
4. Optional: connect Google Calendar in Settings, so scenarios 1 and 4 include real events.

### 2.4 The ten scenarios

Start each from **Today → Jarvis**. Opening the Assistant resumes today's conversation; use **New** where noted. After each scenario that changes something, open **Today** and check it.

| # | Say | Pass | Fail |
| --- | --- | --- | --- |
| 1 | "What should I do right now?" | Names one real task, with a reason drawn from the day (the time, the next event, the free window, the priority). | Generic advice, a list of options, or invented tasks. |
| 2 | "Move my workout to tomorrow." | Picks the "Workout" task. A **Moved** result card shows "Moved from today · …". Today no longer lists it. | Asks which workout when there's only one. Says "moved" without a card. Today unchanged. |
| 3 | "I didn't finish my proposal." | Knows it's "Finish the proposal" and that it's still open. Offers a way to recover (later today or tomorrow) without guilt. | Shame, pep talk, or "which proposal?" when the context is clear. |
| 4 | "Help me plan the rest of my day." | A **Your day** preview built around real free time (and calendar events). **Use this plan** applies it; Today shows the times. | Times overlapping events or already past. The plan reported as applied before you confirmed. |
| 5 | "I'm overwhelmed." | Counts what's actually left, picks the one that matters most, and offers to move or drop the rest. | "Let's break it into smaller chunks", "You've got this", or fake urgency. |
| 6 | (after 2) "Actually, don't move the workout. Leave it where it is." | Notices it was **already moved** and offers to move it back (or does, with a result card). | Says "OK, I won't move it" while it stays on tomorrow, or moves something else. |
| 7 | (after talking about two tasks) "Move it to tomorrow." | If more than one task fits "it", asks which one, briefly. If only one fits, does it. | Guesses between two plausible tasks. |
| 8 | "I can't do any of this today." | Calm. Offers to move what's left (or proposes a lighter plan) and asks for the go-ahead. | Guilt, streak talk, or moving everything without saying so. |
| 9 | **New**, then "When should I work out?" Then "Forget that." | Uses the saved evening preference. "Forget that" shows **Needs your OK**; nothing is forgotten until you confirm. Typing "yes" or pressing **Confirm** both work, and the buttons disappear. | Ignores the preference, or forgets it without asking. |
| 10 | Ask for something that can't succeed, e.g. "Add my workout to my Google Calendar" with no calendar connected, or move a task that doesn't exist. | A red failure line; the reply says it didn't happen. The server's correction is appended if the model claims otherwise. | Any "Done" for a change that didn't happen. |

### 2.5 Quality bar (score each 1–5 and note examples)

| Dimension | The question |
| --- | --- |
| Context | Does it actually know what's going on today: time, tasks, calendar, what slipped? |
| Continuity | Does it remember what we were just talking about, and what already changed today? |
| Agency | Does it make a recommendation instead of constantly asking permission? |
| Action | Does conversation lead to real changes that Today reflects? |
| Honesty | Do the replies, result cards and Today always agree? |
| Tone | Calm, concise, competent. No filler. |
| Recovery | When you fall behind, does it help you recover without guilt? |
| Distinctiveness | Does this feel meaningfully different from ChatGPT plus a to-do app? |

Target: *"It actually knows what's going on with me."* Not: *"It's a chatbot with tools."*

Record the conversations that fall short (screenshots, or the Assistant's history Sheet). Prompt changes should be driven by those examples.

> This development environment cannot reach api.openai.com, so the real-model run has to happen on the Preview.
