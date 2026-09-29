import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { phoneVerificationMode, requirePhoneVerification, smsMode, supabaseServiceKey } from "@/lib/env";
import { getCommitments, getMemories, getNotificationPreferences } from "@/lib/data/queries";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import type { NotificationRecord } from "@/lib/types/domain";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { ProfileForm } from "@/components/settings/profile-form";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { CommitmentsEditor } from "@/components/schedule/commitments-editor";
import { StylePicker } from "@/components/settings/style-picker";
import { PhoneForm } from "@/components/settings/phone-form";
import { MemoriesEditor } from "@/components/settings/memories";
import { NotificationPrefsForm, SmsActions } from "@/components/settings/notification-settings";
import { DemoControls } from "@/components/demo/demo-controls";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PhoneVerification } from "@/components/settings/phone-verification";
import Link from "next/link";

export const metadata: Metadata = { title: "Settings" };

const MODE_COPY = {
  live: { label: "Live", tone: "success", body: "Texts are delivered through Twilio." },
  test: { label: "Test mode", tone: "warning", body: "Texting isn't connected yet. Messages are recorded below so you can see what would be sent, but nothing is delivered to your phone." },
  disabled: { label: "Off", tone: "neutral", body: "Text messaging is disabled on this server." },
} as const;

export default async function SettingsPage() {
  const { supabase, userId, email, profile, isDemo } = await requireOnboardedUser();
  const [commitments, prefs, memories, notifications] = await Promise.all([
    getCommitments(supabase, userId),
    getNotificationPreferences(supabase, userId),
    getMemories(supabase, userId, 50),
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);
  const mode = smsMode();
  const modeCopy = MODE_COPY[mode];
  const requireVerified = requirePhoneVerification();
  const verificationMode = phoneVerificationMode();
  const smsReady = canReceiveSms(profile, prefs, { requireVerified });
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(profile.timezone)) timezones.unshift(profile.timezone);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Profile" />
          <ProfileForm name={profile.display_name ?? ""} email={email ?? profile.email} timezone={profile.timezone} timezones={timezones} />
        </Card>

        <Card>
          <CardHeader title="Typical schedule" subtitle="Your assistant never plans over these." />
          <ScheduleForm profile={profile} />
          <div className="mt-6 border-t border-hairline pt-5">
            <h3 className="mb-3 text-sm font-semibold">Recurring commitments</h3>
            <CommitmentsEditor commitments={commitments} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Accountability style" />
          <StylePicker current={profile.accountability_style} />
        </Card>

        {isDemo ? (
          <Card id="sms">
            <CardHeader title="Text message check-ins" action={<Badge tone="accent">Your own account</Badge>} />
            <p className="text-[15px] leading-relaxed text-muted">
              In your own account, LifePilot texts you — a morning question, a nudge before something you planned, an evening wrap-up — and
              you can reply to it like a friend. Texting is turned off in this shared demo so no messages go to real phones.
            </p>
          </Card>
        ) : (
        <Card id="sms">
          <CardHeader
            title="Text message check-ins"
            subtitle={modeCopy.body}
            action={<Badge tone={modeCopy.tone}>{modeCopy.label}</Badge>}
          />
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-sm">
                Status:{" "}
                <span className="font-medium">
                  {smsReady ? "You're opted in." : prefs?.sms_opted_out_at ? "You opted out by replying STOP." : "Not opted in."}
                </span>
              </p>
              <PhoneForm phone={profile.phone} consented={Boolean(prefs?.sms_enabled && prefs.sms_consent_at)} />
              {profile.phone && (verificationMode !== "off" || requireVerified || profile.phone_verified_at) ? (
                <div className="mt-4">
                  <PhoneVerification verified={Boolean(profile.phone_verified_at)} mode={verificationMode} required={requireVerified} />
                </div>
              ) : null}
            </div>
            {prefs ? (
              <div className="border-t border-hairline pt-5">
                <h3 className="mb-3 text-sm font-semibold">What to send</h3>
                <NotificationPrefsForm prefs={prefs} />
              </div>
            ) : null}
            <div className="border-t border-hairline pt-5">
              <SmsActions canSend={smsReady && mode !== "disabled" && Boolean(supabaseServiceKey())} />
            </div>
            {notifications.data?.length ? (
              <div className="border-t border-hairline pt-5">
                <h3 className="mb-3 text-sm font-semibold">Recent messages</h3>
                <ul className="flex flex-col gap-2">
                  {(notifications.data as NotificationRecord[]).map((n) => (
                    <li key={n.id} className="rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>
                          {new Date(n.created_at).toLocaleString("en-US", { timeZone: profile.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <Badge tone={n.status === "sent" ? "success" : n.status === "failed" ? "danger" : "neutral"}>{n.status === "test" ? "test — not sent" : n.status}</Badge>
                      </div>
                      {n.body}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        )}

        <Card>
          <CardHeader title="Things your assistant should remember" subtitle="Short facts or preferences it will always take into account." />
          <MemoriesEditor memories={memories} />
        </Card>

        <Card id="privacy">
          <CardHeader title="Privacy & data" subtitle="How your information is handled, and how to delete it." />
          <p className="text-[15px] text-muted">
            Read our{" "}
            <Link href="/privacy" className="font-medium text-accent hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-medium text-accent hover:underline">
              Terms of Service
            </Link>
            .
          </p>
          {!isDemo ? (
            <div className="mt-5 border-t border-hairline pt-5">
              <DeleteAccount requiresPassword={Boolean(email ?? profile.email)} />
            </div>
          ) : null}
        </Card>

        {isDemo ? (
          <Card>
            <CardHeader title="Demo" subtitle="You're exploring LifePilot with sample data." />
            <DemoControls />
          </Card>
        ) : (
          <Card>
            <CardHeader title="Account" />
            <form action={signOut}>
              <SubmitButton variant="secondary" pendingText="Signing out…">
                Log out
              </SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
