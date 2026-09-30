#!/usr/bin/env node
/**
 * Send a correctly signed fake Twilio "incoming SMS" webhook to your server —
 * handy for rehearsing the SMS flow without texting from a phone.
 *
 * Usage:
 *   node scripts/simulate-inbound-sms.mjs "+15551234567" "What should I focus on tonight?"
 *
 * Reads TWILIO_AUTH_TOKEN from the environment or .env.local. Posts to
 * WEBHOOK_URL (default http://localhost:3000/api/sms/inbound). The signature is
 * computed over WEBHOOK_URL, so it must match what the server expects (by
 * default the server accepts the URL it was called on).
 * The "From" number must be the phone saved (with SMS consent) on a Jarvis account.
 */
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local — rely on the environment
  }
}
loadEnvLocal();

const [from, body] = process.argv.slice(2);
if (!from || !body) {
  console.error('Usage: node scripts/simulate-inbound-sms.mjs "+15551234567" "message text"');
  process.exit(1);
}
const token = process.env.TWILIO_AUTH_TOKEN;
if (!token) {
  console.error("TWILIO_AUTH_TOKEN is not set (env or .env.local).");
  process.exit(1);
}
const url = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/sms/inbound";
const params = {
  MessageSid: `SMsim${randomBytes(12).toString("hex")}`,
  AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "ACsimulated",
  From: from,
  To: process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_FROM_NUMBER ?? "+10000000000",
  Body: body,
  NumMedia: "0",
};
const data = Object.keys(params)
  .sort()
  .reduce((acc, k) => acc + k + params[k], url);
const signature = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature },
  body: new URLSearchParams(params),
});
console.log(`${res.status} ${res.statusText}`);
console.log(await res.text());
console.log("The reply is generated in the background — watch the server log, Settings → Recent messages, or your phone.");
