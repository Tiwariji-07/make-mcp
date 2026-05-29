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

- **Import OpenAPI/Swagger** — Upload files, paste content, or fetch from URL
- **Visual Endpoint Selection** — Choose which endpoints to expose as MCP tools
- **Tool Configuration** — Edit tool names, descriptions, and parameter details
- **Multi-Language Export** — Generate Node.js (TypeScript) or Python (FastMCP) servers
- **Ready-to-Run Code** — Download a complete, deployable MCP server as a zip file

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

1. **Import** — Upload your OpenAPI/Swagger spec (JSON/YAML) or enter a URL
2. **Select** — Choose which endpoints to convert into MCP tools
3. **Configure** — Edit tool names, descriptions, and parameters for better LLM understanding
4. **Export** — Download a complete MCP server in Node.js or Python

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 16](https://nextjs.org/) | React framework with App Router |
| [Tailwind CSS v4](https://tailwindcss.com/) | Styling with custom glassmorphic theme |
| [shadcn/ui](https://ui.shadcn.com/) | UI components |
| [Zustand](https://zustand-demo.pmnd.rs/) | State management |
| [swagger-parser](https://apitools.dev/swagger-parser/) | OpenAPI specification parsing |
| [Handlebars](https://handlebarsjs.com/) | Code template generation |

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

The generated MCP servers include:

- **Full MCP SDK integration** — Uses official `@modelcontextprotocol/sdk` (Node) or `fastmcp` (Python)
- **Type-safe parameters** — Zod schemas (Node) or Python type hints
- **Transport options** — stdio, SSE, or HTTP (Streamable)
- **Authentication support** — API Key, Bearer Token, or Basic Auth
- **Environment config** — `.env.example` with all required variables
- **Documentation** — README with setup and usage instructions

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
