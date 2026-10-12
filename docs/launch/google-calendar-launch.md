# Google Calendar launch pack: domain, OAuth configuration and Google verification

Status: **prepared for review.** Nothing in Google Cloud Console, Vercel,
Supabase or Twilio has been changed. **No verification has been submitted.**
Items marked **(you)** need your account access.

Intended settings: canonical domain **https://www.arovenna.com**, support
contact **Support@arovenna.com** (confirmed active by the owner). The privacy
update is implemented on branch `launch-readiness`; see `legal-launch-readiness.md`.

---

## 1. Domain and redirect URI: what the code does

| What | Where in the code | Value it produces |
|---|---|---|
| OAuth redirect URI | `googleRedirectUri()` in `src/lib/integrations/google-oauth-route.ts` | `${NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`, or the request's own host if `NEXT_PUBLIC_APP_URL` is unset |
| After the callback, the user returns to | `backToSettings()` | `${NEXT_PUBLIC_APP_URL}/settings?calendar=…#integrations` |
| Canonical host for the connect flow (new on this branch) | `canonicalStartUrl()` | On Vercel production, a connect request on any other host is sent to `${NEXT_PUBLIC_APP_URL}/api/integrations/google/start` first |
| Site URL for metadata and share links | `brand.siteUrl` | **was `https://arovenna.com`; now `https://www.arovenna.com` on this branch** |
| Sign-in email links | `siteOrigin()` in `src/lib/origin.ts` | `NEXT_PUBLIC_APP_URL`, or the request host |
| Email unsubscribe links | `src/lib/email/service.ts` | `NEXT_PUBLIC_APP_URL` |
| Text-message (Twilio) signature check | `twilioWebhookBaseUrl()` in `src/lib/env.ts` | `TWILIO_WEBHOOK_BASE_URL`, else **`NEXT_PUBLIC_APP_URL`** |

**Mismatch found in code:** `brand.siteUrl` was the bare domain. It is fixed on
this branch.

**Unknown from here:** the current Production value of `NEXT_PUBLIC_APP_URL`,
Vercel's domain setup, and the redirect URIs registered in Google. If
`NEXT_PUBLIC_APP_URL` is `https://arovenna.com` while people use `www`, the
connect flow starts on one host and returns to the other. The sign-in session
and the OAuth state cookie don't cross hosts, so people end up at login or see
"couldn't be verified". The canonical-host redirect on this branch prevents
this once `NEXT_PUBLIC_APP_URL` is correct.

### Exact configuration for www (you)

Do these together, in this order, then redeploy Production:

1. **Vercel → Project → Domains:** make `www.arovenna.com` the primary domain, and set `arovenna.com` to **redirect (308) to `www.arovenna.com`**.
2. **Vercel → Environment Variables (Production):** set `NEXT_PUBLIC_APP_URL` to `https://www.arovenna.com`, with no trailing slash.
3. **Twilio** (otherwise inbound texts fail their signature check after step 2):
   - **Option A:** in the Twilio console, change the Messaging webhook URLs to `https://www.arovenna.com/api/sms/inbound` and `https://www.arovenna.com/api/sms/status`.
   - **Option B:** set `TWILIO_WEBHOOK_BASE_URL` to the exact origin Twilio already calls.

   Twilio does not follow redirects for POST webhooks, so the apex redirect alone is not enough.
4. **Supabase → Authentication → URL Configuration:** set Site URL to `https://www.arovenna.com`. Under Redirect URLs, add `https://www.arovenna.com/**` (keep the apex entry until the redirect is live).
5. **Google Cloud → Clients → your Web client → Authorized redirect URIs:** add exactly `https://www.arovenna.com/api/integrations/google/callback`. Remove the apex URI only after step 1 is live, and remove old `*.vercel.app` or `jarvis` URIs that are no longer used. No Authorized JavaScript origins are needed (server-side flow).
6. **Email (Resend), if used:** no change for sending. Unsubscribe links follow `NEXT_PUBLIC_APP_URL`.

**Side effects to expect:**
- People signed in on the bare domain sign in once more on www, because sessions belong to one host.
- Existing Google connections are unaffected: tokens don't depend on the host.

### Production variables to confirm (you; don't share the values)
- **Required for Calendar:**
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
  - `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes; never rotate casually, since every user would have to reconnect);
  - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`);
  - `NEXT_PUBLIC_APP_URL`.
- **Must NOT be set in Production:** `GOOGLE_API_TEST_BASE_URL`. This branch also makes Production ignore it.

---

## 2. Google Cloud Console steps (you)

1. **APIs & Services → Library:** check that **Google Calendar API** is enabled in the *same* project as the OAuth client. If it isn't, every sync fails. On this branch that shows as "temporarily unavailable" and no longer disconnects users.
2. **Google Auth Platform → Branding:**
   - App name: **Arovenna**.
   - User support email: **Support@arovenna.com**, after confirming the mailbox, or another address you control.
   - App logo: the new A mark, 120×120 PNG. A ready file is `src/app/icon.png`, 192 px; downscale it. Uploading a logo requires brand verification.
   - Application home page: `https://www.arovenna.com`.
   - Privacy policy: `https://www.arovenna.com/privacy`, after the Google section is published.
   - Terms of service: `https://www.arovenna.com/terms`.
   - Authorized domains: `arovenna.com`.
   - Developer contact email: an address you monitor.
