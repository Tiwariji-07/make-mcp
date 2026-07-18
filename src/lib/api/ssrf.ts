import { isIP, BlockList } from "node:net";

// Blocklist of private / reserved / internal IP ranges. Any resolved address
// that falls inside these is rejected.
const blockedV4 = new BlockList();
blockedV4.addSubnet("0.0.0.0", 8, "ipv4"); // "this" network / 0.0.0.0
blockedV4.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918
blockedV4.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT (RFC6598)
blockedV4.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blockedV4.addSubnet("169.254.0.0", 16, "ipv4"); // link-local incl. 169.254.169.254 metadata
blockedV4.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918
blockedV4.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
blockedV4.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918
blockedV4.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blockedV4.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blockedV4.addSubnet("240.0.0.0", 4, "ipv4"); // reserved

const blockedV6 = new BlockList();
blockedV6.addAddress("::", "ipv6"); // unspecified
blockedV6.addAddress("::1", "ipv6"); // loopback
blockedV6.addSubnet("fc00::", 7, "ipv6"); // unique-local (ULA)
blockedV6.addSubnet("fe80::", 10, "ipv6"); // link-local
blockedV6.addSubnet("ff00::", 8, "ipv6"); // multicast

/**
 * Expand an IPv4-mapped IPv6 address to a dotted-quad IPv4 string, or null.
 *
 * Handles both common forms Node/isIP accept:
 *   - ::ffff:127.0.0.1  (dotted)
 *   - ::ffff:7f00:1     (hex, 127.0.0.1)
 *   - ::ffff:0a00:0001  (hex, 10.0.0.1)
 * Also covers the obsolete IPv4-compatible form ::a.b.c.d (no ffff).
 */
export function extractMappedIpv4(ip: string): string | null {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");

    // Dotted-quad mapped / compatible: ::ffff:a.b.c.d or ::a.b.c.d
    const dotted = lower.match(/^(?:0*:)*:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
        ?? lower.match(/^::(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted && isIP(dotted[1]) === 4) {
        return dotted[1];
    }

    // Hex-mapped: ::ffff:HHHH:HHHH where each H is a 16-bit group encoding two octets.
    // Examples: ::ffff:7f00:1 → 127.0.0.1, ::ffff:c0a8:1 → 192.168.0.1
    const hex = lower.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
        const hi = Number.parseInt(hex[1], 16);
        const lo = Number.parseInt(hex[2], 16);
        if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi > 0xffff || lo > 0xffff) {
            return null;
        }
        const a = (hi >> 8) & 0xff;
        const b = hi & 0xff;
        const c = (lo >> 8) & 0xff;
        const d = lo & 0xff;
        return `${a}.${b}.${c}.${d}`;
    }

    return null;
}

/** True if the given IP literal is inside a blocked private/reserved range. */
export function isBlockedIp(ip: string): boolean {
    const normalized = ip.replace(/^\[|\]$/g, "");
    const family = isIP(normalized);

    if (family === 4) {
        return blockedV4.check(normalized, "ipv4");
    }

    if (family === 6) {
        // IPv4-mapped / IPv4-compatible IPv6 — extract and re-check as v4 so
        // forms like ::ffff:7f00:1 (loopback) cannot bypass the v4 blocklist.
        const mapped = extractMappedIpv4(normalized);
        if (mapped && isIP(mapped) === 4) {
            return blockedV4.check(mapped, "ipv4");
        }
        return blockedV6.check(normalized, "ipv6");
    }

    // Not a valid IP literal — treat as blocked (fail closed).
    return true;
}
