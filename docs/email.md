# Email accountability

Jarvis can email the user a short check-in and keep the conversation going when
they reply. It is a third channel, alongside in-app chat and SMS, and it uses
the same assistant: the same context (profile, assistant name and personality,
goals, tasks, calendar, memories and recent conversation), the same tools, and
the same confirmation rules.

```
check-in email ──► user replies ──► Resend inbound ──► POST /api/email/inbound
                                                        │ verify Svix signature
                                                        ▼
            reply token → email_outbound row → user + conversation (server-side lookup)
            sender must equal the account's auth email
            strip quoted text → assistant turn (tools, confirmations) → reply email
```

Email check-ins are **off by default**. Each user turns them on under
**Settings → Email accountability**. Email always goes to the account's
sign-in email address. No other address is stored or accepted.

## Code map

| Piece | File |
|---|---|
| Migration | `supabase/migrations/20261007000000_email_accountability.sql` |
| Send path (eligibility, daily cap, dedupe, record, send) | `src/lib/email/service.ts` |
| `sendAccountabilityCheckIn(admin, userId, context)` | `src/lib/email/check-in.ts` |
| Inbound pipeline | `src/lib/email/inbound.ts` |
| Provider interface / Resend / test provider | `src/lib/email/providers/` |
| Webhook signature (Svix) | `src/lib/email/webhook-signature.ts` |
| Quote stripping, address and token parsing | `src/lib/email/parse.ts` |
| Copy and rendering | `src/lib/email/templates.ts` |
| Webhook route | `src/app/api/email/inbound/route.ts` |
| Unsubscribe route | `src/app/api/email/unsubscribe/route.ts` |
| Settings actions / UI | `src/lib/actions/email.ts`, `src/components/settings/email-settings.tsx` |

## Data

- **`notification_preferences.email_enabled`** (default `false`),
  `email_enabled_at` and `email_daily_limit` (default 6, range 1–20). These
  columns limit proactive emails (check-ins and tests) per rolling 24 hours.
  Replies have a separate hard cap of 30 per day, which guards against mail
  loops.
- **`email_outbound`**: every email sent, or recorded in test mode. It holds
  the user, conversation, kind (`check_in` / `reply` / `test`), status
  (`queued` / `sent` / `test` / `failed` / `skipped`) and the provider id.
  - **`reply_token`** is 160 random bits that appear only in the Reply-To
    address `reply+<token>@<reply domain>`.
  - **`unique (user_id, dedupe_key)`** means the same email is never sent
    twice. Resend also receives the row id as `Idempotency-Key`.
  - Users can read their own rows (Settings shows recent emails). Only the
    server writes them.
- **`email_inbound`**: every inbound webhook delivery. It is server-only:
  RLS is on, there are no policies and no grants to API roles.
  `unique (provider, provider_email_id)` turns a redelivered webhook into a
  no-op.
- **Channel checks:** `'email'` was added to the channel checks on
  `conversations`, `conversation_messages` and `assistant_actions`.
- **Account deletion:** deleting the account removes all of it by cascade.

## Security model

Inbound email is untrusted input.

- **Signature.** Every webhook must carry a valid Svix signature
  (`RESEND_WEBHOOK_SECRET`) with a timestamp within ±5 minutes. Otherwise the
  route returns 401. If no secret is set, it returns 503.
- **Who and which thread come from a server-side lookup only.** The handler
  takes the reply token from the recipient address and loads the
  `email_outbound` row. That row gives the user and the conversation. Nothing
  in the subject or body is used to pick a user or conversation.
- **The sender must be the account's own email.** The `From` address must
  equal the account's current, confirmed auth email. Anyone else, including
  another user who has the token, is ignored. Threads older than 30 days are
  rejected.
- **Idempotency.** The inbound row is inserted before any work, so a
  duplicate delivery stops there. The reply is deduped on `reply:<inbound id>`.
- **Loop protection.** Auto-replies (`Auto-Submitted`, `X-Autoreply`,
  `Precedence: bulk/list/auto_reply`) are ignored. Outbound email carries
  `Auto-Submitted: auto-generated`.
- **No arbitrary recipients.** The address is always read from Supabase Auth
  on the server. The Settings test button takes no arguments.
- **Confirmations are unchanged.** Deletions, goal-target changes, calendar
  changes and similar still only create a proposal. When a reply creates one,
  the email ends with "Reply YES to confirm or NO to cancel." The YES comes
  back as a later message in the same conversation, and `confirm_action`
  claims the proposal atomically, exactly as in chat and SMS.
  - Email proposals stay open for 12 hours instead of 30 minutes, because
    email replies are slow. Every other rule is the same.
- **Opting out.** Replying `STOP` or `unsubscribe` turns email off.
  - The footer link and the `List-Unsubscribe` header (RFC 8058 one-click) do
    the same through `/api/email/unsubscribe`.
  - A GET on that endpoint only shows a confirmation button, because link
    scanners prefetch GETs. Only a POST changes anything.
