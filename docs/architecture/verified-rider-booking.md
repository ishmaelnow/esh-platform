# Verified Rider Booking

## Delivered boundary

The Rider app is an open tenant directory with verified-email access to booking. A rider selects a
transportation provider, receives a Supabase magic link, creates a tenant-scoped rider profile, and
can request or cancel trips. Anonymous booking is not supported.

Rider requests use `dispatch_bookings`, so they appear in the existing Admin Dispatch workflow and
follow the same offer and trip lifecycle as manually entered bookings:

`requested → offered → accepted → arrived → in_progress → completed`

A rider may cancel before `in_progress`. Cancellation also closes a pending driver offer.

## Identity and tenant isolation

- Supabase Auth proves ownership of the email address.
- `person_profiles` remains the platform identity.
- `rider_profiles` is the tenant-scoped rider identity and does not create a staff membership or
  tenant role.
- Rider mutations are security-definer functions that derive identity from `auth.uid()`.
- RLS permits riders to read only their own profile and bookings.
- Tenant administrators retain their existing dispatch visibility.
- Profile creation, booking creation, and rider cancellation write tenant audit events.

## Privacy boundary

The booking collects typed pickup and destination addresses. It does not collect GPS or continuous
location. Driver and assigned vehicle details are withheld until the driver accepts. The Rider app
does not expose driver email, phone, vehicle VIN, or compliance records.

## Deferred

- Scheduled trips
- Price estimates and payments
- Automatic matching
- Maps, routing, GPS, and live vehicle position
- Rider email/SMS lifecycle notifications
- Saved places, additional passengers, and ratings

## Manual verification

1. Open the Rider app and select a provider.
2. Enter an email address and open the magic link from that inbox.
3. Create the rider profile and confirm the verified email cannot be edited.
4. Request a trip using an active service area, pickup, and destination.
5. In Admin Dispatch, confirm the request appears as `requested`.
6. Offer it to an eligible online driver in the same service area.
7. Confirm the Rider app shows `Driver notified`, but no driver or vehicle identity.
8. Accept in the Driver app.
9. Confirm the Rider app shows driver name/number and vehicle description/license plate.
10. Advance through arrived, in progress, and completed; confirm Rider status follows.
11. Create another request and cancel it from Rider before the trip starts.
12. Confirm Admin shows it cancelled and the Driver app no longer presents a pending offer.
13. Sign in as another rider and confirm the first rider's bookings are not visible.
