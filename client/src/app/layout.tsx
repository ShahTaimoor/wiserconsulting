import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers";
import ClientLayout from "./ClientLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const FALLBACK_TITLE = "WISER CONSULTING";
const DESCRIPTION =
  "Expert visa consultation services for students, professionals, and families. Get personalized immigration solutions.";

// The tab title and the tab icon come from the site settings (the logo and website title the administrator saved), so a new logo
// uploaded in the admin panel also changes the icon in the browser tab. If the settings cannot be read, the built-in ones are used.
export async function generateMetadata(): Promise<Metadata> {
  let title = FALLBACK_TITLE;
  let icon = "/logo.png";
  try {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const response = await fetch(`${api}/site-settings`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const settings = (await response.json())?.data;
      if (settings?.websiteTitle) title = String(settings.websiteTitle).toUpperCase();
      if (typeof settings?.logoUrl === "string" && /^https?:\/\//.test(settings.logoUrl)) icon = settings.logoUrl;
    }
  } catch {
    // keep the defaults
  }
  return { title, description: DESCRIPTION, icons: { icon, shortcut: icon, apple: icon } };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
