import { NextResponse, type NextRequest } from "next/server";
import { brand } from "@/config/brand";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turn email check-ins off from the link in an email's footer (and the
 * List-Unsubscribe header). GET only shows a confirmation button — link
 * scanners prefetch GETs, so only POST changes anything. POST also serves
 * RFC 8058 one-click unsubscribe from mail clients.
 * The token is the email's random reply token; it identifies nothing else.
 */
const TOKEN = /^[0-9a-f]{40}$/;

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} · ${brand.name}</title>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f}@media (prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}}main{max-width:440px;margin:12vh auto;padding:0 16px}button{font:inherit;font-weight:600;padding:10px 18px;border-radius:999px;border:0;background:#0a84ff;color:#fff;cursor:pointer}a{color:#0a84ff}</style></head>
<body><main><h1 style="font-size:24px;margin:0 0 12px">${title}</h1>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  if (!TOKEN.test(t)) return page("Link not valid", `<p>You can turn email check-ins off anytime in <a href="/settings#email-checkins">Settings</a>.</p>`, 400);
  return page(
    "Turn off email check-ins?",
    `<p>${brand.name} will stop checking in by email. You can turn it back on in Settings.</p><form method="post" action="/api/email/unsubscribe?t=${t}"><button type="submit">Turn off email check-ins</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  const admin = createAdminClient();
  if (TOKEN.test(t) && admin) {
    const { data: row } = await admin.from("email_outbound").select("user_id").eq("reply_token", t).maybeSingle();
    if (row) await admin.from("notification_preferences").update({ email_enabled: false }).eq("user_id", row.user_id);
  }
  // Same answer whether or not the token matched: it reveals nothing.
  return page("Email check-ins are off", `<p>You won't get check-in emails anymore. Turn them back on anytime in <a href="/settings#email-checkins">Settings</a>.</p>`);
}
