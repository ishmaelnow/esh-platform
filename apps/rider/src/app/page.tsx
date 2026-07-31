"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import {
  bookingStatusLabel,
  canCancelBooking,
  normalizeTenantSlug,
  riderErrorMessage,
} from "./booking";

type BookingTenant = { tenant_slug: string; display_name: string };
type ServiceArea = { serviceAreaId: string; name: string; description: string | null };
type RiderProfile = {
  riderProfileId: string;
  displayName: string;
  email: string;
  phone: string | null;
  accessibilityNotes: string | null;
  status: string;
};
type RiderBooking = {
  bookingId: string;
  serviceAreaId: string;
  serviceAreaName: string;
  pickupAddress: string;
  destinationAddress: string;
  bookingNotes: string | null;
  status: string;
  createdAt: string;
  driver: { displayName: string; driverNumber: string } | null;
  vehicle: {
    vehicleNumber: string;
    make: string;
    model: string;
    modelYear: number;
    color: string;
    licensePlate: string;
  } | null;
};
type RiderPortal = {
  tenant: { tenantId: string; tenantSlug: string; displayName: string };
  profile: RiderProfile | null;
  serviceAreas: ServiceArea[];
  bookings: RiderBooking[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export default function RiderHome() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseAnonKey
        ? createIsolatedBrowserSupabaseClient("esh-rider-portal-auth", {
            url: supabaseUrl,
            anonKey: supabaseAnonKey,
          })
        : null,
    [supabaseAnonKey, supabaseUrl],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [tenants, setTenants] = useState<BookingTenant[]>([]);
  const [tenantSlug, setTenantSlug] = useState("");
  const [portal, setPortal] = useState<RiderPortal | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPortal = useCallback(async () => {
    if (!supabase || !session || !tenantSlug) return;
    const { data, error: portalError } = await supabase.rpc("my_rider_portal", {
      target_tenant_slug: tenantSlug,
    });
    if (portalError) throw portalError;
    setPortal(data as RiderPortal);
  }, [session, supabase, tenantSlug]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.all([supabase.auth.getSession(), supabase.rpc("list_rider_booking_tenants")]).then(
      ([authResult, tenantResult]) => {
        if (!active) return;
        setSession(authResult.data.session);
        const available = (tenantResult.data ?? []) as BookingTenant[];
        setTenants(available);
        const requested =
          typeof window === "undefined"
            ? ""
            : normalizeTenantSlug(new URLSearchParams(window.location.search).get("tenant"));
        setTenantSlug(
          available.some((tenant) => tenant.tenant_slug === requested)
            ? requested
            : (available[0]?.tenant_slug ?? ""),
        );
        if (tenantResult.error) setError(tenantResult.error.message);
        setLoading(false);
      },
    );
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setPortal(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!tenantSlug || typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tenant", tenantSlug);
    window.history.replaceState({}, "", nextUrl);
    setPortal(null);
  }, [tenantSlug]);

  useEffect(() => {
    if (!session || !tenantSlug) return;
    void loadPortal().catch((value) => setError(riderErrorMessage(value)));
    const interval = window.setInterval(() => {
      void loadPortal().catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [loadPortal, session, tenantSlug]);

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !tenantSlug) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const redirect = new URL(window.location.href);
      redirect.hash = "";
      redirect.searchParams.set("tenant", tenantSlug);
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
      });
      if (signInError) throw signInError;
      setMessage("Check your email and open the secure sign-in link on this device.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error: profileError } = await supabase.rpc("upsert_my_rider_profile", {
        target_tenant_slug: tenantSlug,
        display_name_value: formValue(form, "displayName"),
        phone_value: formValue(form, "phone"),
        accessibility_notes_value: formValue(form, "accessibilityNotes"),
      });
      if (profileError) throw profileError;
      await loadPortal();
      setMessage("Your rider profile is ready.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: bookingError } = await supabase.rpc("create_my_rider_booking", {
        target_tenant_slug: tenantSlug,
        target_service_area_id: formValue(form, "serviceAreaId"),
        pickup_address_value: formValue(form, "pickupAddress"),
        destination_address_value: formValue(form, "destinationAddress"),
        booking_notes_value: formValue(form, "bookingNotes"),
      });
      if (bookingError) throw bookingError;
      formElement.reset();
      await loadPortal();
      setMessage("Trip requested. Dispatch can now find an eligible driver.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking(bookingId: string) {
    if (!supabase || !window.confirm("Cancel this trip request?")) return;
    setBusy(true);
    setError("");
    try {
      const { error: cancelError } = await supabase.rpc("cancel_my_rider_booking", {
        target_booking_id: bookingId,
      });
      if (cancelError) throw cancelError;
      await loadPortal();
      setMessage("Trip cancelled.");
    } catch (value) {
      setError(riderErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="shell">
        <section className="card">
          <h1>Rider portal unavailable</h1>
          <p>Public Supabase configuration is missing.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ESH Rider</p>
          <h1>Where are you going?</h1>
          <p className="summary">Request and follow a trip without sharing your live location.</p>
        </div>
        {session ? (
          <button className="button secondary" onClick={() => void supabase?.auth.signOut()}>
            Sign out
          </button>
        ) : null}
      </header>

      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}

      <section className="card tenant-card">
        <label htmlFor="tenant">Transportation provider</label>
        <select
          id="tenant"
          value={tenantSlug}
          disabled={loading || tenants.length === 0}
          onChange={(event) => setTenantSlug(event.target.value)}
        >
          {tenants.length === 0 ? <option value="">No provider available</option> : null}
          {tenants.map((tenant) => (
            <option key={tenant.tenant_slug} value={tenant.tenant_slug}>
              {tenant.display_name}
            </option>
          ))}
        </select>
      </section>

      {!session ? (
        <section className="card auth-card">
          <div>
            <p className="kicker">Secure access</p>
            <h2>Verify your email to request a trip</h2>
            <p>We will email a one-time sign-in link. No password is required.</p>
          </div>
          <form onSubmit={(event) => void sendSignInLink(event)}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button className="button primary" disabled={busy || !tenantSlug}>
              {busy ? "Sending…" : "Email me a secure link"}
            </button>
          </form>
          <p className="privacy">
            Your email identifies your bookings. Anonymous bookings are not accepted.
          </p>
        </section>
      ) : !portal ? (
        <section className="card">
          <p>{tenantSlug ? "Loading your rider portal…" : "Select a provider."}</p>
        </section>
      ) : !portal.profile ? (
        <section className="card">
          <p className="kicker">One-time setup</p>
          <h2>Create your rider profile</h2>
          <p>Your verified email is {session.user.email}.</p>
          <form className="form-grid" onSubmit={(event) => void saveProfile(event)}>
            <label>
              Full name
              <input
                name="displayName"
                required
                autoComplete="name"
                placeholder="Example: Jordan Lee"
              />
            </label>
            <label>
              Mobile phone
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="Example: 469-555-0123"
              />
            </label>
            <label className="wide">
              Accessibility or pickup notes
              <textarea
                name="accessibilityNotes"
                placeholder="Example: Wheelchair accessible vehicle requested"
                rows={3}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Create rider profile"}
            </button>
          </form>
        </section>
      ) : (
        <div className="portal-grid">
          <section className="card booking-card">
            <p className="kicker">{portal.tenant.displayName}</p>
            <h2>Request a trip</h2>
            <form className="form-grid" onSubmit={(event) => void createBooking(event)}>
              <label className="wide">
                Service area
                <select name="serviceAreaId" required defaultValue="">
                  <option value="" disabled>
                    Select the area that covers your trip
                  </option>
                  {portal.serviceAreas.map((area) => (
                    <option key={area.serviceAreaId} value={area.serviceAreaId}>
                      {area.name}
                      {area.description ? ` — ${area.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Pickup address
                <input
                  name="pickupAddress"
                  required
                  autoComplete="street-address"
                  placeholder="Example: 1200 Main St, Dallas, TX 75202"
                />
              </label>
              <label className="wide">
                Destination address
                <input
                  name="destinationAddress"
                  required
                  placeholder="Example: DFW Airport, Terminal A"
                />
              </label>
              <label className="wide">
                Trip notes
                <textarea
                  name="bookingNotes"
                  rows={3}
                  defaultValue={portal.profile.accessibilityNotes ?? ""}
                  placeholder="Example: Please call when you arrive at the north entrance"
                />
              </label>
              <button
                className="button primary"
                disabled={busy || portal.serviceAreas.length === 0}
              >
                {busy ? "Requesting…" : "Request trip"}
              </button>
            </form>
          </section>

          <section className="history">
            <div className="section-heading">
              <div>
                <p className="kicker">My trips</p>
                <h2>Booking status</h2>
              </div>
              <button
                className="button secondary compact"
                onClick={() => void loadPortal()}
                disabled={busy}
              >
                Refresh
              </button>
            </div>
            {portal.bookings.length === 0 ? (
              <div className="card empty">
                <p>Your trip requests will appear here.</p>
              </div>
            ) : (
              portal.bookings.map((booking) => (
                <article className="card trip-card" key={booking.bookingId}>
                  <div className="trip-top">
                    <div>
                      <span className={`status status-${booking.status}`}>
                        {bookingStatusLabel(booking.status)}
                      </span>
                      <h3>{booking.pickupAddress}</h3>
                      <p className="destination">to {booking.destinationAddress}</p>
                    </div>
                    <time>{formatDate(booking.createdAt)}</time>
                  </div>
                  <p className="area">{booking.serviceAreaName}</p>
                  {booking.driver && booking.vehicle ? (
                    <div className="assignment">
                      <strong>{booking.driver.displayName}</strong>
                      <span>Driver #{booking.driver.driverNumber}</span>
                      <span>
                        {booking.vehicle.color} {booking.vehicle.modelYear} {booking.vehicle.make}{" "}
                        {booking.vehicle.model} · {booking.vehicle.licensePlate}
                      </span>
                    </div>
                  ) : null}
                  {canCancelBooking(booking.status) ? (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => void cancelBooking(booking.bookingId)}
                    >
                      Cancel trip
                    </button>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </main>
  );
}
