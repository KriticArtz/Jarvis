import { describe, expect, it } from "vitest";
import { activeNav, NAV } from "./navigation";

describe("primary navigation", () => {
  it("has the six destinations in order", () => {
    expect(NAV.map((n) => n.label)).toEqual(["Today", "Calendar", "Assistant", "Money", "Progress", "You"]);
  });

  it("maps every existing route to its destination", () => {
    expect(activeNav("/dashboard")).toBe("today");
    expect(activeNav("/plan")).toBe("today");
    expect(activeNav("/calendar")).toBe("calendar");
    expect(activeNav("/assistant")).toBe("assistant");
    expect(activeNav("/goals")).toBe("progress");
    expect(activeNav("/goals/0b6f2c1e-1111-4a2b-9c3d-123456789abc")).toBe("progress");
    expect(activeNav("/review")).toBe("progress");
    expect(activeNav("/progress")).toBe("progress");
    expect(activeNav("/settings")).toBe("you");
    expect(activeNav("/money")).toBe("money");
    expect(activeNav("/money/recurring")).toBe("money");
    expect(activeNav("/money/transactions")).toBe("money");
  });

  it("doesn't match look-alike paths or public pages", () => {
    expect(activeNav("/goalsx")).toBeNull();
    expect(activeNav("/")).toBeNull();
    expect(activeNav("/login")).toBeNull();
  });
});
