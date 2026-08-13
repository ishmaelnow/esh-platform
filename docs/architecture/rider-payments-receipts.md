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
