import { describe, expect, it } from "vitest";
import { formatMinorUnits, missingFoundationAccountCodes, parseMoneyToMinorUnits } from "./ledger";

describe("ledger money input", () => {
  it("converts decimal display amounts to integer minor units", () => {
    expect(parseMoneyToMinorUnits("12.34", 2)).toBe(1234);
    expect(parseMoneyToMinorUnits("12", 2)).toBe(1200);
  });

  it("allows an explicit zero rate for pricing components", () => {
    expect(parseMoneyToMinorUnits("0", 2, true)).toBe(0);
  });

  it("never displays a negative zero balance", () => {
    expect(formatMinorUnits(-0, "USD", 2)).not.toContain("-");
  });

  it("rejects ambiguous, excessive, zero, negative, and unsafe values", () => {
    for (const value of ["1.001", "0", "-2", "1,000", "abc", "9007199254740992"])
      expect(() => parseMoneyToMinorUnits(value, 2)).toThrow();
  });
});

describe("ledger foundation validation", () => {
  const foundationAccounts = [
    "cash_clearing",
    "driver_payables",
    "operating_adjustments",
    "platform_fees",
    "rider_receivables",
  ].map((accountCode) => ({ accountCode }));

  it("allows additional Driver-specific payable accounts", () => {
    expect(missingFoundationAccountCodes([
      ...foundationAccounts,
      { accountCode: "driver_payable_4552babaee8c4c1c824bb4fd607835a2" },
    ])).toEqual([]);
  });

  it("reports the required foundation account that is actually missing", () => {
    expect(missingFoundationAccountCodes(foundationAccounts.slice(1))).toEqual(["cash_clearing"]);
  });
});
