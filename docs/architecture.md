# mcpmint Architecture

mcpmint is a code generator. Its primary output is a standalone MCP server
project, not a dynamic proxy that interprets OpenAPI or Postman collections at
runtime.

The generator should behave like a compiler:

```text
Source spec
  -> Canonical API model
  -> Tool plan
  -> Project plan
  -> Generated app
  -> Verification
```

## Goals

- Generate inspectable, deployable Node.js and Python MCP server apps.
- Preserve source API semantics until the planner intentionally simplifies
  them.
- Keep UI state separate from the canonical generator contract.
- Make generated request execution testable outside the UI.
- Prefer predictable generated code over runtime magic.

## Non-Goals

- Do not make the main product a runtime OpenAPI interpreter.
- Do not use the editor's UI state as the only source of generation truth.
- Do not hide unsupported API features by silently flattening or stringifying
  them.

## Pipeline

### 1. Source Spec

Input may come from OpenAPI, Swagger, Postman, pasted content, files, or URLs.
Source-specific parsers are responsible for reading the original format without
making MCP-specific decisions.

### 2. Canonical API Model

The canonical API model is the loss-minimized representation of the source API.
It should preserve:

- API metadata.
- Servers, base URLs, and server variables.
- Operations.
- Path-level and operation-level parameters.
- Parameter location, schema, required flag, style, and explode behavior.
- Request bodies, media types, examples, and schema composition.
- Security schemes and operation-specific security requirements.
- Response metadata useful for documentation and tests.
- Source format metadata for diagnostics.

This layer is the source of truth for generation. UI configuration may annotate
or override this model, but it should not replace it.

### 3. Tool Plan

The tool planner converts canonical API operations into MCP tool decisions:

- Tool name and display description.
- Input schema exposed to the MCP client.
- Request body strategy.
- Parameter serialization strategy.
- Auth strategy.
- Operation mapping.
- Warnings and manual-review notes.

This is where intentional simplification belongs. For example, a shallow JSON
object can be flattened into separate tool arguments, while complex nested or
union schemas should remain a single `body` argument.

Request body strategies are explicit:

- `flattenedObject`: shallow, simple JSON object exposed as individual tool
  parameters.
- `rawJsonObject`: complex JSON object exposed as one `body` parameter.
- `rawArray`: JSON array exposed as one `body` parameter.
- `text`: text media types exposed as one `body` parameter.
- `formUrlencoded`: `application/x-www-form-urlencoded` fields exposed as form
  parameters.
- `multipart`: `multipart/form-data` fields exposed as multipart parameters;
  file fields use base64-encoded string inputs and are rendered as file parts.
- `binary`: binary media types exposed as one `body` parameter.

Flatten only shallow JSON objects whose properties are simple scalar schemas.
Nested objects, unions, arrays, and map-like schemas stay as a single `body`
argument so generated clients do not silently reshape request semantics.

### 4. Project Plan

The project plan describes the generated app:

- Runtime language and framework.
- Transport.
- Dependencies.
- File layout.
- Scripts.
- Documentation, Docker, test, and verification options.
- Compact mode (meta-tools) — see below.
- Manifest metadata.

This layer should be language-neutral where possible, with Node.js and Python
targets consuming the same tool and project plans.

**Compact mode (meta-tools).** `GenerationPlan.runtime.compactMode` is a
project-plan option (default `false`). When it is false, targets emit exactly
one MCP tool per entry in `plan.tools` — output is byte-identical to the
non-compact behavior, so targets that ignore the flag stay correct. When it is
true, a target must NOT register one tool per operation; instead it registers
exactly three meta-tools built from the same (never trimmed) `plan.tools` list:

- `list_api_endpoints` — browse/search the catalog; returns lightweight records
  (id, method, path, summary, tags) with a cursor, never schemas.
- `get_api_endpoint_schema` — fetch one operation's full contract on demand.
- `invoke_api_endpoint` — actually call one operation.

