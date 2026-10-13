import type { Metadata } from "next";
import { SharedTripView } from "./SharedTripView";
export const metadata: Metadata = { title: "ESH shared trip", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <SharedTripView />; }
