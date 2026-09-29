"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { resetDemoAccount, seedDemoAccount } from "@/lib/demo/seed";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time";
import { errorInfo, logError } from "@/lib/observability/log";

export interface DemoState {
  error?: string;
}

const DEFAULT_NAME = "Alex";

function demoOptions(formData: FormData) {
  const name = z.string().trim().max(40).safeParse(formData.get("name"));
  const tz = String(formData.get("timezone") ?? "");
  return {
    name: name.success && name.data ? name.data : DEFAULT_NAME,
    timezone: tz && isValidTimeZone(tz) ? tz : "America/New_York",
  };
}

/**
 * Start a demo: sign in as a brand-new Supabase *anonymous* user and seed it
 * with sample data. A real signed-in user is signed out first, so demo
 * activity can never touch a real account.
 */
export async function startDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  const supabase = await createClient();
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims?.sub) await supabase.auth.signOut();

  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { demo: true } } });
  if (error || !data.user) {
    logError("demo", "anonymous sign-in failed", { status: error?.status, code: error?.code, message: error?.message });
    return {
      error:
        error?.code === "anonymous_provider_disabled"
          ? "The demo isn't enabled on this server yet (Supabase anonymous sign-ins are off)."
          : "We couldn't start the demo right now. Please try again in a moment.",
    };
  }

  try {
    await seedDemoAccount(supabase, data.user.id, demoOptions(formData));
  } catch (err) {
    logError("demo", "seeding failed", errorInfo(err));
    return { error: "We couldn't set up the demo data. Please try again." };
  }
  redirect("/dashboard");
}

/** Restore the demo account to its original sample state. Demo sessions only. */
export async function resetDemo(): Promise<DemoState> {
  const session = await getSessionUser();
  if (!session?.isDemo) return { error: "Reset is only available in the demo." };
  const { data: profile } = await session.supabase.from("profiles").select("display_name, timezone").eq("id", session.userId).single();
  try {
    await resetDemoAccount(session.supabase, session.userId, {
      name: profile?.display_name || DEFAULT_NAME,
      timezone: profile?.timezone || "America/New_York",
    });
  } catch (err) {
    logError("demo", "reset failed", errorInfo(err));
    return { error: "Reset failed. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Leave the demo (the anonymous session is discarded) and go to real signup. */
export async function exitDemoToSignup() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/signup");
}
