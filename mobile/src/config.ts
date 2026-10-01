/**
 * Public configuration, from EXPO_PUBLIC_* variables (see .env.example).
 * These are PUBLIC values (the web app ships the same Supabase URL and
 * publishable key to every browser). Never put a secret key here.
 */
export const config = {
  /** The Jarvis web app, e.g. https://your-domain — the native app calls its /api routes. */
  apiUrl: (process.env.EXPO_PUBLIC_JARVIS_API_URL ?? "").replace(/\/+$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export function configProblem(): string | null {
  if (!config.apiUrl || !config.supabaseUrl || !config.supabasePublishableKey) return "This build is missing its server configuration.";
  if (!/^https:\/\//.test(config.apiUrl) && !__DEV__) return "The Jarvis server address must use HTTPS.";
  return null;
}
