import type { Metadata } from "next";
import type { ReactNode } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import "../../../admin/src/app/styles.css";

export const metadata: Metadata = {
  title: "ESH Transportation Administration",
  description: "Transportation operations for ESH tenants.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
