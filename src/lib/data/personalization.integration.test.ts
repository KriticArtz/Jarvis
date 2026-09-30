/**
 * Personalization (assistant name, personality, theme) against a real
 * Supabase stack with real RLS. Run: npm run test:integration (needs
 * `supabase start`). Same env as actions.integration.test.ts; skips itself if
 * the stack isn't reachable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ASSISTANT_NAME, DEFAULT_PERSONALITY, DEFAULT_THEME } from "@/lib/personalization";
import { loadAssistantContext } from "@/lib/ai/context";
import { renderContext } from "@/lib/ai/context-format";
import { buildChatMessages } from "@/lib/ai/chat-messages";
import { resetDemoAccount, seedDemoAccount } from "@/lib/demo/seed";
import { getPersonalization, updatePersonalization } from "./personalization";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

type DB = SupabaseClient;
const DEFAULTS = { assistantName: DEFAULT_ASSISTANT_NAME, personality: DEFAULT_PERSONALITY, theme: DEFAULT_THEME };

let admin: DB;
const users: Record<"a" | "b", { id: string; db: DB }> = {} as never;

const client = () => createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });

async function makeUser(tag: string) {
  const email = `it-p-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = client();
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  if (signInError) throw signInError;
  await db.from("profiles").update({ timezone: "UTC", display_name: tag.toUpperCase(), onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, db };
}

describe.skipIf(!enabled)("personalization (real Supabase, RLS)", () => {
  beforeAll(async () => {
    admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
  });

  it("new and existing users without preferences get safe defaults", async () => {
    expect(await getPersonalization(users.a.db, users.a.id)).toEqual(DEFAULTS);
    const { data } = await users.a.db.from("profiles").select("assistant_name, assistant_personality, theme").eq("id", users.a.id).single();
    expect(data).toEqual({ assistant_name: null, assistant_personality: null, theme: null });
  });

  it("persists the assistant name, personality and theme", async () => {
    const res = await updatePersonalization(users.a.db, users.a.id, { assistant_name: "  Nova ", assistant_personality: "tough_love", theme: "violet" });
    expect(res).toEqual({ ok: true, personalization: { assistantName: "Nova", personality: "tough_love", theme: "violet" } });
    // A fresh client (new "device") sees the same values: stored on the account, not in the browser.
    const fresh = client();
    const { data: link } = await admin.auth.admin.getUserById(users.a.id);
    await fresh.auth.signInWithPassword({ email: link.user!.email!, password: "integration-pass-1" });
    expect(await getPersonalization(fresh, users.a.id)).toEqual({ assistantName: "Nova", personality: "tough_love", theme: "violet" });
  });

  it("partial updates only change the given field", async () => {
    await updatePersonalization(users.a.db, users.a.id, { theme: "midnight" });
    expect(await getPersonalization(users.a.db, users.a.id)).toEqual({ assistantName: "Nova", personality: "tough_love", theme: "midnight" });
  });

  it("rejects invalid values without writing anything", async () => {
    for (const bad of [{ theme: "neon" }, { assistant_personality: "sarcastic" }, { assistant_name: "" }, { assistant_name: "x".repeat(40) }, { assistant_name: "<script>" }, {}]) {
      expect(await updatePersonalization(users.a.db, users.a.id, bad)).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(await getPersonalization(users.a.db, users.a.id)).toEqual({ assistantName: "Nova", personality: "tough_love", theme: "midnight" });
  });

  it("the database enforces the allowed values too (even bypassing the app)", async () => {
    const { error: theme } = await users.a.db.from("profiles").update({ theme: "neon" }).eq("id", users.a.id);
    const { error: personality } = await users.a.db.from("profiles").update({ assistant_personality: "mean" }).eq("id", users.a.id);
    const { error: name } = await users.a.db.from("profiles").update({ assistant_name: " padded " }).eq("id", users.a.id);
    expect([theme?.code, personality?.code, name?.code]).toEqual(["23514", "23514", "23514"]);
  });

  it("isolates users: A can neither read nor change B's preferences", async () => {
    await updatePersonalization(users.b.db, users.b.id, { assistant_name: "Atlas", theme: "rose" });
    // A's session aimed at B's row: RLS matches no row, so nothing is written.
    expect(await updatePersonalization(users.a.db, users.b.id, { assistant_name: "Hacked", theme: "emerald" })).toEqual({ ok: false, reason: "server_error" });
    expect(await getPersonalization(users.a.db, users.b.id)).toEqual(DEFAULTS); // can't see B's row at all
    expect(await getPersonalization(users.b.db, users.b.id)).toEqual({ assistantName: "Atlas", personality: DEFAULT_PERSONALITY, theme: "rose" });
    // and B's changes didn't touch A
    expect((await getPersonalization(users.a.db, users.a.id)).assistantName).toBe("Nova");
  });

  it("the AI context and system prompt carry the user's assistant name and personality", async () => {
    const { context } = await loadAssistantContext(users.a.db, users.a.id);
    expect(context.assistant).toEqual({ name: "Nova", personality: "tough_love" });
    expect(renderContext(context)).toContain("Their assistant (you): Nova, personality: tough love");
    const messages = buildChatMessages({ context, channel: "sms", conversationSummary: null, history: [], tools: true });
    expect(messages[0].content).toContain("You are Nova");
    expect(messages[0].content).toContain("Tough love");

    const other = await loadAssistantContext(users.b.db, users.b.id);
    expect(other.context.assistant).toEqual({ name: "Atlas", personality: DEFAULT_PERSONALITY });
  });

  it("demo (anonymous) users get defaults, and a demo reset restores them", async () => {
    const demo = client();
    const { data, error } = await demo.auth.signInAnonymously();
    if (error) throw error;
    const id = data.user!.id;
    await seedDemoAccount(demo, id, { name: "Guest", timezone: "UTC" });
    expect(await getPersonalization(demo, id)).toEqual(DEFAULTS);
    expect((await loadAssistantContext(demo, id)).context.assistant).toEqual({ name: DEFAULT_ASSISTANT_NAME, personality: DEFAULT_PERSONALITY });

    await updatePersonalization(demo, id, { assistant_name: "Friday", theme: "warm" });
    expect((await getPersonalization(demo, id)).assistantName).toBe("Friday");
    await resetDemoAccount(demo, id, { name: "Guest", timezone: "UTC" });
    expect(await getPersonalization(demo, id)).toEqual(DEFAULTS);
  });
});
