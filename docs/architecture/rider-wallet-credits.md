# Rider Wallet and Credits V1

Rider Wallet V1 provides tenant-scoped ESH trip credit. Credit is not cash, cannot be withdrawn,
and is never represented by a mutable balance column. A Rider's balance is the sum of immutable
credit and debit entries in the tenant's permanent operating currency.

Authorized finance managers issue a positive credit with a required reason. The ledger debits
operating adjustments and credits the aggregate Rider-wallet liability. The Rider subledger records
the beneficiary and reason, while tenant RLS prevents Riders from reading another Rider's activity.
Issuance is idempotent, audited, and cannot be edited or deleted.

At checkout, the server locks the Rider profile and reserves at most the available wallet balance
against one active quote. Other active reservations are deducted to prevent concurrent double use.
The browser cannot choose or alter the amount. Stripe Checkout collects only the remaining fare;
wallet-only fares never create a Stripe payment. Booking requires the wallet reservation plus a
verified paid Stripe attempt, when present, to equal the locked fare exactly.

Booking application debits the Rider-wallet liability and credits Rider prepayments. Trip
completion clears the combined wallet and card prepayment against Rider receivables through the
existing settlement journal. Pre-trip cancellation refunds only the Stripe-collected portion and
restores the wallet portion with an immutable inverse wallet entry and balanced ledger posting.

Wallet-funded Driver earnings remain an ESH payable obligation. They are not described as Stripe-
collected or eligible for the existing source-charge transfer unless the actual Stripe collection
covers the full Driver earning. Completed-trip automatic recovery is blocked for wallet-funded
trips until a coordinated wallet recovery workflow exists.

Deferred: Rider-purchased wallet funding, cash withdrawal, transferable credit, expiration,
promotional campaigns, partial Admin debits, completed-trip wallet recovery, and Stripe-funded
Driver transfers where wallet credit exceeds the platform fee.
