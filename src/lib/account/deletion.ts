/**
 * Account deletion rules (pure, unit-tested). The confirmation phrase must be
 * typed exactly, and email/password users must re-enter their password.
 */
export const DELETE_CONFIRMATION = "DELETE";

export function validateDeletionRequest(input: { confirmation: string; password: string; requiresPassword: boolean }): string | null {
  if (input.confirmation.trim() !== DELETE_CONFIRMATION) return `Type ${DELETE_CONFIRMATION} to confirm.`;
  if (input.requiresPassword && !input.password) return "Enter your password to confirm it's you.";
  return null;
}

/** Everything removed when an account is deleted (shown to the user and in the Privacy Policy). */
export const DELETED_DATA = [
  "Your profile, schedule and preferences",
  "Goals, progress history, tasks and daily plans",
  "Check-ins, weekly reviews and assistant notes",
  "All conversations with your assistant, including text messages",
  "Phone number, SMS consent and message history",
  "AI usage records",
  "Connected calendars and fitness sources, their synced events and activity data (Google access is revoked)",
];
