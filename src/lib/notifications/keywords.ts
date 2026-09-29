/**
 * Carrier-standard SMS keywords. Twilio also handles these at the messaging
 * service level; we mirror opt-outs in our own database so we never try to
 * message someone who replied STOP.
 */
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START = new Set(["START", "YES", "UNSTOP", "OPTIN"]);
const HELP = new Set(["HELP", "INFO"]);

export type SmsKeyword = "stop" | "start" | "help" | null;

export function detectKeyword(body: string): SmsKeyword {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP.has(word)) return "stop";
  if (START.has(word)) return "start";
  if (HELP.has(word)) return "help";
  return null;
}
