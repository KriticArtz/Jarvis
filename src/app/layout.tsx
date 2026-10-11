import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Display face: greetings, headlines and other moments of meaning (the .type-display role). */
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument", weight: "400", style: ["normal", "italic"], subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: { type: "website", siteName: brand.name, title: `${brand.name} — ${brand.tagline}`, description: brand.description },
  twitter: { card: "summary_large_image", title: `${brand.name} — ${brand.tagline}`, description: brand.description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e6" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1310" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before hydration. */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
