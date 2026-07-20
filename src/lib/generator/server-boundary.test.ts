import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));

test("the public generation route stays outside process-spawning verification", () => {
    const route = readFileSync(join(directory, "../../app/api/generate/route.ts"), "utf8");
    const server = readFileSync(join(directory, "server.ts"), "utf8");

    assert.match(route, /@\/lib\/generator\/server/);
    assert.doesNotMatch(route, /@\/lib\/generator["']/);
    assert.doesNotMatch(server, /from ["']\.\/verify|node:child_process/);
});

test("browser archives use asynchronous compression", () => {
    const clientGenerator = readFileSync(join(directory, "../client-generate.ts"), "utf8");

    assert.match(clientGenerator, /import \{ zip, strToU8 \} from ["']fflate["']/);
    assert.match(clientGenerator, /export async function generateProjectInBrowser/);
    assert.doesNotMatch(clientGenerator, /zipSync/);
});
