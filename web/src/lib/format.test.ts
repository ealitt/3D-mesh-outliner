import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("preserves integer trailing zeroes when no decimals are requested", () => {
    expect(formatNumber(90, 0)).toBe("90");
  });

  it("strips only insignificant decimal zeroes", () => {
    expect(formatNumber(1.5, 3)).toBe("1.5");
    expect(formatNumber(2.0, 3)).toBe("2");
  });
});
