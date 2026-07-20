import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createTarGzip } from "./tar.ts";

test("tar output is deterministic and contains ustar file headers", () => {
    const files = new Map([["README.md", "hello\n"], ["src/index.ts", "export {};\n"]]);
    const first = createTarGzip(files);
    const second = createTarGzip(files);
    assert.deepEqual(first, second);
    const tar = gunzipSync(first);
    assert.equal(tar.subarray(257, 262).toString(), "ustar");
    assert.equal(tar.subarray(0, 9).toString(), "README.md");
});
