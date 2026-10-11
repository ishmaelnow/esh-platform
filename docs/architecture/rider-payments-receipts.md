# Rider Payments and Receipts V1

The Rider portal provides a dedicated payment activity view backed by the existing tenant-isolated
payment-attempt and refund records. Each entry presents the charged amount, payment state, associated
trip when one exists, and any recorded refund amount and date. A payment can exist before its trip
because Stripe collection deliberately precedes booking creation.

Stripe receipt URLs are not persisted or exposed in the general portal payload. An authenticated
Rider requests one payment at a time through a server route. The route relies on payment-attempt RLS
to prove Rider ownership, reads the stored PaymentIntent identifier, retrieves the receipt with the
server-only Stripe key, and returns only Stripe's hosted receipt URL plus its sanitized payment-method
summary (brand and last four when available). Processor secrets, complete card data, Checkout
identifiers, and PaymentIntent identifiers never enter the browser response.

Receipt retrieval renders the returned URL as an ordinary user-activated link. This avoids browser
popup blocking and leaves the Rider portal open while Stripe's receipt opens in a new tab. Retrieval
failures remain visible in the Rider portal.

V1 uses Stripe's hosted receipt as the processor record. ESH-generated tax invoices, PDF statements,
saved payment methods, processor-fee accounting, and cross-processor receipt recovery are deferred.

## Trip-level receipt

Completed/cancelled trip history now has a progressive View trip receipt control. It reads
`GET /api/trips/receipt` with the Rider JWT, selected tenant slug and booking ID. All database reads
use that authenticated client and existing RLS; there is no service-role fallback or new grant.
The existing owned portal RPC establishes an active Rider profile; explicit tenant/profile filters
bind the finished booking and its quote/payment/wallet records. Missing, foreign or active trips
fail closed with a generic message. Responses are private/no-store, and the UI aborts obsolete
requests and clears previous data on refresh, account/provider changes or closure.

The receipt uses the booking's recorded fare and immutable quote. Base, distance, time, minimum
adjustment, service option and toll amounts are reconstructed only if all integer amounts are valid
and their sum exactly equals the locked quote. Otherwise itemization is explicitly unavailable.
Current tenant pricing never changes a historical receipt. Minor units follow currency precision.
Unpriced legacy trips remain Not recorded, not zero or paid. A cancelled trip shows its booked fare,
not a claim that the full fare was charged.

Payment attempts, credit applied/restored, refunds, fare review, fare-difference settlements and
disputes remain separate records. A pending refund, approved review or balance due is not described
as completed collection/refund. No inferred net-paid total is calculated across these lifecycles.
Processor metadata uses the existing server-only Stripe integration for paid/refunded payments,
with a bounded request and no retries; failure leaves recorded activity available and labels method
details unavailable. Only sanitized method summary and HTTPS Stripe receipt URL are returned.
PaymentIntent IDs, provider references, failure details, secrets and full card data stay server-side.

Download receipt exports a local UTF-8 text summary. Share uses the browser/device share sheet where
supported, with clipboard fallback. It deliberately includes trip addresses after a user gesture;
it never exports authentication, hosted processor URLs or an anonymously accessible ESH receipt URL.
Text summaries are not tax invoices or PDFs. No stored export, new notification, financial mutation,
database migration, new secret or native rebuild is introduced. Installed-device sharing/download
behavior requires owner acceptance; browser fixtures do not establish WebView OS behavior.
