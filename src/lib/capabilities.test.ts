import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCapabilities, selectOperationIds } from "./capabilities.ts";
import type { ApiModel } from "./api-model/types.ts";

const model: ApiModel = {
  source: { format: "openapi" },
  info: { title: "Example", version: "1" },
  servers: [], baseUrls: [], securitySchemes: {}, security: [],
  operations: [
    { id: "get", method: "GET", path: "/pets", parameters: [], responses: [] },
    { id: "delete", method: "DELETE", path: "/pets/{id}", parameters: [], responses: [] },
    { id: "trace", method: "TRACE", path: "/debug", parameters: [], responses: [] },
  ],
};

test("capability report separates safe recommendations and unsupported methods", () => {
  const report = analyzeCapabilities(model);
  assert.equal(report.recommended, 1);
  assert.equal(report.unsupported, 1);
  assert.deepEqual([...selectOperationIds(report, "recommended")], ["get"]);
  assert.deepEqual([...selectOperationIds(report, "all-supported")].sort(), ["delete", "get"]);
});
