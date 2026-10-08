/** Types for the test-only mock Responses API (scripts/mock-openai.mjs). */
export interface MockRequest {
  kind: "chat" | "chat:final" | "plan" | "structured" | "other";
  stream: boolean;
  lastUser: string;
  userMessages: number;
  dialogue: number;
  inputChars: number;
  contextChars: number;
  context: string;
  system: string[];
  appGuidance: boolean;
  focus: string | null;
  tools: number;
  call: { name: string; args: Record<string, unknown> } | null;
  toolOutputs: { call_id: string; status: string; message: string; error?: string }[];
  reply: string | null;
}

export interface MockOpenAI {
  requests: MockRequest[];
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
  reset(): void;
  script(s: { lie?: boolean; status?: number }): void;
}

export function createMockOpenAI(): MockOpenAI;
export function parseContext(ctx: string): unknown;
