"use client";

import Image from "next/image";

export function RiderLanding({ onOrder, onHome, destinations }: {
  onOrder: () => void; onHome: () => void;
  destinations: { id: string; label: string; onSelect: () => void }[];
}) {
  return <section className="rider-landing" aria-label="Book a ride">
    <button className="order-now" type="button" onClick={onOrder}>
      <Image src="/images/rider-silver-car.png" width={62} height={44} sizes="62px" className="order-car" alt="" />
      <span>Request ride</span>
      <svg viewBox="0 0 28 24" aria-hidden="true"><path d="M2 12h23M17 4l8 8-8 8" /></svg>
    </button>
    <div className="destination-shortcuts" aria-label="Destination shortcuts">
      <button className="shortcut-add" type="button" aria-label="Choose a destination" onClick={onOrder}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
      </button>
      <button className="shortcut-home" type="button" onClick={onHome} title="Enter your home destination">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></svg><span>Home</span>
      </button>
      {destinations.map((destination) => <button className="shortcut-recent" type="button" key={destination.id}
        onClick={destination.onSelect} title={destination.label}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6a9 9 0 1 1-1 11M4 2v5H0M12 6v6l4 2" /></svg><span>{destination.label}</span>
      </button>)}
    </div>
  </section>;
}
