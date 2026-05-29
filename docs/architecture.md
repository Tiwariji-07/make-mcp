# MakeMCP Architecture

MakeMCP is a code generator. Its primary output is a standalone MCP server
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

### 4. Project Plan

The project plan describes the generated app:

- Runtime language and framework.
- Transport.
- Dependencies.
- File layout.
- Scripts.
- Documentation, Docker, test, and verification options.
- Manifest metadata.

This layer should be language-neutral where possible, with Node.js and Python
targets consuming the same tool and project plans.

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

The current implementation already has a generator pipeline, but it passes a
simplified UI-oriented `ToolConfig` into generation. Future fixes should move
toward the architecture above by introducing the canonical API model first, then
changing the planner and targets to consume it.
