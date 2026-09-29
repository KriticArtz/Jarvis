import { brand } from "@/config/brand";
import type { AccountabilityStyle } from "@/lib/types/domain";
import { formatTime12 } from "@/lib/time";

/**
 * Outbound message copy. Every message identifies the sender and the first
 * message in a thread would normally include opt-out instructions (added by
 * the service for consent confirmations).
 */
export function morningMessage(name: string | null, style: AccountabilityStyle): string {
  const hi = name ? `Good morning, ${name}!` : "Good morning!";
  switch (style) {
    case "direct":
      return `${hi} What's the #1 thing you'll get done today? Reply with it.`;
    case "gentle":
      return `${hi} What's one thing you'd like to accomplish today? Just reply here.`;
    default:
      return `${hi} What's the #1 thing you want to accomplish today?`;
  }
}

export function taskReminderMessage(taskTitle: string, startTime: string, style: AccountabilityStyle): string {
  const at = formatTime12(startTime);
  switch (style) {
    case "direct":
      return `You planned "${taskTitle}" at ${at}. Still happening? Reply YES or tell me what changed.`;
    case "gentle":
      return `Quick nudge: "${taskTitle}" is planned for ${at}. Still feel doable? No stress if plans changed.`;
    default:
      return `You planned "${taskTitle}" at ${at}. Still happening?`;
  }
}

export function eveningMessage(completed: number, planned: number, style: AccountabilityStyle): string {
  const tally = planned > 0 ? ` You've checked off ${completed} of ${planned} tasks so far.` : "";
  switch (style) {
    case "direct":
      return `End of day check-in.${tally} What got done and what didn't? Reply and I'll log it.`;
    case "gentle":
      return `How'd today go?${tally} Whatever happened, let's check off what you accomplished.`;
    default:
      return `How'd today go?${tally} Let's check off what you accomplished.`;
  }
}

export function consentConfirmationMessage(): string {
  return `${brand.name}: You're set up for accountability texts. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.`;
}

export function helpMessage(): string {
  return `${brand.name} accountability texts. Reply to chat with your assistant. Reply STOP to opt out. Support: ${brand.supportEmail}`;
}

export function stopConfirmationMessage(): string {
  return `${brand.name}: You've been unsubscribed and won't receive more texts. Reply START to resubscribe.`;
}
