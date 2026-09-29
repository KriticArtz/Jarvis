/**
 * Phone verification providers.
 *
 * Only the local `test` provider exists today (development only). A production
 * provider — Twilio Verify — slots in by implementing this interface:
 *   start(): POST https://verify.twilio.com/v2/Services/{VerifyServiceSid}/Verifications
 *            (To=<phone>, Channel=sms) → return { providerRef: sid }
 *   check(): POST …/VerificationCheck (To, Code) → approved | pending
 * and storing provider = 'twilio_verify' (already allowed by the schema).
 * It would add TWILIO_VERIFY_SERVICE_SID and a PHONE_VERIFICATION_MODE value.
 */
export interface StartResult {
  /** Code to store as a hash (providers that generate codes locally). */
  code: string | null;
  /** Provider-side reference (e.g. a Twilio Verify SID). */
  providerRef: string | null;
  /** Shown to the user in development only (test provider). */
  devCode: string | null;
}

export interface PhoneVerificationProvider {
  readonly name: "test" | "twilio_verify";
  start(phone: string): Promise<StartResult>;
}

/** Development-only provider: generates the code locally and shows it on screen. */
export class TestVerificationProvider implements PhoneVerificationProvider {
  readonly name = "test" as const;
  constructor(private readonly generate: () => string) {}
  async start(phone: string): Promise<StartResult> {
    void phone;
    const code = this.generate();
    return { code, providerRef: null, devCode: code };
  }
}
