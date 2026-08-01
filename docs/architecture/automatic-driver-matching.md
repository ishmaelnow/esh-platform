# Automatic Driver Matching

## Purpose

Automatic matching advances a requested dispatch booking through sequential, time-bounded Driver
offers while preserving a safe manual-dispatch fallback. It does not introduce Driver location
tracking, route optimization, pricing, or advance reservation for scheduled trips.

## Tenant controls

Tenant dispatch managers can enable or disable matching, choose a Driver response window from 30 to
300 seconds, and cap automatic attempts from 1 to 10. Matching is disabled by default. Enabling it
immediately considers existing requested bookings; disabling it leaves all bookings operable through
manual dispatch.

## Eligibility and ranking

A Driver is eligible only when all of these remain true at offer time:

- the Driver profile is active;
- requested availability is online in the booking's selected service area;
- Driver and assigned-vehicle service blockers are empty;
- an active vehicle assignment exists;
- no accepted, arrived, or in-progress trip is assigned to the Driver; and
- that Driver has not already received an offer for this booking.

Eligible Drivers are ranked by the oldest prior accepted/completed work, with Drivers who have no
prior work first. Driver number is the deterministic tie-breaker. This makes the rule explainable
without claiming distance-based optimization before bounded location sharing exists.

## Offer progression

Only one pending offer can exist for a booking. An automatic offer uses the tenant response window
and the shared Driver offer notification contract. A decline or expiration returns the booking to
`requested`; the database trigger then selects the next eligible, untried Driver until the attempt
limit is reached. A database-native one-minute job processes expirations even when no application
browser is open.

When no candidate is eligible or the attempt limit is exhausted, the booking remains requested for
manual dispatch. An Admin may also replace a pending automatic offer manually.

## Authorization, privacy, and audit

Only a tenant dispatch manager may change matching settings or start matching for existing waiting
bookings. RLS exposes tenant settings only to authorized managers. Internal matching and expiration
functions are not callable by browser roles.

Riders receive the existing lifecycle status and notification messages. Candidate identity, ranking,
declines, expirations, and attempt history are Admin-only; Driver and vehicle identity is disclosed
to the Rider only after acceptance under the existing Rider portal contract.

Settings changes, automatic offer creation, no-candidate outcomes, exhausted attempts, responses,
expiration, reassignment, and booking lifecycle changes use the tenant audit trail.

## Concurrency contract

Matching locks the booking row before evaluating it. Existing uniqueness constraints permit only one
pending offer per booking, and response functions recheck Driver eligibility under lock. A Driver is
never retried for the same booking. These guarantees apply equally to UI refresh processing and the
database scheduler.
