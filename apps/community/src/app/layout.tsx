import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./styles.css";
export const metadata: Metadata = {
  title: "ESH Community",
  description: "Useful local information, events, help, and community connections.",
};
export const viewport: Viewport = { themeColor: "#123b5d", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
