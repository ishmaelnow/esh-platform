# Completed-Trip Refund and Driver Recovery V1

An authorized tenant finance manager may fully refund a paid completed trip. Unlike a pre-trip
cancellation, this operation must recover the locked Driver earning and, when present, reverse the
platform-to-connected-account Stripe transfer before returning the Rider's payment.

## Coordinated recovery

The Admin server prepares recovery through a role-derived database RPC. The database verifies the
completed booking, paid payment attempt, locked Driver earning, tenant authority, and any recorded
Driver transfer. The browser supplies only a booking reference and required operational reason;
amounts, processor IDs, tenant identity, and Driver identity come from trusted records.

If a successful transfer exists, the server reverses it through Stripe first and persists that
checkpoint. A transfer already allocated to an active or paid bank payout is rejected for manual
recovery because its funds are no longer safely assumed to be in the connected balance. The Rider
refund then uses the original PaymentIntent and full recorded amount. Stable idempotency keys protect
both Stripe operations. If the Rider refund fails after transfer reversal, retry resumes from the
persisted checkpoint rather than reversing the transfer twice.

After Stripe accepts the required operations, one database transaction posts the immutable domain
recovery:

- a reversed transfer debits cash clearing and credits the Driver payable;
- the earning reversal debits the Driver payable and credits platform revenue; and
- the full Rider refund debits platform revenue and credits cash clearing.

The original trip, fare, earning, transfer, and journal records remain unchanged. The booking stays
completed but records that its Driver earning was reversed. The payment and refund records become
refunded/succeeded, the transfer becomes reversed when applicable, and the action is tenant audited.

## Presentation and privacy

Admin Rider Payments exposes the action and its durable refund state. Rider trip and payment history
reuse the existing refund record and refund email. The Driver wallet retains the historical trip,
labels the earning reversed after refund, removes it from pending/collected/transferred totals, and
continues to derive amount owed from the immutable ledger. The manager's internal reason is not
shown to the Driver.

V1 supports full refunds only. Partial refunds, completed-trip refunds after an allocated bank
payout, connected-account negative-balance recovery, disputes, chargebacks, and processor-fee
accounting remain deferred.
