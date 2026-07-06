import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Fira Code is self-hosted so production builds don't depend on fonts.gstatic.com
// (next/font/google fetches at build time, which breaks in network-restricted CI).
// The file is the Fira Code v27 latin variable subset (weight 300-700, OFL licensed).
const firaCode = localFont({
  src: "./fonts/fira-code-latin-var.woff2",
  variable: "--font-fira",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = {
  title: {
    default: "mcpmint — Generate MCP Servers in Your Browser",
    template: "%s | mcpmint",
  },
  description: "Generate MCP servers in your browser from OpenAPI and Postman specs. Your spec never leaves your machine, and a token meter keeps servers lean. Free and open source.",
  keywords: [
    "MCP",
    "Model Context Protocol",
    "API",
    "OpenAPI",
    "Swagger",
    "Postman",
    "AI Tools",
    "LLM",
    "Claude",
    "AI API",
    "Code Generator",
    "MCP Server"
  ],
  authors: [{ name: "mcpmint" }],
  creator: "mcpmint",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "mcpmint",
    title: "mcpmint — Generate MCP Servers in Your Browser",
    description: "Generate MCP servers in your browser from OpenAPI and Postman specs. Your spec never leaves your machine, and a token meter keeps servers lean. Free and open source.",
    // Social card image is generated dynamically via src/app/opengraph-image.tsx
    // (Next.js auto-wires the file-based convention).
  },
  twitter: {
    card: "summary_large_image",
    title: "mcpmint — Generate MCP Servers in Your Browser",
    description: "Generate MCP servers in your browser from OpenAPI and Postman specs. Your spec never leaves your machine, and a token meter keeps servers lean. Free and open source.",
    // Twitter card image is generated dynamically via src/app/twitter-image.tsx.
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Clash Display from Fontshare */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${firaCode.variable} bg-mesh min-h-screen`}
        style={{ fontFamily: "'Fira Code', monospace" }}
      >
        {/* Legacy storage key kept intentionally so existing users' saved theme survives the mcpmint rebrand */}
        <ThemeProvider defaultTheme="dark" storageKey="makemcp-theme">
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
