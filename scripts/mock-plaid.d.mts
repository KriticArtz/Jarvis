/** Types for the test-only mock Plaid API (scripts/mock-plaid.mjs). */
export interface MockPlaid {
  calls: string[];
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
  /** The next API call fails with this Plaid error code. */
  fail(code: string): void;
  /** Adds one transaction and removes one for the item; returns their ids. */
  mutate(itemId: string): { removed: string; added: string };
}
export function createMockPlaid(): MockPlaid;
