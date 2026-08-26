# ESH Rider SMS Consent Foundation — Production Manual Test

This test validates consent evidence only. It must not send an SMS. Use a production Rider test
account and a clearly identifiable test mobile number. Do not expose the full number in screenshots
shared beyond the compliance reviewer.

## Deployment prerequisite

1. Confirm `pnpm exec supabase db push --dry-run` lists the consent foundation and, after the
   withdrawal fix is committed, `20260826000200_fix_rider_sms_withdrawal.sql`.
2. The owner applies that migration, pushes the reviewed commit, and waits for the Rider deployment
   to become Ready.
3. No new environment variables are required. Do not activate or test Twilio delivery in this phase.

## Sent screenshot

1. Open `https://rider.eshapp.com`, select the intended provider, and sign in through the existing
   email secure-link flow.
2. Open **Account**.
3. Before changing anything, confirm the SMS checkbox is unchecked for a Rider with no prior consent.
4. Enter an E.164 test number such as `+12155550123`, but do not check the box.
5. Take one screenshot that visibly contains ESH Rider branding, the mobile field, unchecked box,
   FAIR FARE COMPANY LLC, message types, rates notice, variable frequency, HELP, STOP, and the
   Privacy Policy link. This is the compliance screenshot for Sent.
6. Open the Privacy Policy in a new tab and confirm the exact destination is
   `https://fairfareride.com/privacy-policy`.

## Consent behavior

1. Save with the box unchecked. Expect “mobile number saved without SMS consent.” Confirm booking,
   trips, payments, and wallet remain usable.
2. Refresh Account. Expect the phone to remain present, consent to remain unchecked, and delivery
   to remain off. No text should arrive.
3. Check the box and save. Expect consent recorded, `consented_unverified`, and delivery still off.
   No verification code or other text should arrive.
4. Refresh. Expect the checkbox to reflect the recorded consent and the same unverified status.
5. Uncheck the box and save. Expect consent withdrawn and delivery off.
6. Refresh. Confirm the withdrawal remains effective and Rider functionality still works.
7. Confirm the email secure-link sign-in screen and flow are unchanged.

To replace a consented number safely, first withdraw consent while the current number is displayed,
save, then enter and save the replacement number. This prevents consent evidence for one number
from being accidentally associated with another.

## Read-only database evidence

Use the Supabase SQL editor after the UI test. Substitute the test Rider email; do not publish the
returned phone number.

```sql
select
  subscription.status,
  subscription.consented_at,
  subscription.verified_at,
  subscription.disabled_at,
  subscription.consent_source,
  subscription.disclosure_version
from public.sms_notification_subscriptions subscription
join public.person_profiles person using (person_id)
where person.normalized_email = lower('TEST_RIDER_EMAIL')
order by subscription.updated_at desc;
```

Pass requires source `rider_account_settings`, disclosure version
`fair_fare_esh_operational_sms_v1`, and `verified_at` remaining null throughout this consent-only
test.

```sql
select event.consent_action, event.consent_source, event.disclosure_version, event.occurred_at
from public.sms_consent_events event
join public.person_profiles person using (person_id)
where person.normalized_email = lower('TEST_RIDER_EMAIL')
order by event.occurred_at;
```

Expected lifecycle includes `phone_saved_without_consent`, `consent_granted`, and
`consent_withdrawn`. Confirm corresponding `rider.sms_*` entries exist in `tenant_audit_events` and
contain only `phone_last4`, never the full number.

Finally verify no new `sms_delivery_attempts` were created during this test. Pass only if consent is
voluntary and persistent, withdrawal is durable, delivery remains off, no SMS is sent, and all
existing Rider functions remain operational.
