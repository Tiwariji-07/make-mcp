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
                bootstrap: `  const transport = new StdioServerTransport();\n  await server.connect(transport);\n  console.error(${JSON.stringify(`${plan.server.name} MCP server running on stdio`)});`,
            };
        case "sse":
            return {
                imports: 'import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";\nimport http from "http";',
                bootstrap: `  const httpServer = http.createServer(async (req: any, res: any) => {\n    if (req.url === "/sse") {\n      const transport = new SSEServerTransport("/messages", res);\n      await server.connect(transport);\n      return;\n    }\n    res.writeHead(404);\n    res.end();\n  });\n  httpServer.listen(${plan.server.port}, ${JSON.stringify(plan.server.host)}, () => {\n    console.log(${JSON.stringify(`${plan.server.name} MCP server running on http://${plan.server.host}:${plan.server.port}`)});\n  });`,
            };
        default:
            return {
                imports: 'import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";\nimport http from "http";',
                bootstrap: `  const httpServer = http.createServer(async (req: any, res: any) => {\n    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });\n    await server.connect(transport);\n    await transport.handleRequest(req, res);\n  });\n  httpServer.listen(${plan.server.port}, ${JSON.stringify(plan.server.host)}, () => {\n    console.log(${JSON.stringify(`${plan.server.name} MCP server running on http://${plan.server.host}:${plan.server.port}`)});\n  });`,
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
