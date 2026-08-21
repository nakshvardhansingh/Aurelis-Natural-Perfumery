import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AURELIS — Natural Perfumery",
  description:
    "A fragrance born of nature. Captured from flowers, distilled in silence, shaped by the mountains.",
};

export const viewport: Viewport = {
  themeColor: "#0D0B09",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
      <head>
        {/* Critical first frames — start fetching before JS hydrates */}
        <link rel="preload" as="image" href="/frames/frame-0000.webp" fetchPriority="high" />
        <link rel="preload" as="image" href="/frames/frame-0001.webp" fetchPriority="high" />
        <link rel="preload" as="image" href="/frames/frame-0002.webp" fetchPriority="high" />
        <link rel="preload" as="image" href="/frames/frame-0003.webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
