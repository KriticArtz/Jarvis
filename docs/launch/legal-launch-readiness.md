# Arovenna — privacy, legal, accessibility and Google Calendar launch readiness

Branch: `launch-readiness`, created from `calendar-launch-readiness`. **Production is unchanged** (`1a94b30`). Nothing was changed in Vercel, Supabase, Google Cloud, Twilio, Resend or DNS.

Status labels:
- **DONE**: implemented and tested on this branch.
- **NEEDS YOUR INPUT**: a business or legal decision.
- **MANUAL ACTION**: needs your account access.
- **LEGAL REVIEW**: needs a lawyer.
- **N/A**: not applicable.

None of this is legal advice, and nothing here claims compliance.

---

## 1. Audit findings

| # | Area | Finding | Class | Status |
|---|---|---|---|---|
| 1 | Placeholders | `support@example.com` and `privacy@example.com` in `brand.ts`, shown on Privacy, Terms and in the SMS HELP reply | implementable | **DONE**: now `Support@arovenna.com`. Remaining `example.com` hits are test fixtures and the internal `/design` page. |
| 2 | Privacy Policy | No Google Calendar section, no Limited Use disclosure. Missing Resend, Google, email check-ins, health/activity data, legal bases, transfers, Calendar disconnection vs. account deletion | implementable / legal review | **DONE** (text) + **LEGAL REVIEW** |
| 3 | Terms | No paid-plan, Google/connected-services, IP, availability or non-waivable-rights language. Governing law correctly omitted (`null`) | implementable / legal review | **DONE** + **LEGAL REVIEW** |
| 4 | Subscription & refunds | No payment code, checkout, prices or billing provider exists | needs decision | **DONE**: an honest "currently free" page. The paid-plan structure is listed in §4. |
| 5 | Cookies | Only essential cookies, plus one homepage appearance key in localStorage. No analytics, ads or third-party scripts (verified in code and in a browser: a signed-out visit sets **no** cookies) | implementable | **DONE**: Cookie Policy with a real preferences control. **No banner needed**, and none was added. |
| 6 | Footer | Only Terms and Privacy | implementable | **DONE**: all eight links on the landing, legal and auth pages |
| 7 | Public routes | New policy pages had to be added to `PUBLIC_PATHS`, or signed-out visitors (and Google reviewers) would be sent to login | blocker (fixed) | **DONE**, and tested |
| 8 | Forms | Labels, server-side zod validation and Supabase auth rate limits were already present. Hints and errors were not tied to inputs (`aria-describedby`) | implementable | **DONE** in the shared `Field` component |
| 9 | Signup | No age statement | implementable | **DONE**: "you confirm you're at least 13" |
| 10 | Marketing consent | No marketing email exists. Texts and email check-ins are opt-in (email off by default; SMS needs a checkbox) | — | OK. The policy now promises separate consent before any marketing. |
| 11 | Dark patterns / claims | No fake reviews, ratings, user counts, prices, countdowns or pre-checked boxes. The landing page illustrations are labelled as made-up examples | — | OK |
| 12 | Claim: Apple Health / Health Connect | The landing page and Settings ("Install Arovenna on your iPhone") present the companion app as available. **If the iOS/Android app isn't published, this is misleading** | needs decision | **NEEDS YOUR INPUT** |
| 13 | Accessibility | axe found low-contrast warning/success chips, faded completed tasks (opacity 55%), `subtle` small text, an invalid `<dl>`, non-focusable scroll areas, the iMessage-blue bubble, and the unsubscribe page's blue | implementable | **DONE**: 236/236 automated checks across all 7 themes × light/dark |
| 14 | Account deletion | Cascades remove every user table (RLS test verifies, including `inbound_messages` since the 2026-10-01 migration). Google is revoked first. Texts or emails from numbers/addresses matching no account are kept with no retention limit | needs decision | **NEEDS YOUR INPUT**: a retention period for unmatched inbound messages |
| 15 | Data export | No self-service export. Requests go to email (the policy says so) | needs decision | **NEEDS YOUR INPUT** (optional feature) |
| 16 | Legal entity | Registered name, address and governing law are unknown | needs decision | **NEEDS YOUR INPUT**. The fields exist (`brand.legal.entityName`, `postalAddress`, `governingLaw`); the pages omit them rather than invent them. |
| 17 | AI training statements | The policy says: we don't train models on user data; OpenAI's API terms say API data isn't used for training unless the customer opts in | needs confirmation | **NEEDS YOUR INPUT**: confirm your OpenAI org hasn't opted in to data sharing |
| 18 | SMS sender name | Changed to "Arovenna" in the app, consent wording and policies (2026-10-18). The Twilio brand/campaign registration, sample messages and HELP/STOP replies are configured in the Twilio console and must be updated to match before live SMS | external config | **Twilio console update required** |

## 2. Routes (all static; they also render on the Supabase-less Preview)

`/privacy` · `/terms` · `/subscriptions` · `/cookies` (`#preferences`) · `/accessibility` · `/privacy-requests`. Footer also links Cookie Preferences and `mailto:Support@arovenna.com`. Settings → Privacy & data now links Data Deletion & Privacy Requests.

## 3. Processor and SDK inventory (from code)