3. **Google Search Console:** verify ownership of `arovenna.com` with a DNS TXT record, using the Google account that owns the Cloud project.
4. **Google Auth Platform → Data Access:** list only `https://www.googleapis.com/auth/calendar.events`. Remove any other scopes left over from testing. Google has added narrower event scopes, possibly one limited to calendars the user owns; if your project offers one, it would also cover what the app does, since it only uses the primary calendar. It is still classed as sensitive, and switching changes the consent screen and needs a code change.
5. **Google Auth Platform → Audience:**
   - **Testing:** only listed test users, up to 100, can connect, and **their access expires after 7 days**, so they must reconnect weekly. Fine for internal demos; not for investors using it for more than a week.
   - **In production, unverified:** anyone can connect, but they see "Google hasn't verified this app", and there is a lifetime cap of 100 users.
   - **In production, verified:** no warning and no cap. Requires the review in section 3.
   - **Recommendation:** switch to In production now, so connections stop expiring weekly, and submit for verification the same day the privacy policy is live.
6. **Google Auth Platform → Clients:** redirect URIs as in section 1, step 5.

---

## 3. Google verification submission (you submit; materials below)

### Scope justification (paste into "How will the scopes be used?")

> Arovenna is a personal planning assistant. Users can optionally connect their own Google Calendar so the app can plan their day around their real commitments.
>
> We request only `https://www.googleapis.com/auth/calendar.events`, and use it only on the user's primary calendar, to:
> 1. **Read events**, so we can show the user's schedule on the Calendar and Today screens and find free time when planning tasks.
> 2. **Create events**, when the user asks the assistant to schedule something, or adds an event on the Calendar page.
> 3. **Update and reschedule events** the user organizes, when the user asks.
> 4. **Delete events** the user organizes, when the user asks.
>
> Every change the assistant proposes is shown to the user first: the event, its time, and whether guests will be notified. Nothing is written until the user explicitly approves. A read-only scope is not sufficient, because creating and changing events is the core feature. We do not request the broader `calendar` scope, because we do not manage calendars, settings or sharing.
>
> We store only minimal event metadata (title, time, location, status) for the next 30 days, in encrypted-at-rest storage, and delete it, revoking access, when the user disconnects or deletes their account. Google user data is never sold, never used for advertising, and never used to train AI models.

### Demo video checklist (unlisted YouTube link; English; about 3–5 minutes)

Record on `https://www.arovenna.com` in a normal browser, with the address bar visible throughout.

1. Show the homepage, then the privacy policy page scrolled to the Google Calendar section.
2. Sign in to Arovenna, or create a new account, and show that onboarding does not require Google.
3. **Settings → Integrations → Connect.**
4. **The Google consent screen:** pause on it.
   - The app name "Arovenna" and logo must be visible.
   - The **address bar must show the OAuth client ID** (`client_id=…`).
   - Show the requested permission ("View and edit events on all your calendars").
5. Approve. Show the return to Settings: "Connected as <your Gmail>".
6. **Read:** open Calendar and Today and show the real events from that Google account. Show the same events in Google Calendar in another tab.
7. **Create:** ask the assistant "Schedule a 30-minute walk tomorrow at 7am". Show the proposal card, approve it, and show the new event in Google Calendar.
8. **Update and reschedule:** ask the assistant to move that event. Approve, and show it moved in Google Calendar.
9. **Delete:** ask the assistant to delete it. Show the confirmation, approve, and show it gone from Google Calendar.
10. **Disconnect** in Settings. Show that the events disappear from Arovenna, and that Arovenna no longer appears at https://myaccount.google.com/permissions.

Use a test Google account with sample events, not personal data.

### Other review answers
- **Does the app use Google user data for AI?** Yes, to answer the user's own requests (planning around their events). It is not used to train models. The privacy policy states this.
- **Is the data shared with third parties?** Only with the service providers that run the features (OpenAI for AI replies, Supabase for storage, Vercel for hosting), as the privacy policy lists.
- **Security assessment (CASA):** generally required for *restricted* scopes such as Gmail. `calendar.events` is *sensitive*, not restricted, so a CASA assessment is not normally required. Follow whatever Google requests in the review.

### Timeline risk (deadline 31 October 2026)
- Brand verification is often a few business days. Sensitive-scope verification often takes from several days to several weeks, and Google may come back with questions; neither is guaranteed.
- **Critical path:**
  1. Confirm the support mailbox.
  2. Publish the privacy update.
  3. Verify the domain in Search Console.
  4. Complete the Branding fields.
  5. Record the demo video.
  6. Submit.
- Until approval, use In production, unverified: the warning screen and 100-user cap, but no weekly expiry.

---

## 4. Who does what

| Task | Needs your access | Prepared here |
|---|---|---|
| Code fixes and tests | — | ✅ branch `calendar-launch-readiness` |
| Privacy-policy text | Approval to publish | ✅ `docs/launch/privacy-google-calendar-draft.md` |
| Confirm `Support@arovenna.com` receives mail | ✔ email provider | — |
| Vercel domain redirect and `NEXT_PUBLIC_APP_URL` | ✔ Vercel | exact values above |
| Twilio webhook URLs, or `TWILIO_WEBHOOK_BASE_URL` | ✔ Twilio / Vercel | exact values above |
| Supabase Site URL and redirect URLs | ✔ Supabase | exact values above |
| Search Console domain verification | ✔ DNS and Google account | — |
| Calendar API enabled, Branding, Data Access, Clients, Audience | ✔ Google Cloud | exact values above |
| Demo video recording | ✔ test Google account and Production | checklist above |
| Submit verification | ✔ Google Cloud | justification text above |
| Real-Google test with fresh accounts | ✔ test Google accounts, after Console setup | journey test exists against the mock |
