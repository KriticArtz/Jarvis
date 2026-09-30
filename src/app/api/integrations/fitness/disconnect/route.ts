import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateNativeRequest, readJson } from "@/lib/integrations/native-auth";
import { disconnectFitness } from "@/lib/integrations/fitness/store";
import { fitnessProviderSchema } from "@/lib/integrations/fitness/schema";

/** Disconnect a fitness source from the native app. Deletes all of its stored data. */
export async function POST(request: NextRequest) {
  const auth = await authenticateNativeRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  const json = await readJson(request, 4096);
  if (!json.ok) return NextResponse.json({ error: "Bad request" }, { status: json.status });
  const parsed = z.object({ provider: fitnessProviderSchema }).strict().safeParse(json.body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  const res = await disconnectFitness(admin, auth.userId, parsed.data.provider);
  return res.ok ? NextResponse.json({ disconnected: true }) : NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
}
