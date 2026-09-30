import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateNativeRequest, readJson } from "@/lib/integrations/native-auth";
import { ingestFitness } from "@/lib/integrations/fitness/store";
import { fitnessSyncSchema } from "@/lib/integrations/fitness/schema";

/**
 * Native apps submit normalized fitness data (daily aggregates + workout
 * summaries). Idempotent: re-sending the same days/workouts updates in place.
 * See docs/integrations.md for the payload.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateNativeRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  const json = await readJson(request);
  if (!json.ok) return NextResponse.json({ error: json.status === 413 ? "Payload too large" : "Bad request" }, { status: json.status });
  const parsed = fitnessSyncSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const res = await ingestFitness(admin, auth.userId, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.reason === "not_connected" ? "Connect this provider first" : "Could not save" }, { status: res.reason === "not_connected" ? 409 : 500 });
  return NextResponse.json(res);
}
