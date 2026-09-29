/**
 * Map Supabase Auth errors to user-facing messages, and log the real cause
 * server-side. Matching is by Supabase's error `code` first, falling back to
 * status/message for errors that have no code (e.g. 500s, invalid API key,
 * network failures).
 */
export interface AuthErrorLike {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}

export function friendlyAuthError(error: AuthErrorLike): string {
  const m = error.message.toLowerCase();
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match. Try again or reset your password.";
    case "email_not_confirmed":
      return "Please confirm your email first — check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try logging in.";
    case "email_address_invalid":
      return "That email address can't be used to sign up. Please use a different one.";
    case "email_address_not_authorized":
      return "We couldn't send a confirmation email to that address. Please use a different one or try again later.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "New sign-ups are currently disabled.";
    case "weak_password":
      return "Please choose a stronger password.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again or reset your password.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Try logging in.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("sending confirmation email") || m.includes("sending recovery email")) {
    return "We couldn't send the confirmation email. Please try again later.";
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return "We couldn't reach the sign-in service. Please try again in a moment.";
  }
  return "Something went wrong. Please try again.";
}

/** Server-side log with the real Supabase error; email addresses are redacted. */
export function logAuthError(action: string, error: AuthErrorLike) {
  console.error(`[auth] ${action} failed`, {
    status: error.status,
    code: error.code,
    name: error.name,
    message: error.message.replace(/[^\s"'<>]+@[^\s"'<>]+/g, "<email>").slice(0, 300),
  });
}