| Provider | Purpose | When | Data |
|---|---|---|---|
| Supabase | Database, auth | Always | All account data |
| Vercel | Hosting, server logs | Always | Requests and logs (PII is redacted by `observability/log`) |
| OpenAI | AI replies (`store: false`) | When using the assistant or planning | Relevant context; calendar and activity data on demand |
| Twilio | SMS, number verification | Opt-in | Phone number, messages |
| Resend | Email check-ins (send and inbound) | Opt-in (off by default) | Email address, messages |
| Google Calendar API | Calendar sync and writes | Opt-in | `calendar.events` on the primary calendar |
| Apple HealthKit / Health Connect | On-device reads by the companion app | Opt-in | Daily aggregates, sleep, workout summaries |

**Front-end SDKs:** none. There are no analytics, tag managers, error trackers, chat widgets or ad pixels. Fonts are self-hosted at build time (`next/font`); icons are bundled (lucide). **Mobile:** Expo, `expo-secure-store`, HealthKit and Health Connect libraries, with no analytics. *Nothing needed removing.*

## 4. Decisions needed from you

1. **Legal entity:** registered name, address, and governing law and venue. Then set `brand.legal.*`.
2. **Minimum age:** 13 today (plus "or older where local law requires"). Decide whether to require 16 or 18 instead, given health data and AI.
3. **OpenAI data-sharing setting:** confirm it is off.
4. **Companion app availability:** if it isn't in the App Store or Play Store, change the landing and Settings copy to "coming soon", or hide it.
5. **Retention:** how long to keep unmatched inbound texts and emails, and server logs.
6. **Paid plans (before any launch):**
   - free vs. paid features;
   - monthly and annual prices;
   - trial (yes/no, length, reminder);
   - auto-renewal reminder;
   - refund rule and EU/UK withdrawal handling;
   - web billing provider;
   - App Store / Play billing for in-app purchases.

   Then rewrite `/subscriptions` to match the checkout.
7. **Privacy-request handling:** a response-time commitment (none is promised now), and whether to build a self-service export.
8. **Accessibility:** whether to commission an independent audit before claiming conformance.

## 5. Asset-license inventory

| Asset | Source | License | Status |
|---|---|---|---|
| Geist, Geist Mono | `next/font/google` (Vercel) | SIL OFL 1.1 | OK |
| Instrument Serif | `next/font/google` | SIL OFL 1.1 | OK |
| Icons | `lucide-react` | ISC | OK |
| Arovenna symbol, wordmark (`logo.tsx`, `icon.svg`, `icon.png`, `apple-icon.png`, `opengraph-image.jpg`) | Traced from the logo you supplied | Yours | **NEEDS YOUR INPUT**: confirm you own the logo and the rights to it (and consider a trademark search) |
| `public/brand/arovenna-logo.webp` | Supplied by you; used only on the internal `/design/arovenna` page | Yours | same |
| Landing illustrations | Built in code (HTML/CSS), no stock images | — | OK |

## 6. Google Calendar: public-launch readiness

**Code (DONE, verified against the mock Google):**
- Any signed-in user can connect their own Google account. Nothing in the code restricts users or needs the owner to add emails.
- Scope is `calendar.events` only. PKCE plus an encrypted state cookie; tokens encrypted at rest.
- Revocation on disconnect and on account deletion; rate limits no longer drop connections.
- In-app-browser guidance, and canonical-host redirect.
- The Privacy Policy now contains the Google section and the Limited Use statement at `https://www.arovenna.com/privacy#limited-use`.

**Why users still can't self-connect today (MANUAL ACTION):** while the OAuth consent screen is in **Testing**, Google only lets listed test users connect. That is the "owner adds each email" problem, and it is a Google Console setting, not code.

**Final Google Cloud checklist (in order):**
1. **Release this branch to Production** (after your approval), so `/privacy`, `/terms` and the homepage footer are live on `https://www.arovenna.com`.
2. **Search Console:** verify `arovenna.com` via DNS TXT, with an owner of the Cloud project.
3. **Branding:**
   - App name: Arovenna.
   - Support email: Support@arovenna.com.
   - Logo: 120×120 PNG of the A mark.
   - Home page: `https://www.arovenna.com`.
   - Privacy: `https://www.arovenna.com/privacy`.
   - Terms: `https://www.arovenna.com/terms`.
   - Authorized domain: `arovenna.com`.
   - Developer contact: an address you monitor.
4. **Data Access:** only `https://www.googleapis.com/auth/calendar.events`.
5. **Clients:** the redirect URI `https://www.arovenna.com/api/integrations/google/callback`. Also complete the domain steps in `google-calendar-launch.md` §1: Vercel primary domain, `NEXT_PUBLIC_APP_URL`, Twilio, Supabase.
6. **Calendar API** enabled in the same project.
7. **Audience → Publish app → In production.**
   - From then on, **anyone** can connect.
   - Until verification, they see the "unverified app" screen, with a 100-user cap.
8. **Submit for verification:** scope justification and the demo-video checklist are in `google-calendar-launch.md` §3.
9. **After Google approves:** test with two fresh Google accounts that were never test users.

Do not consider public authorization ready until Google confirms verification.

## 7. Production risks and rollback

**Risk is low:**
- Content pages, footer, contrast tokens, and one shared form component (`Field`, which only adds `aria-describedby`/`aria-invalid`).
- No schema, migration, environment-variable, auth or OAuth-flow changes.

**Visible changes:**
- The warning and success colors are slightly darker in light mode.
- Completed tasks are shown in muted text instead of at 55% opacity.
- The SMS HELP reply now shows `Support@arovenna.com`.

**Rollback:** redeploy the previous Production deployment in Vercel (instant), or reset the Production branch to `1a94b30` with your approval. There is no data migration to undo.
