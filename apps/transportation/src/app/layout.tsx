import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@esh-platform/maps/styles.css";
import "../../../admin/src/app/styles.css";

export const metadata: Metadata = {
  title: "ESH Transportation Administration",
  description: "Transportation operations for ESH tenants.",
};
export const viewport: Viewport = { themeColor: "#123b5d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
