import { brand } from "@/config/brand";
import type { AssistantPersona } from "@/lib/personalization";
import { formatTime12 } from "@/lib/time";

/**
 * Outbound message copy, worded for the user's chosen assistant name and
 * personality. Every message identifies the sender and the first
 * message in a thread would normally include opt-out instructions (added by
 * the service for consent confirmations).
 */
export function morningMessage(name: string | null, persona: AssistantPersona): string {
  const hi = name ? `Good morning, ${name}!` : "Good morning!";
  const me = `It's ${persona.name}.`;
  switch (persona.personality) {
    case "direct":
      return `${hi} ${me} What's the #1 thing you'll get done today? Reply with it.`;
    case "motivational":
      return `${hi} ${me} New day, new wins. What's the #1 thing you're crushing today?`;
    case "tough_love":
      return `${hi} ${me} No drifting today. What's the #1 thing you're committing to? Reply with it.`;
    case "professional":
      return `${hi} ${me} What's your top priority for today?`;
    default:
      return `${hi} ${me} What's the #1 thing you'd like to accomplish today? Just reply here.`;
  }
}

export function taskReminderMessage(taskTitle: string, startTime: string, persona: AssistantPersona): string {
  const at = formatTime12(startTime);
  switch (persona.personality) {
    case "direct":
      return `You planned "${taskTitle}" at ${at}. Still happening? Reply YES or tell me what changed.`;
    case "motivational":
      return `"${taskTitle}" is up at ${at} — you've got this! Still on?`;
    case "tough_love":
      return `"${taskTitle}" is at ${at}. You committed to it. Still happening? If not, tell me when.`;
    case "professional":
      return `Reminder: "${taskTitle}" is scheduled for ${at}. Still on schedule?`;
    default:
      return `You planned "${taskTitle}" at ${at}. Still happening?`;
  }
}

export function eveningMessage(completed: number, planned: number, persona: AssistantPersona): string {
  const tally = planned > 0 ? ` You've checked off ${completed} of ${planned} tasks so far.` : "";
  const me = `${persona.name} here.`;
  switch (persona.personality) {
    case "direct":
      return `${me} End of day check-in.${tally} What got done and what didn't? Reply and I'll log it.`;
    case "motivational":
      return `${me} How'd today go?${tally} Tell me your wins and I'll log them!`;
    case "tough_love":
      return `${me} End of day.${tally} What got done, and what's your plan for what didn't?`;
    case "professional":
      return `${me} End-of-day check-in.${tally} Reply with what's done and I'll update your plan.`;
    default:
      return `${me} How'd today go?${tally} Whatever happened, let's check off what you accomplished.`;
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
