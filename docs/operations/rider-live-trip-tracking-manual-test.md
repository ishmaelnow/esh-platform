# Rider live tracking acceptance

Owner commits/pushes the feature and confirms Rider Vercel Ready. No migration or Codemagic rebuild.
Use identifiable test accounts and existing authorized test rides; do not create another payment
just to inspect tracking. Keep Driver and Rider signed into the same intended provider.

1. Requested/offered: Home shows finding/waiting and Track ride. No candidate Driver position or ETA.
2. Accept through the existing Driver flow. Enable its existing live location control and grant GPS.
   Home should show the actual assigned Driver, fresh location, and approximate pickup ETA. Track
   ride opens the current trip with existing vehicle, fare, cancellation, and road map.
3. Move only when safe. Fresh location and ETA update on the existing ten-second refresh.
   Stopping sharing must remove Driver exposure. Denied GPS shows unavailable, not invented coordinates.
4. Pause location updates or connectivity for more than sixty seconds. Retained Home coordinates
   become last known; no fresh ETA remains. Restore connectivity and confirm current state recovers.
5. Mark arrived through the normal flow: arrival replaces on-the-way messaging. Start the trip:
   destination ETA replaces pickup ETA, and fresh Driver routing goes to destination.
6. Complete/cancel normally: the current tracking card and Driver exposure disappear. The approved
   Home shortcuts remain. Confirm a new immediate request is available after the ride ends.
7. Switch provider or sign out during refresh. Old locations/results must not appear for the new
   account/provider. Other Riders must never see this Driver without their own accepted assignment.
8. Test at 414 × 896 and 320-pixel widths, iOS and Android. Preserve map gestures/attribution and
   readable controls. With unavailable routing, location/status remain useful without a fabricated ETA.

Restore test Driver availability and close unfinished test rides after acceptance. Local mocked
tests make no production booking, payment, GPS publication, or notification.
