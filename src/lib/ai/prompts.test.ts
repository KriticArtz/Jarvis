import { describe, expect, it } from "vitest";
import { assistantSystemPrompt } from "./prompts";

const persona = { name: "Jarvis", personality: "direct" as const };

describe("assistant prompts by channel", () => {
  // SMS and email prompts are pinned: app-only guidance must never change them.
  it("keeps the SMS and email prompts exactly as they were", () => {
    for (const tools of [true, false]) {
      expect(assistantSystemPrompt(persona, "sms", { tools })).toMatchSnapshot(`sms tools=${tools}`);
      expect(assistantSystemPrompt(persona, "email", { tools })).toMatchSnapshot(`email tools=${tools}`);
    }
  });
});