- **Secrets.** `RESEND_API_KEY` and the service-role key are only read on the
  server, in `src/lib/env.ts`. The browser never sees them.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_MODE` | no | `test` (default) records only and sends nothing. `live` sends through Resend. `disabled` turns email off. |
| `RESEND_API_KEY` | for live | Resend API key, server-only. Sending access is enough to send. Reading received emails needs a key that can read them; a full-access key works. |
| `EMAIL_FROM` | for live | Sender on a **domain you verified in Resend**, e.g. `Jarvis <jarvis@mail.your-domain.com>`. The display name becomes the user's assistant name. |
| `EMAIL_REPLY_DOMAIN` | recommended | Domain with Resend receiving enabled. Replies go to `reply+<token>@<domain>`. Defaults to the domain in `EMAIL_FROM`. |
| `RESEND_WEBHOOK_SECRET` | for replies | Signing secret (`whsec_…`) of the inbound webhook endpoint. |
| `NEXT_PUBLIC_APP_URL` | yes | Used for the unsubscribe link in each email. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Sending, the webhook and the unsubscribe endpoint use it on the server. |

Never commit real values. Set them in Vercel under Project → Settings →
Environment Variables.

## Provider setup (Resend)

1. **Verify a sending domain.** In Resend, go to Domains → Add domain. A
   subdomain such as `mail.your-domain.com` keeps your main domain's
   reputation separate. Add the SPF/DKIM DNS records Resend shows, and add a
   DMARC record. Then set `EMAIL_FROM` to an address on that domain.
2. **Enable receiving.** For the reply domain, for example
   `reply.your-domain.com`:
   - enable Receiving in Resend;
   - add the MX record Resend shows;
   - set `EMAIL_REPLY_DOMAIN`.

   Use a subdomain that has no other mailboxes, because Resend receives every
   address on it.
3. **Add the webhook.** In Resend, go to Webhooks → Add endpoint:
   - URL: `https://<your-domain>/api/email/inbound`
   - Event: `email.received`
   - Copy the signing secret into `RESEND_WEBHOOK_SECRET`.
4. **Go live.** Set `RESEND_API_KEY` and `EMAIL_MODE=live`, then redeploy.

### API verification (2026-10-02)

The Resend calls in `src/lib/email/providers/` were checked against Resend's
OpenAPI spec (`github.com/resend/resend-openapi`, `resend.yaml`) and the
official Node SDK (`resend@6.32.0` on npm):

- **The `email.received` webhook** has the envelope
  `{ type: "email.received", created_at, data }`, with
  `data = { email_id, created_at, from, to, cc, bcc, received_for, message_id, subject, attachments }`.
  The body isn't included, so the handler always fetches it.
- **`GET /emails/receiving/{email_id}`** ("Retrieve a single received email")
  returns `text`, `html` and `headers`, all nullable, along with `to`, `from`,
  `cc`, `bcc`, `reply_to`, `received_for`, `message_id`, `subject`,
  `attachments` and `raw`. The SDK's `resend.emails.receiving.get(id)` calls
  the same path.
- **Signatures:** the spec says every webhook delivery is signed with
  `svix-id`, `svix-timestamp` and `svix-signature`. The SDK verifies them with
  the Standard Webhooks library:
  - signed content `id.timestamp.body`;
  - HMAC-SHA256 with the base64 key after `whsec_`;
  - `v1,<sig>` values, space-separated;
  - ±5 minute tolerance.

  `webhook-signature.ts` implements the same algorithm.
- **Sending:** `POST /emails` accepts `reply_to`, a custom `headers` object
  and the `Idempotency-Key` header.

## Enable it for your own account

1. Apply the migration (`supabase db push`, or run the SQL in the dashboard).
2. Go to Settings → Email accountability and turn it on.
3. Click **Send me a test check-in**.
   - In `test` mode the email appears under "Recent emails" with the status
     "test — not sent".
   - In `live` mode it arrives in your inbox.
4. Reply to the email in plain words, for example "running late, move it to
   8". Jarvis answers by email, and the exchange also shows in the Assistant
   screen as the "Email" conversation.

## Local testing

- `npm test` runs the unit tests: parsing, quote stripping, signatures,
  templates, providers, the route and the actions.
- `npm run test:integration` runs the integration tests. They need
  `supabase start`, use real RLS and the in-memory test provider, and cover
  opt-in, dedupe, failures, the daily cap, sender checks, duplicates,
  context, actions and YES confirmations, STOP and auto-replies.
- No test can send real email. `EMAIL_MODE` defaults to `test`, and the tests
  inject `TestEmailProvider`.
- To try the real webhook locally:
  1. Expose the dev server, for example with `ngrok http 3000`.
  2. Point a Resend test webhook at `https://<ngrok>/api/email/inbound`.
  3. Set `RESEND_WEBHOOK_SECRET` and `EMAIL_MODE=live`.

## Limitations

- **No automatic sending yet.** Check-ins go out only when the user clicks
  "Send me a test check-in". No cron sends them and no user is emailed
  automatically.
- **One email thread per user.** All check-ins and replies continue a single
  "Email" conversation, like SMS.
- **Bodies come from the text part.** The handler uses the plain-text part,
  falling back to HTML converted to text. Attachments are ignored.
  Quote stripping covers Gmail, Apple Mail, Outlook and mobile footers, but
  unusual clients may leave some quoted text.
- **Sender verification checks the From address.** Spoofing is mitigated by
  the secret per-email token, which an attacker would also need, and by the
  sender domain's DMARC policy. The handler doesn't inspect
  `Authentication-Results` itself.
- **The daily cap is a soft limit.** Two sends at exactly the same moment
  could both pass the cap check. Dedupe keys still prevent duplicates of the
  same email.

## Future: automated check-ins

`sendAccountabilityCheckIn(admin, userId, { reason, dedupeKey })` is the
single entry point. A scheduler only has to decide who to email and when, for
example:

- a cron route like `/api/cron/dispatch`;
- the user's check-in times and quiet hours from `notification_preferences`;
- missed-plan detection, such as a priority task still open 30 minutes after
  its start.

It would pass a stable `dedupeKey` such as `check_in:<date>:<task id>`. The
eligibility check, the daily cap, dedupe, recording and the reply flow are
already in place. SMS could later share the same scheduling decision.
