# SMS Trip Notifications V1 production test

1. In one Twilio test or production account, create a Verify Service and a Messaging Service with a
   sending number appropriate for the destination country.
2. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` to Admin, Rider, and Driver as server-only
   variables. Add `TWILIO_MESSAGING_SERVICE_SID` only to Admin. Add
   `TWILIO_VERIFY_SERVICE_SID` to Rider and Driver. Never use `NEXT_PUBLIC_` for these values.
3. Dry-run and apply only `20260815000400_sms_trip_notifications_v1.sql`, then deploy Admin,
   Rider, and Driver.
4. In Rider **My trips**, enter a test mobile number in E.164 format, request a code, enter the
   received code, and confirm success or failure appears inside the Text alerts card and the enabled
   UI shows only the last four digits.
5. Repeat in Driver **Text alerts**. Confirm an incorrect or expired code does not enable texts.
6. Create a test trip. Confirm Driver receives one generic new-offer text with no Rider name,
   address, or fare.
7. Accept and arrive. Confirm Rider receives generic accepted and arrived texts without names,
   addresses, or payment details.
8. Use Admin **Notifications** to deliver/retry a test event and confirm the response reports email,
   push, and SMS independently. Repeating the same delivered notification must not create another
   accepted SMS attempt.
9. Disable Rider texts, create another eligible event, and confirm email/push can still deliver but
   no Rider text is attempted.
10. Restore the test Driver to Offline and cancel unfinished test trips.

On both mobile shells, the send button must remain disabled until a valid E.164 number is present.
After sending, the phone field is locked, the numeric code supports OS one-time-code autofill, and
**Change number** returns safely to the phone-entry state. A Twilio rejection must appear inside the
Text alerts card; it must never look like an ignored tap.

Pass requires verified ownership, explicit consent, role/tenant-derived subscription mutation,
masked browser display, privacy-safe copy, idempotent attempts, independent channels, audit events,
and immediate opt-out.

## Current production blocker

Twilio rejected the first Rider verification request because the configured account is suspended
with an unexplained negative balance. Twilio billing ticket `#29018616` requests the transaction-
level balance history. Do not change ESH credentials or retry production SMS until Twilio confirms
the account is active. Email and Web Push remain unaffected.