This keeps the model's context cost constant regardless of API size (only the
three meta-tools are ever exposed). The **safe-dispatch** contract is
security-critical: build an immutable registry keyed by tool id; refuse unknown
ids and make no HTTP call; validate arguments against the stored schema BEFORE
any network I/O; build the request from the operation's stored method + path
template (never a model-supplied URL, never `eval`); and apply auth server-side
from config/env so the model never supplies secrets. The full contract lives on
`GenerationPlan.runtime.compactMode` in `types.ts`; both the Node and Python
targets implement it (`renderCompactServer`), dispatching through the same
per-operation request functions used in non-compact mode.

### 5. Generated App

Generated apps should be standalone and readable.

Preferred Node.js shape:

```text
src/
  index.ts
  config.ts
  mcp/server.ts
  api/client.ts
  api/operations.ts
  api/serialization.ts
```

Preferred Python shape:

```text
src/
  server.py
  config.py
  api_client.py
  operations.py
  serialization.py
```

Tool registration should stay thin. Request construction, auth application, and
serialization should live in generated helpers so behavior can be tested once
instead of being inlined in every tool.

Generated servers target the MCP 2025-11-25 spec. Targets emit:

- Tool annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint` /
  `openWorldHint`) derived from the operation's HTTP verb — advisory hints only,
  never a security boundary.
- `outputSchema` plus `structuredContent` when a response schema is available
  (object schemas pass through; other shapes are wrapped under `result`).
- `isError` tool results for upstream/HTTP failures, so the model can
  self-correct instead of the transport failing.
- stderr-only logging, keeping the stdio JSON-RPC stream on stdout clean.
- A registry-ready `server.json` (npm for Node, PyPI for Python), a multi-stage
  `Dockerfile`, and deploy buttons.
- For HTTP/SSE transports, an access layer enforcing optional bearer auth
  (constant-time compare) and deny-by-default Origin checks, in both targets.

### Client-side vs. server-side generation

The generator's plan/validate/target/zip stages are pure and run in the browser
by default (`src/lib/client-generate.ts`): it imports only the pure pieces
(`normalize`, `validate`, `request`, `targets/*`) and zips the in-memory file
map with `fflate`, so the spec never leaves the page. The Node-only modules —
`archive.ts` (`archiver`) and `verify.ts` (`node:fs` / `child_process`) — are
deliberately excluded from that import graph so they never reach the client
bundle. Server-side generation (`src/app/api/generate/route.ts`) exists for the
one thing the browser cannot do: full verification (install + build/import + run
generated tests).

### 6. Verification

Verification should have two levels:

- Fast verification: shape checks, syntax checks, and unresolved-template checks.
- Full verification: install generated dependencies, build/import the generated
  app, and run generated behavior tests.

Fast verification is suitable for interactive preview. Full verification should
run in CI and can be offered as a stricter export option.

## Runtime Strategy

### Node.js

- Use the official `@modelcontextprotocol/sdk`.
- Generate TypeScript.
- Prefer `stdio` for local clients.
- Prefer Streamable HTTP for server deployments.
- Treat SSE as a legacy option.

### Python

- Use FastMCP for developer-friendly generated servers.
- Pin and verify the supported FastMCP version range.
- Generate enough structure for request construction tests.

## Ownership Boundaries

- `src/lib/parsers/*`: source-format parsing only.
- `src/lib/api-model/*`: canonical API model and source normalization.
- `src/lib/generator/planner*`: API model plus UI choices to tool/project plans.
- `src/lib/generator/targets/*`: language-specific project generation.
- `src/lib/generator/verify*`: generated project verification.
- `src/store/*`: UI workflow state only.

## Migration Direction

The canonical API model and the tool plan now exist and are used: the pipeline
above is the real generation path, not just the target. Both the Node and Python
targets consume the same `GenerationPlan` (built from the canonical model via the
planner) rather than reading UI state directly.

What is still pending:

- The legacy UI-oriented config path still exists as a fallback and is slated for
  removal. Until then, some inputs can still reach generation through the
  simplified `ToolConfig` shape rather than the canonical model, and the two
  paths should be reconciled onto the canonical model as the single source of
  truth.
- Full verification remains server-only and gated behind
  `MCPMINT_ALLOW_FULL_VERIFY`; the browser path runs fast/shape validation only.
