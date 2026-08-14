# Rider Payment Disputes V1 production test

Use Stripe sandbox only. Never use a real card to simulate a dispute.

1. In the existing Rider Stripe event destination, keep all current Checkout events and add:
   `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`,
   `charge.dispute.funds_withdrawn`, and `charge.dispute.funds_reinstated`. Keep the same endpoint
   URL and `STRIPE_WEBHOOK_SECRET`.
2. Run `pnpm exec supabase db push --dry-run` and confirm only
   `20260814000300_rider_payment_disputes_v1.sql`, then have the owner apply it.
3. Deploy Rider and Admin. No new environment variable is required.
4. Create a clearly identifiable Rider Checkout payment with Stripe's sandbox dispute card
   `4000 0000 0000 0259`, any future expiry, and any CVC. Finish booking if Checkout returns before
   the automatic dispute events arrive.
5. In Admin **Ledger → Disputes**, confirm one dispute appears with the exact payment amount,
   `needs response`, `fraudulent`, its booking reference, and evidence deadline.
6. Confirm the funds state becomes withdrawn. In Journal confirm exactly one
   `Stripe dispute funds withdrawn` transaction debits operating adjustments and credits cash
   clearing for the disputed principal. Stripe's dispute fee is not included in V1.
7. Refresh and replay the same webhook events. Confirm no duplicate dispute or ledger transaction.
8. In Rider **Payments**, confirm the same dispute amount, reason, status, deadline, and funds-
   withdrawn state appear only for that Rider.
9. In Stripe Dashboard, submit `winning_evidence` in the dispute's additional-information evidence
   field. Wait for closed/reinstated events.
10. Confirm Admin and Rider show `won` and funds reinstated. Confirm Journal contains exactly one
    inverse entry: debit cash clearing and credit operating adjustments for the same principal.
11. If the disputed booking has a successful Driver transfer, confirm Admin explicitly says the
    transfer requires reviewed recovery and that V1 does not silently reverse Driver funds.
12. Confirm another Rider and another tenant Admin cannot read the dispute. Send an invalidly signed
    webhook and confirm it changes no dispute or ledger state.

Pass requires verified event origin, exact payment linkage, tenant/Rider isolation, one withdrawal
and one reinstatement posting, replay idempotency, honest fee exclusion, and no automatic Driver
clawback. Return any test Driver offline and cancel unfinished bookings afterward.
