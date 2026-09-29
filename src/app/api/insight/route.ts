import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateInsight } from "@/lib/ai/insight";

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
    console.error("[insight] failed", (err as Error).message);
    return NextResponse.json({ error: "Couldn't load an insight right now." }, { status: 500 });
  }
}
