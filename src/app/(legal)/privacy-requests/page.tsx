import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { DELETE_CONFIRMATION, DELETED_DATA } from "@/lib/account/deletion";

export const metadata: Metadata = {
  title: "Data Deletion & Privacy Requests",
  description: `How to delete your ${brand.name} account, disconnect Google Calendar, stop messages, and make privacy requests.`,
  alternates: { canonical: "/privacy-requests" },
};

/** Step-by-step self-service for every data choice the app supports, then the email route for the rest. */
export default function PrivacyRequestsPage() {
  const { legal } = brand;
  const contact = <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Data Deletion &amp; Privacy Requests</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>
      <p>
        Most choices about your data take effect straight away in the app. This page explains each one, and how to ask us for anything the
        app doesn&apos;t do for you.
      </p>

      <h2 id="delete-account">Delete your account and data</h2>
      <ol className="mt-3 list-decimal pl-5 text-foreground/85 [&_li]:mt-1.5">
        <li>
          Log in and open <strong>Settings → Privacy &amp; data</strong>.
        </li>
        <li>
          Choose <strong>Delete account…</strong>, type <strong>{DELETE_CONFIRMATION}</strong>, and enter your password.
        </li>
        <li>
          Choose <strong>Delete my account</strong>.
        </li>
      </ol>
      <p>This permanently deletes, at that moment:</p>
      <ul>
        {DELETED_DATA.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        It can&apos;t be undone. Copies may remain for a limited period in our providers&apos; backups and logs, as described in our{" "}
        <Link href="/privacy#retention">Privacy Policy</Link>. If you can&apos;t log in, email us from the address on your account and we will
        help.
      </p>

      <h2 id="google-calendar">Disconnect Google Calendar (keep your account)</h2>
      <p>
        Open <strong>Settings → Integrations</strong> and choose <strong>Disconnect</strong> next to Google Calendar. We ask Google to
        revoke our access, and we delete the stored access tokens and every calendar event we copied, even if that request to Google
        fails. Your account and everything else stay as they are,
        and nothing changes in Google Calendar itself. To be sure our access is gone, check or remove it in your Google Account at{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>

      <h2 id="activity">Disconnect Apple Health or Health Connect</h2>
      <p>
        In <strong>Settings</strong>, choose <strong>Disconnect</strong> next to your activity source. This deletes the activity and sleep data
        we stored from it. You can also change what is shared in your phone&apos;s Health or Health Connect settings.
      </p>

      <h2 id="messages">Stop texts and emails</h2>
      <ul>
        <li>
          <strong>Texts:</strong> reply <strong>STOP</strong> to any message, or turn texts off in <strong>Settings</strong>.
        </li>
        <li>
          <strong>Email check-ins:</strong> use the link at the bottom of any check-in email, or turn them off in <strong>Settings</strong>.
        </li>
        <li>We do not send marketing emails.</li>
      </ul>

      <h2 id="consent">Withdraw consent</h2>
      <p>
        Texts, email check-ins, Google Calendar and activity data are each based on your consent. Turning one off or disconnecting it
        withdraws that consent from then on.
      </p>

      <h2 id="requests">Other requests</h2>
      <p>
        To ask for a copy of your data, to correct or delete something you can&apos;t change in the app, or to restrict or object to how we
        use it, email {contact} from the address on your account, and include:
      </p>
      <ul>
        <li>what you are asking for;</li>
        <li>the email address of your {brand.name} account.</li>
      </ul>
      <p>
        To protect your account, we may need to confirm the request comes from you before acting on it. We never ask for your password by
        email. If someone is making a request on your behalf, we will ask for proof that they are authorized.
      </p>

      <h2>Questions or support</h2>
      <p>
        For anything else, contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </>
  );
}
