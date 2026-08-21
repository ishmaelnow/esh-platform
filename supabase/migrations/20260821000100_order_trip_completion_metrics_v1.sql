-- Ensure trusted route metrics are materialized before fare reconciliation reads them.
-- PostgreSQL orders same-event triggers alphabetically by trigger name.

drop trigger if exists dispatch_bookings_capture_route_metrics on public.dispatch_bookings;
drop trigger if exists dispatch_bookings_capture_fare_reconciliation on public.dispatch_bookings;

create trigger dispatch_bookings_capture_01_route_metrics
after update of status on public.dispatch_bookings
for each row execute function public.capture_completed_trip_route_metrics();

create trigger dispatch_bookings_capture_02_fare_reconciliation
after update of status on public.dispatch_bookings
for each row execute function public.capture_completed_trip_fare_reconciliation();
