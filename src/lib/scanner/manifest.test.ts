import test from "node:test";
import assert from "node:assert/strict";
import { loadToolsFromManifest } from "./manifest.ts";

const tools = [
    {
        name: "search_docs",
        description: "Search the product documentation.",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
];

test("loads tools from all supported manifest shapes", () => {
    assert.deepEqual(loadToolsFromManifest(JSON.stringify(tools)), tools);
    assert.deepEqual(loadToolsFromManifest(JSON.stringify({ tools })), tools);
    assert.deepEqual(loadToolsFromManifest(JSON.stringify({ result: { tools } })), tools);
});

test("tolerates optional tool fields", () => {
    assert.deepEqual(loadToolsFromManifest('[{"name":"ping"}]'), [{ name: "ping" }]);
});

test("reports malformed JSON with an actionable error", () => {
    assert.throws(
        () => loadToolsFromManifest("{not json"),
        /Could not parse tools manifest as JSON/,
    );
});

test("reports unrecognized manifest shapes", () => {
    assert.throws(
        () => loadToolsFromManifest('{"data":[]}'),
        /Expected a tools array, an object with \"tools\", or a JSON-RPC result with \"result\.tools\"/,
    );
});

test("validates every tool name", () => {
    assert.throws(
        () => loadToolsFromManifest('[{"name":"   "}]'),
        /Tool at index 0 must have a non-empty string \"name\"/,
    );
    assert.throws(
        () => loadToolsFromManifest('[null]'),
        /Tool at index 0 must be an object with a non-empty string \"name\"/,
    );
});
