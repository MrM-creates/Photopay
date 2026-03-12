import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaClient from "./components/PwaClient";

export const metadata: Metadata = {
  title: "PhotoPay MVP",
  description: "Swiss-first photo delivery and sales platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a7a63",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
      <body>
        {children}
        <PwaClient />
      </body>
    </html>
  );
}
