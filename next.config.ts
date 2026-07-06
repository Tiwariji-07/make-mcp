import type { NextConfig } from "next";

// Baseline security headers for all routes (finding L2).
//
// The CSP is intentionally permissive-but-sane so it does not break the app:
// - Fontshare CSS is loaded via <link rel="stylesheet"> from api.fontshare.com
//   and served fonts from fonts fontshare CDN, so those hosts are allowlisted
//   for style/font.
// - Next.js injects inline styles and (in dev) inline/eval scripts, and
//   @vercel/analytics loads a first-party script from /_vercel; 'unsafe-inline'
//   for style and script keeps these working without hashing every inline blob.
//   'unsafe-eval' is included because Next dev/runtime relies on it.
// If a stricter policy is desired later, move to nonce-based script-src and
// drop 'unsafe-eval'/'unsafe-inline'.
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://cdn.fontshare.com https://api.fontshare.com data:",
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://cdn.fontshare.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'self' https://api.fontshare.com https://cdn.fontshare.com",
].join("; ");

const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
