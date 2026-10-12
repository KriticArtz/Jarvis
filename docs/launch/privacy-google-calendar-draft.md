# DRAFT — Privacy Policy additions for Google Calendar

Status: **draft for review. Not published.** Nothing here is live until it is
approved and added to `src/app/(legal)/privacy/page.tsx`.

- Proposed support contact: **Support@arovenna.com**. Not yet confirmed to
  receive mail. Confirm the mailbox works before publishing, and decide
  whether `brand.legal.privacyEmail` (currently `privacy@example.com`) and
  `brand.supportEmail` (currently `support@example.com`) should change to it.
- Every statement below matches the code on branch `calendar-launch-readiness`.
  The "Basis in the code" notes are for review only and are not part of the policy.
- One statement depends on your OpenAI account settings, not the code. It is
  marked **[confirm]**.

---

## 1. New section: "Google Calendar (optional)"

Place it after "Information we collect".

> **Google Calendar (optional)**
>
> Connecting Google Calendar is optional. You can use Arovenna without it, and you can disconnect at any time in Settings → Integrations.
>
> **What we access.** When you connect, you sign in with Google and approve one permission: to view and edit events on your calendars. Google describes it as "View and edit events on all your calendars". We do not ask for the broader permission to manage your calendars themselves, their settings or their sharing. Although the permission covers all your calendars, Arovenna only reads and changes events on your **primary calendar**.
>
> **What we store.** To show your schedule and plan around it, we keep a copy of the following details for events from the start of today through the next 30 days (up to about two months when you view a month on the Calendar page), and for past events for up to 35 days:
> - title, start and end time, whether it is all-day, and its time zone
> - location
> - whether it is confirmed, tentative or cancelled, and whether it shows you as busy
> - its color, whether it repeats, whether you are the organizer, and how many guests it has (not who they are)
>
> We do **not** store event descriptions, guest names or email addresses, attachments or conference links. When you open an event, or ask the assistant about a specific event, we fetch its description and guest names from Google at that moment to show or answer, and we do not keep them.
>
> **How we use it.** Only to provide features you can see and use: showing your events in Arovenna, finding free time, planning your day around your commitments, and — only when you approve each one — creating, rescheduling, editing or deleting events for you. When you approve a change to an event that has guests, Google may notify those guests, and we tell you before you approve.
>
> **Your Google sign-in credentials.** We never see your Google password. Google gives us access tokens. We encrypt them (AES-256-GCM), keep them only on our servers, and never show them in the app or write them to logs.
>
> **AI processing of calendar data.** To answer your requests and plan your day, we send the relevant calendar details (for example the titles, times and locations of upcoming events, and, when you ask about a specific event, its description and guest names) to our AI provider, OpenAI, which processes them on our behalf, with the same protections described in "AI processing". Calendar data is not used to train AI models: we do not use it for that, and our agreement with OpenAI does not allow it to use API data for training. **[confirm: your OpenAI organization has not opted in to sharing API data]**
>
> **Disconnecting and deletion.** When you disconnect Google Calendar, or delete your account, we revoke Arovenna's access at Google and delete the stored tokens and every calendar event we copied. You can also remove Arovenna's access at any time from your Google Account at https://myaccount.google.com/permissions. If Google tells us access was revoked, we delete the tokens and ask you to reconnect.
>
> **Google API Services User Data Policy.** Arovenna's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. In particular:
> - we use Google user data only to provide and improve the user-facing calendar features described above;
> - we do not use it for advertising, and we do not sell it;
> - we transfer it only to the service providers listed in this policy that help us provide these features (OpenAI for AI responses, Supabase for secure storage, Vercel for hosting), as necessary to provide them, for security, or to comply with the law;
> - no person at Arovenna reads it, unless you ask us to (for example in a support request), it is needed for security or to investigate abuse, or the law requires it;
> - we do not use it to develop, improve or train generalized AI or machine-learning models.

**Basis in the code:**
- Scope: `calendar.events` only (`src/lib/integrations/calendar/scopes.ts`, `google.ts`).
- Primary calendar only: `CALENDAR_ID = "primary"` in `sync.ts`.
- Stored fields: `normalizeGoogleEvent` in `google.ts` and the `calendar_events` columns.
- Window: `CALENDAR_SYNC_DAYS` (30) and the calendar page range (≤62); past events are pruned after `KEEP_PAST_DAYS` (35).
- On-demand details: `getCalendarEventDetails`; the assistant's `get_calendar_event` tool.
- Confirmation: the calendar tools have `risk: "confirm"`.
- Guest notice: `guestsNote` and `cardNotes`.
- Encryption: `src/lib/integrations/crypto.ts`.
- Revoke and delete: `disconnectGoogleCalendar`, `deleteUserAndData`, `markNeedsReconnect`.
- The connected account shown in Settings is read live and not stored (`googleAccountLabel`).

## 2. Edits to existing sections

**"Information we collect"**, add a bullet:
> Google Calendar (optional): if you connect it, event details from your primary calendar as described in "Google Calendar (optional)" below.

**"Service providers"**, add a bullet:
> Google: if you connect Google Calendar, we exchange your calendar events with Google to show and update them.

**"Retention and deletion"**: no change needed. `DELETED_DATA` already lists "Connected calendars … (Google access is revoked)".

**"Contact"**: replace `privacy@example.com` with the approved address, for example **Support@arovenna.com**, once the mailbox is confirmed.

**"Last updated"**: set `brand.legal.lastUpdated` to the publication date.

## 3. Also check before submitting for Google verification

- The privacy policy URL on the consent screen must be on the verified domain: `https://www.arovenna.com/privacy`.
- The homepage, `https://www.arovenna.com`, must describe what the app does and link to the privacy policy. The footer already links to Privacy and Terms.
- The app name and logo on the consent screen must match the website: "Arovenna" and the new A mark.
