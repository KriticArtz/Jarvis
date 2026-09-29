import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { DELETED_DATA } from "@/lib/account/deletion";

export const metadata: Metadata = { title: "Privacy Policy", description: `How ${brand.name} collects, uses and protects your information.` };

export default function PrivacyPage() {
  const { legal } = brand;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Privacy Policy</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>

      <p>
        This policy explains what information {brand.name} (&ldquo;we&rdquo;, operated by {legal.entityName}) collects when you use the
        {` ${brand.name}`} website, app and text-message service, how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> your email address and password. Passwords are handled by our authentication provider and
          stored only in hashed form.
        </li>
        <li>
          <strong>Information you give the app:</strong> your name, timezone, typical schedule and recurring commitments, accountability
          preference, goals, tasks, progress, daily plans, check-ins, weekly reviews, and notes you ask the assistant to remember.
        </li>
        <li>
          <strong>Conversations:</strong> messages you exchange with the assistant in the app and by text message.
        </li>
        <li>
          <strong>Phone and SMS information (optional):</strong> your mobile number, whether it has been verified, your SMS consent (the time
          and the exact wording you agreed to), opt-outs, and the text messages we send and receive.
        </li>
        <li>
          <strong>AI usage records:</strong> for each AI request, the feature used, the model, token counts, an estimated cost and timing.
          These records do not contain the content of your messages.
        </li>
        <li>
          <strong>Technical logs:</strong> limited server logs used to operate and secure the service. We remove email addresses, phone
          numbers and credentials from logs.
        </li>
        <li>
          <strong>Cookies:</strong> only the essential cookies needed to keep you signed in. We do not use advertising or third-party
          analytics cookies.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide the service: personalized planning, reminders, check-ins, weekly reviews and assistant replies.</li>
        <li>To send the text messages you have opted into, and to process your replies.</li>
        <li>To keep the service secure, prevent abuse, and understand and control our operating costs.</li>
        <li>To respond to your requests and communicate with you about your account.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use it for advertising.</p>

      <h2>AI processing</h2>
      <p>
        To generate replies, plans and summaries, we send the relevant information from your account (for example your goals, schedule,
        today&apos;s tasks and recent messages) to OpenAI, which processes it on our behalf. We send these requests with storage turned
        off, so conversation history is kept in our database rather than by OpenAI. OpenAI may retain API data for a limited time for abuse
        monitoring under its own policies. The assistant can make mistakes; see our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>Service providers</h2>
      <p>We share information only with providers that help us run the service, and only as needed for that purpose:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: database hosting and authentication.
        </li>
        <li>
          <strong>OpenAI</strong>: AI responses.
        </li>
        <li>
          <strong>Twilio</strong>: sending and receiving text messages (if you opt in).
        </li>
        <li>
          <strong>Vercel</strong>: website hosting and server logs.
        </li>
      </ul>
      <p>We may also disclose information if required by law or to protect the rights and safety of our users or others.</p>

      <h2>Text messages (SMS)</h2>
      <p>
        We only text you if you add your number and check the consent box. Message frequency varies. Message and data rates may apply. Reply
        STOP to opt out at any time, or HELP for help; you can also turn texts off in Settings.{" "}
        <strong>
          We do not share or sell your mobile number or SMS opt-in information with third parties or affiliates for their marketing or
          promotional purposes.
        </strong>
      </p>

      <h2>Interactive demo</h2>
      <p>
        The demo at <Link href="/demo">/demo</Link> creates a temporary, anonymous account with sample data. It doesn&apos;t ask for your email
        or phone number. Demo accounts may be deleted at any time.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your information for as long as your account exists. You can permanently delete your account at any time in{" "}
        <strong>Settings → Privacy &amp; data</strong>. Deleting your account immediately removes from our database:
      </p>
      <ul>
        {DELETED_DATA.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        Copies may remain in encrypted backups for a limited period before they are overwritten. Our service providers (for example
        Twilio&apos;s message logs) retain data according to their own policies.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Each account&apos;s data is isolated at the database level so users can only access their own records,
        and our secret keys are only used on our servers. No method of transmission or storage is completely secure, but we work to protect
        your information.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>View and edit most of your information directly in the app.</li>
        <li>Opt out of text messages by replying STOP or in Settings.</li>
        <li>Delete your account and data in Settings.</li>
        <li>
          Request a copy of your data, or ask any privacy question, by emailing{" "}
          <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>. Depending on where you live, you may have additional rights
          under local law.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        {brand.name} is not intended for children under {legal.minimumAge}, and we do not knowingly collect their information. If you believe
        a child has given us information, contact us and we will delete it.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy. If we make significant changes, we will let you know in the app or by email before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        {legal.entityName} — <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>
      </p>
    </>
  );
}
