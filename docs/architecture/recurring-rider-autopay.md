# Recurring Rider Autopay V2

Recurring autopay is explicit and series-scoped. An ordinary Stripe Checkout saves a reusable
payment method through `setup_future_usage=off_session`; ESH stores only Stripe customer/payment-
method identifiers and limited display metadata (brand, last four, expiry), never card credentials.
The Rider must separately enable autopay on an active recurring series and may disable it at any
time without cancelling the schedule. While enabled, unpaid occurrences present autopay as the
primary state and retain a quiet **Pay early** recovery action. **Price and pay** becomes prominent
only when autopay is disabled or has definitively failed; **Skip** remains available until payment
processing starts.

A protected Rider cron claims due unpaid occurrences at most 48 hours before pickup. Claims use row
locks and occurrence status to prevent concurrent processing. The worker obtains a fresh Mapbox road
route and current tenant fare, reserves available Rider wallet credit, and creates one idempotent
off-session PaymentIntent for only the card remainder. Browser values never determine the charge.
Only a succeeded Stripe PaymentIntent plus any exact wallet reservation can create the scheduled
booking. The service-only finalizer atomically binds the quote, payment, wallet entry, booking, and
occurrence while retaining the existing scheduling, dispatch, ledger, refund, and notification
contracts.

Transient pre-charge failures may retry up to three times with a six-hour delay. A definitive card
failure, exhausted retry count, or pickup inside 12 hours leaves the occurrence unpaid and visible
for manual **Price and pay** recovery; no trip is silently dispatched. Failures queue a Rider action-
required email. Admin receives read-only autopay status and attention counts. Tenant/Rider RLS,
service-only mutation RPCs, audit events, processor idempotency, and immutable financial postings
remain mandatory. Signed `payment_intent.succeeded` and `payment_intent.payment_failed` events recover
an off-session request whose HTTP response was lost; the payment attempt exists before Stripe is
called, so the event always has an ESH record to reconcile.

The Vercel Hobby-compatible worker runs once daily. The 48-hour lead window ensures normally
scheduled occurrences are seen on at least one run; this is not a minute-level scheduler. No new
Stripe webhook destination must additionally select `payment_intent.succeeded` and
`payment_intent.payment_failed` for recovery; normal successful processing still completes
synchronously.

Deferred: multiple saved cards, Rider-selected default card, tenant-configurable lead/retry policy,
bank-debit autopay, series fare caps, and automatic rolling occurrence generation.
