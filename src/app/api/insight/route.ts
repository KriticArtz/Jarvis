import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateInsight } from "@/lib/ai/insight";
import { errorInfo, logError } from "@/lib/observability/log";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const insight = await getOrCreateInsight(session.supabase, session.userId, {
      refresh: request.nextUrl.searchParams.get("refresh") === "1",
    });
    return NextResponse.json(insight, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logError("insight", "failed", errorInfo(err));
    return NextResponse.json({ error: "Couldn't load an insight right now." }, { status: 500 });
  }
}
