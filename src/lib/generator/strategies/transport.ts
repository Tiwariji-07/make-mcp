import type { GenerationPlan } from "../types.ts";

interface NodeTransportStrategy {
    imports: string;
    bootstrap: string;
}

export function getNodeTransportStrategy(plan: GenerationPlan): NodeTransportStrategy {
    switch (plan.runtime.transportStrategy) {
        case "stdio":
            return {
                imports: 'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
                bootstrap: `  const server = createServer();\n  const transport = new StdioServerTransport();\n  await server.connect(transport);\n  console.error(${JSON.stringify(`${plan.server.name} MCP server running on stdio`)});`,
            };
        case "sse":
            return {
                imports: 'import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";\nimport http from "http";',
                bootstrap: `  const sessions: Record<string, { transport: SSEServerTransport; server: McpServer }> = {};\n  const httpServer = http.createServer(async (req: any, res: any) => {\n    const requestUrl = new URL(req.url || "/", ${JSON.stringify(`http://${plan.server.host}:${plan.server.port}`)});\n\n    if (req.method === "GET" && requestUrl.pathname === "/sse") {\n      const transport = new SSEServerTransport("/messages", res);\n      const sessionId = transport.sessionId;\n      const server = createServer();\n      sessions[sessionId] = { transport, server };\n      transport.onclose = () => {\n        delete sessions[sessionId];\n      };\n      await server.connect(transport);\n      return;\n    }\n\n    if (req.method === "POST" && requestUrl.pathname === "/messages") {\n      const sessionId = requestUrl.searchParams.get("sessionId");\n      if (!sessionId) {\n        res.writeHead(400);\n        res.end("Missing sessionId parameter");\n        return;\n      }\n\n      const session = sessions[sessionId];\n      if (!session) {\n        res.writeHead(404);\n        res.end("Session not found");\n        return;\n      }\n\n      await session.transport.handlePostMessage(req, res);\n      return;\n    }\n\n    res.writeHead(404);\n    res.end();\n  });\n  httpServer.listen(${plan.server.port}, ${JSON.stringify(plan.server.host)}, () => {\n    console.log(${JSON.stringify(`${plan.server.name} MCP server running on http://${plan.server.host}:${plan.server.port}`)});\n  });`,
            };
        default:
            return {
                imports: 'import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";\nimport http from "http";',
                bootstrap: `  const httpServer = http.createServer(async (req: any, res: any) => {\n    if (req.method !== "POST") {\n      res.writeHead(405, { "Content-Type": "application/json" });\n      res.end(JSON.stringify({\n        jsonrpc: "2.0",\n        error: {\n          code: -32000,\n          message: "Method not allowed.",\n        },\n        id: null,\n      }));\n      return;\n    }\n\n    const server = createServer();\n    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });\n\n    try {\n      await server.connect(transport);\n      await transport.handleRequest(req, res);\n    } catch (error) {\n      console.error("Error handling MCP request:", error);\n      if (!res.headersSent) {\n        res.writeHead(500, { "Content-Type": "application/json" });\n        res.end(JSON.stringify({\n          jsonrpc: "2.0",\n          error: {\n            code: -32603,\n            message: "Internal server error",\n          },\n          id: null,\n        }));\n      }\n    }\n  });\n  httpServer.listen(${plan.server.port}, ${JSON.stringify(plan.server.host)}, () => {\n    console.log(${JSON.stringify(`${plan.server.name} MCP server running on http://${plan.server.host}:${plan.server.port}`)});\n  });`,
            };
    }
}

export function getPythonTransportRunLine(plan: GenerationPlan): string {
    if (plan.runtime.transportStrategy === "stdio") {
        return '    mcp.run(transport="stdio")';
    }

    const transport = plan.runtime.transportStrategy === "streamableHttp"
        ? "http"
        : plan.runtime.transportStrategy;

    return `    mcp.run(transport=${JSON.stringify(transport)}, host=${JSON.stringify(plan.server.host)}, port=${plan.server.port})`;
}
