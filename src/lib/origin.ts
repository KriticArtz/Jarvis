import "server-only";
import { headers } from "next/headers";
import { appUrl } from "@/lib/env";

/** Absolute site origin for auth email redirect links. */
export async function siteOrigin(): Promise<string> {
  const configured = appUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
