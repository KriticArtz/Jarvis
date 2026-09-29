import { afterEach, describe, expect, it, vi } from "vitest";
import { errorInfo, log, redact, registerErrorReporter } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("redact", () => {
  it("removes emails, phone numbers, keys, bearer tokens and JWTs", () => {
    const out = redact(
      "user a.b@example.com from +15551234567 key sk-abcdefghijklmnop secret sb_secret_ABCDEFGHIJ Bearer abcdefghijkl jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijklmnop",
    );
    expect(out).not.toMatch(/example\.com|5551234567|abcdefghijklmnop|ABCDEFGHIJ/);
    expect(out).toContain("<email>");
    expect(out).toContain("<phone>");
    expect(out).toContain("sk-***");
    expect(out).toContain("sb_secret_***");
    expect(out).toContain("Bearer ***");
    expect(out).toContain("<jwt>");
  });

  it("truncates very long values", () => {
    expect(redact("x".repeat(2000)).length).toBeLessThanOrEqual(501);
  });
});

describe("log", () => {
  it("masks sensitive keys and redacts nested values", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = log("warn", "test", "hi", { password: "hunter2", nested: { email: "me@example.com" }, apiKey: "x" });
    expect(entry.context).toEqual({ password: "***", nested: { email: "<email>" }, apiKey: "***" });
  });

  it("writes one JSON line in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "sms", "delivery failed", { to: "+15551234567" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", scope: "sms", msg: "delivery failed", to: "<phone>" });
  });

  it("sends errors (only) to reporters, and a failing reporter never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const seen: string[] = [];
    const off1 = registerErrorReporter((e) => void seen.push(e.message));
    const off2 = registerErrorReporter(() => {
      throw new Error("reporter down");
    });
    log("info", "x", "just info");
    expect(() => log("error", "x", "boom")).not.toThrow();
    expect(seen).toEqual(["boom"]);
    off1();
    off2();
  });

  it("posts errors to ERROR_WEBHOOK_URL when configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example.test/abc");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    log("error", "ai", "failed", { user: "a@example.com" });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.scope).toBe("ai");
    expect(JSON.stringify(body)).not.toContain("a@example.com");
  });

  it("summarizes thrown values safely", () => {
    expect(errorInfo(Object.assign(new Error("x"), { code: "E1", status: 500 }))).toMatchObject({ message: "x", code: "E1", status: 500 });
    expect(errorInfo("plain")).toEqual({ message: "plain" });
  });
});
