"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { paymentAppReturnUrl, paymentReturnPath, readRiderPaymentReturn, type RiderPaymentReturn } from "../../../lib/payment-return";

export default function PaymentReturnPage() {
  const [value, setValue] = useState<RiderPaymentReturn | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    const result = readRiderPaymentReturn(window.location.href, window.location.origin);
    setValue(result);
    setLoaded(true);
    const isAndroid = /Android/i.test(navigator.userAgent);
    setAndroid(isAndroid);
    // Only app-originated checkout URLs opt into an automatic attempt. Keep the
    // manual links available when the browser requires a user gesture to open ESH.
    if (result && new URL(window.location.href).searchParams.get("returnTo") === "app") {
      window.location.assign(paymentAppReturnUrl(result, isAndroid));
    }
  }, []);
  return <main className="payment-return-page">
    <section className="card" aria-label="Return to Rider">
      <h1>Return to ESH Rider</h1>
      {!loaded ? <p role="status">Loading…</p> : value ? <>
        <p>{value.payment === "cancelled" ? "Checkout was cancelled. Return to your trip." : "Return to the app to check payment status and see your trip."}</p>
        <a className="button primary" href={paymentAppReturnUrl(value, android)}>Return to ESH Rider</a>
        <Link className="button secondary" href={paymentReturnPath(value)}>Continue in browser</Link>
        <p>This page does not confirm payment. Your signed-in Rider account checks the server.</p>
      </> : <><p role="alert">This payment-return link is incomplete. Open Rider to check your trips and payments.</p><Link className="button secondary" href="/">Open Rider</Link></>}
    </section>
  </main>;
}
