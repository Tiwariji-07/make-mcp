import test from "node:test";
import assert from "node:assert/strict";
import { extractMappedIpv4, isBlockedIp } from "./ssrf.ts";

test("extractMappedIpv4 handles dotted IPv4-mapped form", () => {
    assert.equal(extractMappedIpv4("::ffff:127.0.0.1"), "127.0.0.1");
    assert.equal(extractMappedIpv4("::ffff:10.0.0.1"), "10.0.0.1");
    assert.equal(extractMappedIpv4("::ffff:169.254.169.254"), "169.254.169.254");
});

test("extractMappedIpv4 handles hex IPv4-mapped form", () => {
    // 127.0.0.1 = 7f00:0001
    assert.equal(extractMappedIpv4("::ffff:7f00:1"), "127.0.0.1");
    // 10.0.0.1 = 0a00:0001
    assert.equal(extractMappedIpv4("::ffff:a00:1"), "10.0.0.1");
    // 192.168.0.1 = c0a8:0001
    assert.equal(extractMappedIpv4("::ffff:c0a8:1"), "192.168.0.1");
    // 169.254.169.254 = a9fe:a9fe
    assert.equal(extractMappedIpv4("::ffff:a9fe:a9fe"), "169.254.169.254");
});

test("isBlockedIp blocks private and reserved IPv4", () => {
    assert.equal(isBlockedIp("127.0.0.1"), true);
    assert.equal(isBlockedIp("10.1.2.3"), true);
    assert.equal(isBlockedIp("192.168.1.1"), true);
    assert.equal(isBlockedIp("169.254.169.254"), true);
    assert.equal(isBlockedIp("172.16.0.1"), true);
    assert.equal(isBlockedIp("0.0.0.0"), true);
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("1.1.1.1"), false);
});

test("isBlockedIp blocks IPv6 loopback / ULA / link-local", () => {
    assert.equal(isBlockedIp("::1"), true);
    assert.equal(isBlockedIp("fc00::1"), true);
    assert.equal(isBlockedIp("fe80::1"), true);
    // Google public DNS IPv6
    assert.equal(isBlockedIp("2001:4860:4860::8888"), false);
});

test("isBlockedIp blocks hex IPv4-mapped forms that point at private ranges", () => {
    assert.equal(isBlockedIp("::ffff:7f00:1"), true); // 127.0.0.1
    assert.equal(isBlockedIp("::ffff:a00:1"), true); // 10.0.0.1
    assert.equal(isBlockedIp("::ffff:c0a8:1"), true); // 192.168.0.1
    assert.equal(isBlockedIp("::ffff:a9fe:a9fe"), true); // 169.254.169.254
    assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
    // Public: 8.8.8.8 = 0808:0808
    assert.equal(isBlockedIp("::ffff:808:808"), false);
    assert.equal(isBlockedIp("::ffff:8.8.8.8"), false);
});

test("isBlockedIp fails closed on garbage", () => {
    assert.equal(isBlockedIp("not-an-ip"), true);
    assert.equal(isBlockedIp(""), true);
});
