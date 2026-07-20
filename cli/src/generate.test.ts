import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeProjectAtomically } from "./generate.ts";

test("forced regeneration replaces the directory and removes obsolete generated files", () => {
    const root = mkdtempSync(join(tmpdir(), "mcpmint-force-test-"));
    const outDir = join(root, "server");

    try {
        writeProjectAtomically(new Map([
            ["README.md", "old docs"],
            ["obsolete.txt", "remove me"],
        ]), outDir, false);
        writeFileSync(join(outDir, "user-added.txt"), "stale unmanaged content");

        writeProjectAtomically(new Map([
            ["README.md", "new docs"],
            ["src/index.ts", "export {};"],
        ]), outDir, true);

        assert.equal(readFileSync(join(outDir, "README.md"), "utf8"), "new docs");
        assert.equal(existsSync(join(outDir, "obsolete.txt")), false);
        assert.equal(existsSync(join(outDir, "user-added.txt")), false);
        assert.equal(readFileSync(join(outDir, "src/index.ts"), "utf8"), "export {};");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("non-forced regeneration refuses to mix with existing output", () => {
    const root = mkdtempSync(join(tmpdir(), "mcpmint-no-force-test-"));
    const outDir = join(root, "server");

    try {
        writeProjectAtomically(new Map([["old.txt", "old"]]), outDir, false);
        assert.throws(
            () => writeProjectAtomically(new Map([["new.txt", "new"]]), outDir, false),
            /is not empty/,
        );
        assert.equal(readFileSync(join(outDir, "old.txt"), "utf8"), "old");
        assert.equal(existsSync(join(outDir, "new.txt")), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
