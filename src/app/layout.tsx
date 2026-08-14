import type { Metadata } from "next";
import { resolveTheme } from "@/lib/resolve-theme";
import "./globals.css";

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
    <html lang="en" data-theme={dataTheme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
