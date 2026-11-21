import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "./globals.css";
import { HubProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: { default: "Gateline · Nassau Flight Services", template: "%s · Gateline" },
  description: "Passenger services rostering, gate logs and performance for Nassau Flight Services. A First Glance Bahamas product.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gateline", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b1b2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HubProvider>{children}</HubProvider>
      </body>
    </html>
  );
}
