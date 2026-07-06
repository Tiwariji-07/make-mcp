// Canonical site origin, used for metadataBase, Open Graph URLs, canonical
// links, robots.txt, and the sitemap. When the production domain changes
// (e.g. after buying a custom domain), set NEXT_PUBLIC_SITE_URL in the
// deployment environment — no code change needed.
// NOTE: the make-mcp.vercel.app fallback is the live deployment and is kept
// deliberately; the mcpmint domain swap happens later via NEXT_PUBLIC_SITE_URL.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://make-mcp.vercel.app";
