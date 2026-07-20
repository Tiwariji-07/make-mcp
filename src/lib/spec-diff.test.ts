import assert from "node:assert/strict";
import test from "node:test";
import { diffSpecs } from "./spec-diff.ts";
import type { ParsedSpec } from "./api-model/parsed-spec.ts";
import type { ApiOperation } from "./api-model/types.ts";

function spec(version: string, operations: ApiOperation[]): ParsedSpec {
  return { format: "openapi", info: { title: "API", version }, baseUrl: "", endpoints: [], securitySchemes: {}, apiModel: { source: { format: "openapi" }, info: { title: "API", version }, servers: [], baseUrls: [], securitySchemes: {}, security: [], operations } };
}

test("spec diff reports additions removals and contract changes by method/path", () => {
  const before = spec("1", [
    { id: "a", method: "GET", path: "/a", parameters: [], responses: [] },
    { id: "b", method: "GET", path: "/b", parameters: [], responses: [] },
  ]);
  const after = spec("2", [
    { id: "a2", operationId: "a2", method: "GET", path: "/a", parameters: [], responses: [] },
    { id: "c", method: "POST", path: "/c", parameters: [], responses: [] },
  ]);
  assert.deepEqual(diffSpecs(before, after), {
    oldVersion: "1", newVersion: "2", added: 1, removed: 1, changed: 1, unchanged: 0,
    changes: [
      { kind: "changed", key: "GET /a", operationId: "a2", method: "GET", path: "/a", details: ["operationId: none → a2"] },
      { kind: "added", key: "POST /c", operationId: "c", method: "POST", path: "/c", details: ["New operation"] },
      { kind: "removed", key: "GET /b", operationId: "b", method: "GET", path: "/b", details: ["Operation removed"] },
    ],
  });
});
