import "server-only";
import { randomBytes } from "node:crypto";
import type { DB } from "@/lib/data/db";
import { phoneVerificationMode, phoneVerificationSecret } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/observability/log";
import { CODE_TTL_MINUTES, MAX_ATTEMPTS, MAX_STARTS_PER_HOUR, evaluateCode, generateCode, hashCode, OUTCOME_MESSAGE, type VerificationRecord } from "./codes";
import { TestVerificationProvider, type PhoneVerificationProvider } from "./provider";

// Test mode only: a per-process fallback so local development works without
// extra setup (codes stop matching after a restart, which is fine locally).
let fallbackSecret: string | null = null;
function secret(): string {
  const configured = phoneVerificationSecret();
  if (configured) return configured;
  fallbackSecret ??= randomBytes(32).toString("hex");
  return fallbackSecret;
}

export function getVerificationProvider(): PhoneVerificationProvider | null {
  return phoneVerificationMode() === "test" ? new TestVerificationProvider(() => generateCode()) : null;
}

export type StartOutcome =
  | { ok: true; expiresInMinutes: number; devCode: string | null }
  | { ok: false; error: string };

/**
 * Start verifying the user's current phone number. `admin` must be the
 * service-role client: phone_verifications is server-only.
 */
export async function startPhoneVerification(admin: DB, userId: string): Promise<StartOutcome> {
  const provider = getVerificationProvider();
  if (!provider) return { ok: false, error: "Phone verification isn't available yet." };

  const { data: profile } = await admin.from("profiles").select("phone, phone_verified_at").eq("id", userId).single();
  if (!profile?.phone) return { ok: false, error: "Save a phone number first." };
  if (profile.phone_verified_at) return { ok: false, error: OUTCOME_MESSAGE.already_verified };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("phone_verifications").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((count ?? 0) >= MAX_STARTS_PER_HOUR) return { ok: false, error: "Too many codes requested. Please try again in an hour." };

  const started = await provider.start(profile.phone);
  const { error } = await admin.from("phone_verifications").insert({
    user_id: userId,
    phone: profile.phone,
    provider: provider.name,
    code_hash: started.code ? hashCode(secret(), userId, profile.phone, started.code) : null,
    provider_ref: started.providerRef,
    max_attempts: MAX_ATTEMPTS,
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    logWarn("verification", "could not store verification", { code: error.code });
    return { ok: false, error: "Couldn't start verification. Please try again." };
  }
  logInfo("verification", "started", { userId, provider: provider.name });
  return { ok: true, expiresInMinutes: CODE_TTL_MINUTES, devCode: started.devCode };
}

/** Check a code; on success marks profiles.phone_verified_at. */
export async function confirmPhoneVerification(admin: DB, userId: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!getVerificationProvider()) return { ok: false, error: "Phone verification isn't available yet." };
  const [{ data: profile }, { data: record }] = await Promise.all([
    admin.from("profiles").select("phone").eq("id", userId).single(),
    admin
      .from("phone_verifications")
      .select("id, phone, code_hash, attempts, max_attempts, expires_at, verified_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const outcome = evaluateCode({ record: record as VerificationRecord | null, currentPhone: profile?.phone ?? null, code, secret: secret(), userId });
  if (outcome === "verified") {
    const now = new Date().toISOString();
    await admin.from("phone_verifications").update({ verified_at: now }).eq("id", record!.id);
    // Only verify if the number hasn't changed in the meantime.
    await admin.from("profiles").update({ phone_verified_at: now }).eq("id", userId).eq("phone", record!.phone);
    logInfo("verification", "verified", { userId });
    return { ok: true };
  }
  if (outcome === "invalid_code" && record) {
    await admin.from("phone_verifications").update({ attempts: (record.attempts as number) + 1 }).eq("id", record.id);
  }
  return { ok: false, error: OUTCOME_MESSAGE[outcome] };
}
