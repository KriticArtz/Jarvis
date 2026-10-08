import { describe, expect, it } from "vitest";
import { nextIndex, shouldDismiss } from "./roving";

describe("nextIndex", () => {
  it("moves and wraps with arrows", () => {
    expect(nextIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextIndex(1, "ArrowUp", 3)).toBe(0);
    expect(nextIndex(1, "ArrowDown", 3)).toBe(2);
  });
  it("jumps with Home/End and ignores other keys", () => {
    expect(nextIndex(1, "Home", 3)).toBe(0);
    expect(nextIndex(1, "End", 3)).toBe(2);
    expect(nextIndex(1, "Enter", 3)).toBeNull();
    expect(nextIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("shouldDismiss", () => {
  it("dismisses on a long drag or a quick flick, never on an upward drag", () => {
    expect(shouldDismiss(130, 600)).toBe(true);
    expect(shouldDismiss(60, 80)).toBe(true);
    expect(shouldDismiss(60, 400)).toBe(false);
    expect(shouldDismiss(-200, 100)).toBe(false);
  });
});
