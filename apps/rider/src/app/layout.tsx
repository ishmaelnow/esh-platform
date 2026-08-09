import type { Metadata } from "next";
import type { ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "ESH Platform Rider",
  description: "Rider workspace for ESH Platform's transportation capability.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
