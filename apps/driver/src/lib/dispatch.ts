export function offerSecondsRemaining(expiresAt: string, now: number) {
  const expiration = Date.parse(expiresAt);
  if (!Number.isFinite(expiration)) return 0;
  return Math.max(0, Math.ceil((expiration - now) / 1000));
}

export function offerCountdownLabel(expiresAt: string, now: number) {
  const seconds = offerSecondsRemaining(expiresAt, now);
  return seconds > 0 ? `Expires in ${seconds} seconds` : "Offer expired — refreshing status";
}
