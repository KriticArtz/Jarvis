import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Authenticate a native app request: `Authorization: Bearer <Supabase access
 * token>` from the signed-in user in the iOS/Android app. The token is
 * verified by Supabase Auth; the user id comes only from it — never from the
 * request body. Demo (anonymous) users are refused.
 */
export async function authenticateNativeRequest(request: NextRequest): Promise<{ userId: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  const client = createClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user || data.user.is_anonymous) return null;
  return { userId: data.user.id };
}

/** Parse a JSON body with a hard size limit. */
export async function readJson(request: NextRequest, maxBytes = 256 * 1024): Promise<{ ok: true; body: unknown } | { ok: false; status: 400 | 413 }> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}
