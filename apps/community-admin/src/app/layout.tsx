import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../../admin/src/app/styles.css";

export const metadata: Metadata = {
  title: "ESH Community Administration",
  description: "Community operations for authorized ESH tenant teams.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
