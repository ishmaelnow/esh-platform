# Trip Fare Reconciliation V1 Manual Test

This validates the first reconciliation slice. It records a trusted comparison only; it must not
change the locked fare, Stripe payment, Driver earnings, or ledger.

1. Before any database change, run `pnpm exec supabase db push --dry-run`. Confirm the only listed
   migration is `20260820000200_trip_fare_reconciliation_v1.sql`, then apply it with
   `pnpm exec supabase db push`.
2. Create a clearly identifiable paid Rider trip with a non-zero road distance and record the
   locked fare, quoted distance, and quoted duration.
3. Have the assigned Driver enable live location, start the trip, and send several location
   updates while moving. Complete the trip normally.
4. In Admin Ledger → **Fare reconciliation**, confirm exactly one
   `trip_fare_reconciliations` row exists for the booking. Its actual distance and duration must
   come from the completed booking's `driver_location_aggregate` metrics, and its calculated fare
   must use the quote's pricing snapshot plus the preserved toll and service-type components.
5. If the calculated fare differs from the locked fare, confirm status is `pending_review` and the
   adjustment is recorded as a signed minor-unit value. If it matches, confirm status is
   `no_change`.
6. For a `pending_review` row, select **Approve** or **Reject** in Admin and provide a reason of at
   least three characters. Confirm the status, reviewer, timestamp, note, and audit event update.
   Confirm the UI states that settlement is still pending.
7. Repeat the completion/read path or refresh Admin. Confirm the row is not duplicated and no
   second audit event is created.
8. Confirm the Rider fare, payment amount, Driver earnings, transfer state, and ledger totals still
   equal the original locked fare. No refund or extra charge should occur in this slice.
9. Complete a test trip without location updates. Confirm no reconciliation row is created and the
   existing no-movement behavior remains unchanged for this validation milestone.

Pass requires one idempotent, tenant-isolated reconciliation record for trusted metrics, accurate
quote-snapshot arithmetic, an audit event, and zero automatic financial movement.
