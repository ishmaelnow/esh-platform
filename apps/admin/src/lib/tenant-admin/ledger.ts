export function parseMoneyToMinorUnits(value: string, fractionDigits: number, allowZero = false) {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a positive money amount.");
  const [whole = "", fraction = ""] = normalized.split(".");
  if (fraction.length > fractionDigits) throw new Error(`Use no more than ${fractionDigits} decimal places.`);
  const minor = BigInt(whole) * 10n ** BigInt(fractionDigits) + BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  if (minor < 0n || (!allowZero && minor === 0n) || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(allowZero ? "Enter a supported nonnegative money amount." : "Enter a supported positive money amount.");
  return Number(minor);
}

export function formatMinorUnits(value: number, currency: string, fractionDigits: number) {
  const normalizedValue = Object.is(value, -0) ? 0 : value;
  return new Intl.NumberFormat(undefined, {
    style: "currency", currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
  }).format(normalizedValue / 10 ** fractionDigits);
}

const foundationAccountCodes = [
  "cash_clearing",
  "driver_payables",
  "operating_adjustments",
  "platform_fees",
  "rider_receivables",
] as const;

export function missingFoundationAccountCodes(accounts: Array<{ accountCode: string }>) {
  const accountCodes = new Set(accounts.map(({ accountCode }) => accountCode));
  return foundationAccountCodes.filter((accountCode) => !accountCodes.has(accountCode));
}
