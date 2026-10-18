import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { DELETED_DATA } from "@/lib/account/deletion";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${brand.name} collects, uses and protects your information, including Google Calendar data.`,
  alternates: { canonical: "/privacy" },
};

const GOOGLE_USER_DATA_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";

/*
 * Every statement here should match the code. Where a statement depends on
 * the code, the source is noted in docs/launch/legal-launch-readiness.md.
 * Do not add claims (certifications, response times, retention periods) that
 * the product or the owner has not confirmed.
 */
export default function PrivacyPage() {
  const { legal } = brand;
  const contact = <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Privacy Policy</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>

      <p>
        This policy explains what information {brand.name} collects when you use the {brand.name} website, web app, companion mobile app,
        text messages and emails, how we use it, who we share it with, and the choices you have (&ldquo;we&rdquo; and &ldquo;us&rdquo; mean{" "}
        {legal.entityName === brand.name ? brand.name : `${legal.entityName}, which operates ${brand.name}`}
        {legal.postalAddress ? `, ${legal.postalAddress}` : ""}). Questions: {contact}.
      </p>

      <nav aria-label="On this page" className="mt-5 rounded-2xl bg-surface-2 p-4 text-[15px]">
        <p className="!mt-0 font-semibold">On this page</p>
        <ul className="columns-1 sm:columns-2">
          {[
            ["collect", "Information we collect"],
            ["google-calendar", "Google Calendar (optional)"],
            ["health", "Activity and sleep data (optional)"],
            ["use", "How we use information"],
            ["ai", "AI processing"],
            ["legal-bases", "Legal bases"],
            ["providers", "Service providers"],
            ["sms", "Text messages"],
            ["email", "Email check-ins"],
            ["retention", "Retention and deletion"],
            ["security", "Security"],
            ["transfers", "International transfers"],
            ["rights", "Your choices and rights"],
            ["children", "Children"],
            ["changes", "Changes"],
            ["contact", "Contact"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <h2 id="collect">Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> your email address and password. Passwords are handled by our authentication provider and
          stored only in hashed form; we never see them.
        </li>
        <li>
          <strong>Information you give the app:</strong> your name, time zone, typical schedule and recurring commitments, accountability
          preferences, your assistant&apos;s name and personality, theme and appearance settings, goals, tasks, progress, daily plans,
          check-ins, weekly reviews, and notes you ask the assistant to remember.
        </li>
        <li>
          <strong>Conversations:</strong> messages you exchange with the assistant in the app, by text message and by email, and the actions
          the assistant proposed and whether you approved them.
        </li>
        <li>
          <strong>Phone and text-message information (optional):</strong> your mobile number, whether it is verified, your consent to texts
          (the time and the exact wording you agreed to), opt-outs, and the texts we send and receive.
        </li>
        <li>
          <strong>Email check-ins (optional):</strong> if you turn them on, the emails we send you and the replies you send back.
        </li>
        <li>
          <strong>Google Calendar (optional):</strong> if you connect it, event details from your primary calendar, as described in{" "}
          <a href="#google-calendar">Google Calendar</a> below.
        </li>
        <li>
          <strong>Activity and sleep data (optional):</strong> if you connect Apple Health or Health Connect through our companion mobile
          app, daily activity totals, sleep time and workout summaries, as described in <a href="#health">Activity and sleep data</a>.
        </li>
        <li>
          <strong>AI usage records:</strong> for each AI request, the feature used, the model, token counts, an estimated cost and timing.
          These records do not contain the content of your messages.
        </li>
        <li>
          <strong>Technical logs:</strong> limited server logs used to operate and secure the service. We remove email addresses, phone
          numbers, tokens and other credentials from our logs.
        </li>
        <li>
          <strong>Cookies and similar storage:</strong> only what is needed to sign you in and keep the service secure, plus one setting that
          remembers the light or dark appearance you picked on our homepage. We do not use advertising or analytics cookies or trackers. See
          our <Link href="/cookies">Cookie Policy</Link>.
        </li>
      </ul>
      <p>We do not collect payment card details: {brand.name} does not currently sell paid plans.</p>

      <h2 id="google-calendar">Google Calendar (optional)</h2>
      <p>
        Connecting Google Calendar is optional. You can use {brand.name} without it, and you can disconnect at any time in{" "}
        <strong>Settings → Integrations</strong>.
      </p>
      <p>
        <strong>What we access.</strong> When you connect, you sign in with Google and approve one permission, which Google describes as
        &ldquo;View and edit events on all your calendars&rdquo;. We do not ask for the broader permission to manage your calendars
        themselves, their settings or their sharing. Although the permission covers all your calendars, {brand.name} only reads and changes
        events on your <strong>primary calendar</strong>. We never see your Google password.
      </p>
      <p>
        <strong>What we store.</strong> To show your schedule and plan around it, we keep a copy of these details for events from the start
        of today through the next 30 days (up to about two months when you view a month on the Calendar page), and recent past events. Copies of
        past events are removed once they are more than 35 days old, but only when a full sync runs: when you open Today or Calendar and
        the last sync was over an hour ago, when you choose Sync now, or when you reconnect. So if you stop opening {brand.name}, older
        copies stay until you disconnect Google Calendar or delete your account, and viewing an earlier month on the Calendar page copies
        that month&apos;s events again until the next full sync. We keep these details:
      </p>
      <ul>
        <li>title, start and end time, whether it is all-day, and its time zone;</li>
        <li>location;</li>
        <li>whether it is confirmed, tentative or cancelled, and whether it shows you as busy;</li>
        <li>its color, whether it repeats, whether you are the organizer, and how many guests it has (not who they are).</li>
      </ul>
      <p>
        We do not store event descriptions, guest names or email addresses, attachments or conference links. When you open an event, or ask
        the assistant about a specific event, we fetch its description and guest names from Google at that moment to show them or answer, and
        we do not store those details separately. However, the assistant&apos;s replies, which may mention them, are saved in your
        conversation history like any other message, may be included in the summaries we keep of longer conversations, and may be saved in
        a note if you ask the assistant to remember something. We also keep the access tokens Google gives us, encrypted (AES-256-GCM), on our servers only; they are never
        shown in the app or written to logs.
      </p>
      <p>
        <strong>How we use it.</strong> Only to provide features you can see and use: showing your events in {brand.name}, finding free time,
        planning your day around your commitments, and, only when you approve each one, creating, rescheduling, editing or deleting events
        for you. Every change the assistant proposes is shown to you first. When a change affects an event with guests, Google may notify
        them, and we tell you before you approve.
      </p>
      <p>
        <strong>AI processing of calendar data.</strong> To answer your requests and plan your day, we send the relevant calendar details
        (for example titles, times and locations of upcoming events and, when you ask about a specific event, its description and guest
        names) to our AI provider, OpenAI, which processes them on our behalf as described in <a href="#ai">AI processing</a>.
      </p>
      <p>
        <strong>Disconnecting.</strong> When you disconnect Google Calendar, we ask Google to revoke {brand.name}&apos;s access, and we
        delete the stored tokens and every calendar event we copied, even if that request to Google fails. If it fails, {brand.name} may
        still appear in your Google Account&apos;s list of connected apps until you remove it there. Your events in Google Calendar itself are not affected. You can also remove{" "}
        {brand.name}&apos;s access at any time from your Google Account at{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>; when we learn access was revoked, we stop
        syncing and ask you to reconnect. Disconnecting Google Calendar does not delete your {brand.name} account; deleting your account (see{" "}
        <a href="#retention">Retention and deletion</a>) also disconnects Google Calendar.
      </p>
      <p id="limited-use">
        <strong>Google API Services User Data Policy.</strong> {brand.name}&apos;s use and transfer to any other app of information received
        from Google APIs will adhere to the <a href={GOOGLE_USER_DATA_POLICY}>Google API Services User Data Policy</a>, including the Limited
        Use requirements. In particular:
      </p>
      <ul>
        <li>we use Google user data only to provide and improve the user-facing calendar features described above;</li>
        <li>we do not use it for advertising, and we do not sell it;</li>
        <li>
          we transfer it only to the service providers listed in this policy that help us provide these features, as necessary to provide
          them, for security, or to comply with the law;
        </li>
        <li>
          no person at {brand.name} reads it unless you ask us to (for example in a support request), it is needed for security or to
          investigate abuse, or the law requires it;
        </li>
        <li>we do not use it to develop, improve or train generalized AI or machine-learning models.</li>
      </ul>

      <h2 id="health">Activity and sleep data (optional)</h2>
      <p>
        Our companion mobile app can read data from Apple Health (iPhone) or Health Connect (Android), only after you grant permission on your
        device. It reads, and sends to {brand.name}: daily steps, active energy, distance and sleep time, and summaries of workouts (type,
        start and end time, active energy and distance). It does not read heart rate, locations or routes, or clinical records, and it never
        writes to Apple Health or Health Connect.
      </p>
      <p>
        We use this data only to give you context in planning (for example, suggesting a lighter morning after a short night). The assistant
        retrieves it only when your request needs it, and it is not medical advice. Data received from Apple Health is not used for
        advertising or sold. You can change what is shared in your device&apos;s settings, and disconnecting the source deletes the activity
        data we stored from it.
      </p>

      <h2 id="use">How we use information</h2>
      <ul>
        <li>To provide the service: personalized planning, reminders, check-ins, weekly reviews and assistant replies.</li>
        <li>To send the texts and emails you have turned on, and to process your replies.</li>
        <li>To keep the service secure, prevent abuse, and understand and control our operating costs.</li>
        <li>To respond to your requests and communicate with you about your account and changes to the service.</li>
      </ul>
      <p>
        We do not sell your personal information, we do not share it for cross-context behavioral advertising, and we do not send marketing
        emails. If we ever want to send marketing messages, we will ask for your separate consent first.
      </p>

      <h2 id="ai">AI processing</h2>
      <p>
        To generate replies, plans and summaries, we send the relevant information from your account (for example your goals, schedule,
        today&apos;s tasks, recent messages and, if connected, calendar and activity data) to OpenAI, which processes it on our behalf. We
        send these requests with the API&apos;s storage option turned off, so OpenAI doesn&apos;t keep the responses for us to retrieve later,
        and your conversation history is kept in our database. That setting doesn&apos;t by itself stop OpenAI from keeping data: OpenAI may
        retain API inputs and outputs for a limited time, for example to monitor abuse, under its own policies. OpenAI&apos;s API terms state that it does not use API data
        to train its models unless the customer chooses to share it, and we do not use your information to train AI models. AI output can be wrong; see our <Link href="/terms">Terms of Service</Link>
        .
      </p>

      <h2 id="legal-bases">Legal bases</h2>
      <p>Where the law requires a legal basis for using personal information (for example in the EEA and the UK), we rely on:</p>
      <ul>
        <li>
          <strong>Providing the service you asked for</strong> (performance of a contract): your account, goals, planning and assistant
          replies.
        </li>
        <li>
          <strong>Your consent:</strong> text messages, email check-ins, Google Calendar, and activity and sleep data. You can withdraw
          consent at any time (see <a href="#rights">Your choices and rights</a>); this does not affect processing that already happened.
        </li>
        <li>
          <strong>Our legitimate interests:</strong> keeping the service secure, preventing abuse and controlling costs, balanced against
          your rights.
        </li>
        <li>
          <strong>Legal obligations:</strong> where the law requires us to keep or disclose information.
        </li>
      </ul>

      <h2 id="providers">Service providers</h2>
      <p>We share information only with providers that help us run the service, and only as needed for that purpose:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: database hosting and authentication.
        </li>
        <li>
          <strong>Vercel</strong>: website hosting and server logs.
        </li>
        <li>
          <strong>OpenAI</strong>: AI responses.
        </li>
        <li>
          <strong>Twilio</strong>: sending and receiving text messages and verifying your number (only if you add a phone number).
        </li>
        <li>
          <strong>Resend</strong>: sending and receiving email check-ins (only if you turn them on).
        </li>
        <li>
          <strong>Google</strong>: if you connect Google Calendar, we exchange your calendar events with Google to show and update them.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law, or to protect the rights and safety of our users or others. If {brand.name} is
        involved in a merger, acquisition or sale of assets, information may be transferred as part of that transaction, subject to this
        policy.
      </p>

      <h2 id="sms">Text messages</h2>
      <p>
        We only text you if you add your number and check the consent box. Our texts are sent under the name &ldquo;{brand.smsBrandName}&rdquo;.
        Message frequency varies. Message and data rates may apply. Reply
        STOP to opt out at any time, or HELP for help; you can also turn texts off in Settings.{" "}
        <strong>
          We do not share or sell your mobile number or text-message opt-in information with third parties or affiliates for their marketing
          or promotional purposes.
        </strong>
      </p>

      <h2 id="email">Email check-ins</h2>
      <p>
        Email check-ins are off until you turn them on in Settings. Every check-in email has a link to turn them off, and you can turn them
        off in Settings at any time. Account emails (for example confirming your address or resetting your password) are sent when you ask
        for them.
      </p>

      <h2 id="demo">Interactive demo</h2>
      <p>
        The demo at <Link href="/demo">/demo</Link> creates a temporary, anonymous account with sample data. It doesn&apos;t ask for your email
        or phone number. Demo accounts may be deleted at any time.
      </p>

      <h2 id="retention">Retention and deletion</h2>
      <p>
        We keep your information for as long as your account exists, except calendar copies, which are limited as described above. You can
        permanently delete your account at any time in <strong>Settings → Privacy &amp; data</strong>. Deleting your account removes from our
        database, at that moment:
      </p>
      <ul>
        {DELETED_DATA.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        Copies may remain in our providers&apos; backups for a limited period before they are overwritten, and our providers (for example
        Twilio&apos;s message logs and Resend&apos;s email logs) keep data according to their own policies. Texts or emails sent to us that
        don&apos;t match any account are kept in our message logs to operate and protect the service. For other ways to manage your data, see{" "}
        <Link href="/privacy-requests">Data Deletion &amp; Privacy Requests</Link>.
      </p>

      <h2 id="security">Security</h2>
      <p>
        Data is encrypted in transit. Each account&apos;s data is isolated at the database level so users can only access their own records,
        third-party access tokens are encrypted, and our secret keys are only used on our servers. No method of transmission or storage is
        completely secure, but we work to protect your information. Please report security concerns to {contact}.
      </p>

      <h2 id="transfers">International transfers</h2>
      <p>
        Our service providers may process information in the United States and other countries where they or their subprocessors operate,
        which may have different data-protection laws from where you live. Where the law requires it, we rely on appropriate safeguards for
        these transfers, such as the providers&apos; standard contractual clauses.
      </p>

      <h2 id="rights">Your choices and rights</h2>
      <ul>
        <li>View and edit most of your information directly in the app.</li>
        <li>Disconnect Google Calendar, or your activity source, in Settings at any time.</li>
        <li>Turn off texts (reply STOP, or in Settings) and email check-ins (the link in any check-in email, or in Settings).</li>
        <li>Delete your account and data in Settings.</li>
        <li>
          Ask for a copy of your data, a correction, deletion, or a restriction of or objection to how we use it, by emailing {contact}.
          Depending on where you live (for example in the EEA, the UK or certain US states), you may have these and other rights under local
          law, including the right to complain to your data-protection authority. We will not discriminate against you for using them.
        </li>
      </ul>
      <p>
        See <Link href="/privacy-requests">Data Deletion &amp; Privacy Requests</Link> for step-by-step instructions.
      </p>

      <h2 id="children">Children</h2>
      <p>
        {brand.name} is not intended for children. You must be at least {legal.minimumAge}, or older if the law where you live requires it to
        use a service like this without a parent&apos;s permission. We do not knowingly collect information from children below these ages.
        If you believe a child has given us information, contact us at {contact} and we will delete it.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We may update this policy. The date at the top shows when it last changed. If we make significant changes, we will let you know in
        the app or by email before they take effect.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        {legal.entityName}
        {legal.postalAddress ? `, ${legal.postalAddress}` : ""} — {contact}
      </p>
    </>
  );
}
