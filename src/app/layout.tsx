import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { resolveTheme } from "@/lib/resolve-theme";
import "./globals.css";

// Modernize's face — self-hosted by next/font at build time, exposed as the
// --font-sans variable globals.css's body rule reads.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FirsThing",
  description: "Verified utility savings for Indian residential societies.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await resolveTheme();
  // Slate is the un-stamped default (globals.css bare :root) — only Light
  // and Dark need an explicit attribute. Stamped server-side before first
  // paint, so there is no flash and no client bootstrap script needed here.
  const dataTheme = theme === "slate" ? undefined : theme;

  return (
    <html lang="en" data-theme={dataTheme} className={jakarta.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
