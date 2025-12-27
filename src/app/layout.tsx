import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MakeMCP - Generate MCP Servers from API Specs",
    template: "%s | MakeMCP",
  },
  description: "Transform OpenAPI and Postman specs into production-ready Model Context Protocol (MCP) servers. Enable LLMs to interact with your APIs instantly. Zero coding required.",
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
  authors: [{ name: "MakeMCP" }],
  creator: "MakeMCP",
  metadataBase: new URL("https://make-mcp.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://make-mcp.vercel.app",
    siteName: "MakeMCP",
    title: "MakeMCP - Bridge APIs to LLM Context",
    description: "Transform OpenAPI and Postman specs into production-ready MCP servers. Enable LLMs to interact with your APIs instantly.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MakeMCP - Generate MCP Servers from API Specs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MakeMCP - Generate MCP Servers from API Specs",
    description: "Transform OpenAPI and Postman specs into production-ready MCP servers for LLMs.",
    images: ["/og-image.png"],
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
    canonical: "https://make-mcp.vercel.app",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-mesh min-h-screen`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
