/** Types for the test-only mock Google OAuth + Calendar API (scripts/mock-google.mjs). */
export const CLIENT_ID: string;
export const CLIENT_SECRET: string;

export interface MockGoogleState {
  consent: { email: string; decision: "allow" | "deny" | "no_scope"; scope: string };
  calendars: Map<string, unknown[]>;
  calls: { authorize: number; exchange: number; refresh: number; revoke: number; list: number };
  revoked: string[];
}

export interface MockGoogle {
  state: MockGoogleState;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
}

export function createMockGoogle(): MockGoogle;
