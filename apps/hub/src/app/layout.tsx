import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFS Hub · Nassau Flight Services",
  description: "Nassau Flight Services' ground operations systems in one place. A First Glance Bahamas product.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b1b2b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-fg antialiased">{children}</body>
    </html>
  );
}
