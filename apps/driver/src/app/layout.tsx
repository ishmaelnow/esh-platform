import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "ESH Platform Driver",
  description: "Driver workspace for ESH Platform's transportation capability.",
};
export const viewport: Viewport = { themeColor: "#123b5d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
