import { describe, expect, it } from "vitest";
import { parseMoneyToMinorUnits } from "./ledger";

describe("ledger money input", () => {
  it("converts decimal display amounts to integer minor units", () => {
    expect(parseMoneyToMinorUnits("12.34", 2)).toBe(1234);
    expect(parseMoneyToMinorUnits("12", 2)).toBe(1200);
  });

  it("rejects ambiguous, excessive, zero, negative, and unsafe values", () => {
    for (const value of ["1.001", "0", "-2", "1,000", "abc", "9007199254740992"])
      expect(() => parseMoneyToMinorUnits(value, 2)).toThrow();
  });
});
