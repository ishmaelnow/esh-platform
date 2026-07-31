# Manual Dispatch and Trip Core

## Scope

This first dispatch slice supports tenant-admin-created bookings, manual offers to eligible online
drivers, driver acceptance or decline, and a database-enforced trip lifecycle. It proves the
operational workflow before realtime location, routing, automatic matching, pricing, or payments.

## Ownership

- `dispatch_bookings` owns the customer request and trip execution state.
- `dispatch_offers` preserves every manual driver offer and response.
- Service Area owns the operating boundary.
- Driver Availability and Compliance remain the source of dispatch eligibility.
- Fleet Management remains the source of the driver's active vehicle.

## Lifecycle

Bookings follow:

`requested → offered → accepted → arrived → in_progress → completed`

An offered driver may decline, returning the booking to `requested`. A dispatcher may replace a
pending offer or cancel any booking that is not completed or already cancelled.

## Enforcement

- Only tenant owners and tenant administrators with Driver Management enabled can create, offer,
  reassign, or cancel.
- A driver must be eligible, online, and currently operating in the booking's service area when an
  offer is created and accepted.
- The active vehicle is captured with the offer.
- A driver may have only one accepted or in-progress trip.
- Drivers can respond to only their own pending offers and advance only their own active trip.
- Every creation, offer, response, cancellation, and trip transition creates a tenant audit event.

## Deferred

- Rider/customer identity and self-service booking
- GPS, maps, routing, and arrival verification
- Automatic matching and offer expiration
- Pricing, payments, invoicing, and driver earnings
- Push/SMS trip notifications
- Scheduled bookings and recurring trips
