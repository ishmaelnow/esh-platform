import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../../../admin/src/app/styles.css";

export const metadata: Metadata = {
  title: "ESH Community Administration",
  description: "Community operations for authorized ESH tenant teams.",
};
export const viewport: Viewport = { themeColor: "#123b5d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
