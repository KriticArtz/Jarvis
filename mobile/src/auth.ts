import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * Sign-in with the user's existing Jarvis account (same Supabase project as
 * the web app). The session lives in the iOS Keychain / Android Keystore via
 * expo-secure-store — never in plain storage. SecureStore values are limited
 * in size, so the session is stored in chunks.
 */
const CHUNK = 1800;

const secureStorage: SupportedStorage = {
  async getItem(key) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p == null) ? null : parts.join("");
  },
  async setItem(key, value) {
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(config.supabaseUrl || "https://invalid.local", config.supabasePublishableKey || "missing", {
  auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return { ok: false, error: "That email and password didn't match." };
  return { ok: true };
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** A current access token for the Jarvis API (refreshed when needed), or null when signed out. */
export async function accessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
