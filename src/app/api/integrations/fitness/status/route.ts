import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateNativeRequest, readJson } from "@/lib/integrations/native-auth";
import { fitnessStatus, reportFitnessIssue } from "@/lib/integrations/fitness/store";
import { fitnessProviderSchema } from "@/lib/integrations/fitness/schema";
import { FITNESS_ISSUES } from "@/lib/integrations/fitness/status";

/**
 * Native apps read their connection status here (GET) and report a problem
 * they can't fix silently (POST), e.g. the user removed the health permission
 * in iOS Settings / Health Connect. The user always comes from the bearer
 * token; responses never contain health data.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateNativeRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  const sources = await fitnessStatus(admin, auth.userId);
  if (!sources) return NextResponse.json({ error: "Could not load status" }, { status: 500 });
  return NextResponse.json({ sources }, { headers: { "Cache-Control": "no-store" } });
}

const reportSchema = z.object({ provider: fitnessProviderSchema, issue: z.enum(FITNESS_ISSUES) }).strict();

export async function POST(request: NextRequest) {
  const auth = await authenticateNativeRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  const json = await readJson(request, 4096);
  if (!json.ok) return NextResponse.json({ error: "Bad request" }, { status: json.status });
  const parsed = reportSchema.safeParse(json.body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  const res = await reportFitnessIssue(admin, auth.userId, parsed.data.provider, parsed.data.issue);
  if (!res.ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  if (!res.found) return NextResponse.json({ error: "Not connected" }, { status: 404 });
  return NextResponse.json({ reported: true });
}
