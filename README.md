# MakeMCP

<div align="center">

**Bridge APIs to LLM Context**

Transform OpenAPI specs and Postman Collections into type-safe Model Context Protocol (MCP) servers. Enable LLMs to interact with your APIs instantly.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

</div>

---

## ✨ Features

- **Flexible import** — Upload a file, paste a spec (or ⌘V / Ctrl+V straight onto the landing page), or fetch from a URL. OpenAPI/Swagger and Postman v2.1 collections are all supported. URL fetches run through a server-side, SSRF-hardened proxy so browser CORS never blocks them, and one click loads a built-in Petstore sample.
- **Visual endpoint selection** — Choose which endpoints to expose as MCP tools.
- **Tool configuration** — Edit tool names, descriptions, and parameter details, with import-time validation warnings and per-endpoint review badges surfaced in the editor.
- 🪄 **Compact mode (meta-tools)** — For large APIs, emit just 3 meta-tools (`list_api_endpoints` / `get_api_endpoint_schema` / `invoke_api_endpoint`) instead of one tool per endpoint, keeping tool definitions from ballooning the model's context window. A live context-budget token meter shows the cost either way.
- 🔒 **Client-side generation** — Generation and zipping run entirely in your browser by default (via fflate), so your spec never leaves your machine. A server-side path is also available when you want full verification.
- **Multi-language export** — Generate Node.js (TypeScript) or Python (FastMCP) servers targeting MCP spec 2025-11-25.
- **Ready-to-run code** — Download a complete, deployable MCP server as a zip, then copy paste-ready client configs from the success screen.
- **Session persistence** — Your in-progress import, selection, and configuration survive a page refresh.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/Tiwariji-07/make-mcp.git
cd make-mcp

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 How It Works

1. **Import** — Upload an OpenAPI/Swagger or Postman spec (JSON/YAML), paste it, or enter a URL (fetched server-side to bypass CORS). Try the built-in sample if you just want a look.
2. **Select** — Choose which endpoints to convert into MCP tools. Watch the context-budget meter, or flip on **compact mode** so a large API collapses into 3 meta-tools.
3. **Configure** — Edit tool names, descriptions, and parameters for better LLM understanding; review any validation warnings.
4. **Export** — Generate a complete MCP server in Node.js or Python. Generation runs in your browser by default (spec never leaves the page); opt into server-side generation for full verification. Then copy the client config for Claude Desktop, Cursor, or the `claude mcp add` CLI.

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 16](https://nextjs.org/) | React framework with App Router |
| [Tailwind CSS v4](https://tailwindcss.com/) | Styling with custom glassmorphic theme |
| [shadcn/ui](https://ui.shadcn.com/) | UI components |
| [Zustand](https://zustand-demo.pmnd.rs/) | State management |
| [swagger-parser](https://apitools.dev/swagger-parser/) | OpenAPI specification parsing |
| [Handlebars](https://handlebarsjs.com/) | Code template generation |
| [fflate](https://github.com/101arrowz/fflate) | In-browser, dependency-free zip for client-side generation |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) 1.29.0 | MCP SDK used by generated Node.js servers |
| [FastMCP](https://github.com/jlowin/fastmcp) 3.4.2 | MCP framework used by generated Python servers |

## 📂 Project Structure

```
make-mcp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page (Hero)
│   │   ├── import/page.tsx       # Import Collection page
│   │   ├── editor/page.tsx       # Endpoint selection + sidebar
│   │   ├── export/page.tsx       # Server configuration
│   │   └── api/generate/route.ts # Code generation API
│   ├── components/
│   │   ├── shared/               # Header, common components
│   │   └── ui/                   # shadcn/ui components
│   ├── lib/parsers/              # OpenAPI parser
│   └── store/                    # Zustand store
├── public/
└── package.json
```

## 🎯 Generated Server Features

Generated servers target the **MCP 2025-11-25** spec and include:

- **Current MCP SDKs** — `@modelcontextprotocol/sdk` 1.29.0 `registerTool` (Node) or FastMCP 3.4.2 (Python).
- **Type-safe parameters** — Zod schemas (Node) or Python type hints.
- **MCP 2025-11-25 features** — tool annotations (`readOnly` / `destructive` / `idempotent` / `openWorld`, derived from the HTTP verb), `outputSchema` + `structuredContent`, `isError` tool results for self-correcting failures, and stderr-only logging so the stdio JSON-RPC stream stays clean.
- **Compact mode (optional)** — for large APIs, exactly 3 meta-tools with safe dispatch: a closed, immutable operation registry, validate-before-I/O, stored method + path templates (no eval, no model-supplied URLs), and server-side auth.
- **Transport options** — Streamable HTTP by default, stdio for local clients, SSE as legacy.
- **Upstream authentication** — API Key, Bearer Token, or Basic Auth against the target API.
- **Hardened MCP access over HTTP/SSE** — in both Node and Python: optional bearer-token enforcement with a constant-time comparison, plus Origin enforcement that denies by default (only localhost origins are allowed when no allow-list is set) to guard against DNS-rebinding.
- **Registry- and deploy-ready** — a registry-ready `server.json` (npm for Node, PyPI for Python), a multi-stage `Dockerfile`, and one-click deploy buttons.
- **Environment config** — `.env.example` with all required variables.
- **Documentation** — README with setup, usage, and deploy instructions.

## 🔧 Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type check
npx tsc --noEmit
```

## 🧭 Architecture

MakeMCP is designed as a compiler-style generator:

```text
Source spec -> Canonical API model -> Tool plan -> Project plan -> Generated app -> Verification
```

See [docs/architecture.md](docs/architecture.md) for the target architecture and
ownership boundaries.

## 📄 License

MIT © [Tiwariji-07](https://github.com/Tiwariji-07)

---

<div align="center">

**[⭐ Star this repo](https://github.com/Tiwariji-07/make-mcp)** if you find it useful!

</div>
