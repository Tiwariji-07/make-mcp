import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "MakeMCP - Generate MCP Servers from API Specs",
  description: "Import your OpenAPI or Postman specs and generate production-ready MCP servers. Zero coding required.",
  keywords: ["MCP", "Model Context Protocol", "API", "OpenAPI", "Swagger", "AI Tools"],
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
      </body>
    </html>
  );
}
