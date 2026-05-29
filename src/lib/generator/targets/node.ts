import type {
    GeneratedManifest,
    GeneratedProject,
    GenerationPlan,
    GenerationRequestBody,
    GenerationTool,
} from "../types.ts";
import { getAuthEnvironmentExample, getNodeAuthStrategy } from "../strategies/auth.ts";
import { getNodeTransportStrategy } from "../strategies/transport.ts";
import { toJsStringLiteral } from "../utils.ts";
import { toZodType } from "../schema.ts";

function renderNodeSerializationOptions(param: GenerationTool["params"][number]): string {
    return `{ location: ${JSON.stringify(param.location)}, style: ${JSON.stringify(param.style)}, explode: ${param.explode === undefined ? "undefined" : String(param.explode)} }`;
}

function buildManifest(plan: GenerationPlan): GeneratedManifest {
    return {
        generatorVersion: plan.generatorVersion,
        contractVersion: plan.contractVersion,
        language: "node",
        framework: plan.runtime.framework,
        features: plan.features,
        transport: plan.runtime.transport,
        serverName: plan.server.name,
        generatedAt: plan.generatedAt,
        toolCount: plan.tools.length,
    };
}

function getEnvExample(plan: GenerationPlan): string {
    return `# Base URL for the API\nAPI_BASE_URL=${plan.spec.baseUrl || "https://api.example.com"}\n${getAuthEnvironmentExample(plan.auth)}`;
}

function getNodeBodyExpression(requestBody: GenerationRequestBody): string {
    if (
        requestBody.contentKind === "rawJsonObject" ||
        requestBody.contentKind === "rawArray" ||
        requestBody.contentKind === "text" ||
        requestBody.contentKind === "binary"
    ) {
        const param = requestBody.params[0];
        return `args[${JSON.stringify(param?.argName || "body")}]`;
    }

    const properties = requestBody.params
        .map((param) => `      ${JSON.stringify(param.sourceName)}: args[${JSON.stringify(param.argName)}],`)
        .join("\n");

    return `{\n${properties}\n    }`;
}

function isMultipartBinaryParam(param: GenerationRequestBody["params"][number]): boolean {
    return param.schema?.format === "binary" || param.schema?.type === "file";
}

function renderNodeMultipartAppend(param: GenerationRequestBody["params"][number]): string {
    const argName = JSON.stringify(param.argName);
    const sourceName = JSON.stringify(param.sourceName);

    if (!isMultipartBinaryParam(param)) {
        return `      if (args[${argName}] !== undefined) formBody.append(${sourceName}, String(args[${argName}]));`;
    }

    return `      if (args[${argName}] !== undefined) {
        const fileBytes = Buffer.from(String(args[${argName}]), "base64");
        formBody.append(${sourceName}, new Blob([fileBytes]), ${sourceName});
      }`;
}

function renderNodeRequestBody(requestBody?: GenerationRequestBody): {
    setup: string;
    headerLines: string[];
    bodyOption: string;
} {
    if (!requestBody) {
        return { setup: "", headerLines: [], bodyOption: "" };
    }

    switch (requestBody.contentKind) {
        case "flattenedObject":
            return {
                setup: "",
                headerLines: [`      requestHeaders["Content-Type"] = ${JSON.stringify(requestBody.contentType)};`],
                bodyOption: `        body: JSON.stringify(${getNodeBodyExpression(requestBody)}),\n`,
            };
        case "rawJsonObject":
        case "rawArray":
            return {
                setup: "",
                headerLines: [`      requestHeaders["Content-Type"] = ${JSON.stringify(requestBody.contentType)};`],
                bodyOption: `        body: JSON.stringify(${getNodeBodyExpression(requestBody)}),\n`,
            };
        case "text":
            return {
                setup: "",
                headerLines: [`      requestHeaders["Content-Type"] = ${JSON.stringify(requestBody.contentType)};`],
                bodyOption: `        body: String(${getNodeBodyExpression(requestBody)} ?? ""),\n`,
            };
        case "formUrlencoded": {
            const setupLines = [
                "      const formBody = new URLSearchParams();",
                ...requestBody.params.map((param) => `      if (args[${JSON.stringify(param.argName)}] !== undefined) formBody.append(${JSON.stringify(param.sourceName)}, String(args[${JSON.stringify(param.argName)}]));`),
            ];

            return {
                setup: setupLines.join("\n"),
                headerLines: [`      requestHeaders["Content-Type"] = ${JSON.stringify(requestBody.contentType)};`],
                bodyOption: "        body: formBody,\n",
            };
        }
        case "multipart": {
            const setupLines = [
                "      const formBody = new FormData();",
                ...requestBody.params.map(renderNodeMultipartAppend),
            ];

            return {
                setup: setupLines.join("\n"),
                headerLines: [],
                bodyOption: "        body: formBody,\n",
            };
        }
        case "binary":
            return {
                setup: "",
                headerLines: [`      requestHeaders["Content-Type"] = ${JSON.stringify(requestBody.contentType)};`],
                bodyOption: `        body: ${getNodeBodyExpression(requestBody)},\n`,
            };
    }
}

function renderNodeTool(tool: GenerationTool, plan: GenerationPlan): string {
    const authStrategy = getNodeAuthStrategy(plan.auth);
    const pathParams = tool.params.filter((param) => param.location === "path");
    const queryParams = tool.params.filter((param) => param.location === "query");
    const headerParams = tool.params.filter((param) => param.location === "header");
    const cookieParams = tool.params.filter((param) => param.location === "cookie");
    const bodyRender = renderNodeRequestBody(tool.requestBody);

    const schemaFields = tool.params
        .map((param) => {
            let line = `    ${JSON.stringify(param.argName)}: ${toZodType(param.type, param.schema)}`;
            if (!param.required) {
                line += ".optional()";
            }
            if (param.description) {
                line += `.describe(${toJsStringLiteral(param.description)})`;
            }
            return `${line},`;
        })
        .join("\n");

    const pathReplacements = pathParams
        .map((param) => `      url = url.replace(${JSON.stringify(`{${param.sourceName}}`)}, serializePathParameter(${JSON.stringify(param.sourceName)}, args[${JSON.stringify(param.argName)}], ${renderNodeSerializationOptions(param)}));`)
        .join("\n");

    const queryLines = queryParams
        .map((param) => `      appendSerializedParameter(queryString, ${JSON.stringify(param.sourceName)}, args[${JSON.stringify(param.argName)}], ${renderNodeSerializationOptions(param)});`)
        .join("\n");

    const headerLines = headerParams
        .map((param) => `      if (args[${JSON.stringify(param.argName)}] !== undefined) requestHeaders[${JSON.stringify(param.sourceName)}] = serializeParameterValue(${JSON.stringify(param.sourceName)}, args[${JSON.stringify(param.argName)}], ${renderNodeSerializationOptions(param)});`)
        .join("\n");

    const cookieLines = cookieParams
        .map((param) => `      if (args[${JSON.stringify(param.argName)}] !== undefined) cookiePairs.push(\`${encodeURIComponent(param.sourceName)}=\${encodeURIComponent(serializeParameterValue(${JSON.stringify(param.sourceName)}, args[${JSON.stringify(param.argName)}], ${renderNodeSerializationOptions(param)}))}\`);`)
        .join("\n");

    const bodySetup = bodyRender.setup ? `${bodyRender.setup}\n` : "";
    const bodyHeaderLines = bodyRender.headerLines.join("\n");

    return `server.tool(
  ${JSON.stringify(tool.displayName)},
  ${toJsStringLiteral(tool.description)},
  {
${schemaFields}
  },
  async (args: Record<string, unknown>) => {
    try {
      let url = \`\${API_BASE_URL}${tool.path}\`;
${pathReplacements ? `${pathReplacements}\n` : ""}      const queryString = new URLSearchParams();
${queryLines ? `${queryLines}\n` : ""}${authStrategy.applyQuery ? `${authStrategy.applyQuery}\n` : ""}      if (queryString.toString()) {
        url += \`?\${queryString.toString()}\`;
      }

      const requestHeaders: Record<string, string> = getHeaders();
      const cookiePairs: string[] = [];
${headerLines ? `${headerLines}\n` : ""}${cookieLines ? `${cookieLines}\n` : ""}${bodySetup}${bodyHeaderLines ? `${bodyHeaderLines}\n` : ""}      if (cookiePairs.length > 0) {
        requestHeaders["Cookie"] = cookiePairs.join("; ");
      }

      const response = await fetch(url, {
        method: ${JSON.stringify(tool.method)},
        headers: requestHeaders,
${bodyRender.bodyOption}      });

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
      }

      const responseText = await response.text();
      const text = (() => {
        if (!responseText) return "OK";
        try {
          return JSON.stringify(JSON.parse(responseText), null, 2);
        } catch {
          return responseText;
        }
      })();

      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error instanceof Error ? error.message : "Unknown error"}\` }],
        isError: true,
      };
    }
  }
);`;
}

function renderIndex(plan: GenerationPlan): string {
    const authStrategy = getNodeAuthStrategy(plan.auth);
    const transportStrategy = getNodeTransportStrategy(plan);

    return `import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
${transportStrategy.imports}
import { z } from "zod";

const API_BASE_URL = process.env.API_BASE_URL || ${JSON.stringify(plan.spec.baseUrl || "https://api.example.com")};
${authStrategy.envDeclarations}

type SerializedParameterOptions = {
  location: "path" | "query" | "header" | "cookie";
  style?: string;
  explode?: boolean;
};

function defaultParameterStyle(location: SerializedParameterOptions["location"]): string {
  if (location === "path" || location === "header") return "simple";
  return "form";
}

function shouldExplode(style: string, explode?: boolean): boolean {
  return explode ?? style === "form";
}

function scalarToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => entryValue !== undefined);
}

function serializeParameterValue(name: string, value: unknown, options: SerializedParameterOptions): string {
  const style = options.style || defaultParameterStyle(options.location);
  const explode = shouldExplode(style, options.explode);
  const delimiter = style === "spaceDelimited" ? " " : style === "pipeDelimited" ? "|" : ",";

  if (Array.isArray(value)) {
    return value.map(scalarToString).join(delimiter);
  }

  const entries = objectEntries(value);
  if (entries.length > 0) {
    if (explode) {
      return entries.map(([key, entryValue]) => \`\${key}=\${scalarToString(entryValue)}\`).join(delimiter);
    }
    return entries.flatMap(([key, entryValue]) => [key, scalarToString(entryValue)]).join(delimiter);
  }

  return scalarToString(value);
}

function serializePathParameter(name: string, value: unknown, options: SerializedParameterOptions): string {
  const style = options.style || "simple";
  const explode = shouldExplode(style, options.explode);
  const encode = (entry: unknown) => encodeURIComponent(scalarToString(entry));
  const encodedName = encodeURIComponent(name);

  if (Array.isArray(value)) {
    const encodedValues = value.map(encode);
    if (style === "label") return \`.\${encodedValues.join(".")}\`;
    if (style === "matrix") {
      return explode
        ? encodedValues.map((entry) => \`;\${encodedName}=\${entry}\`).join("")
        : \`;\${encodedName}=\${encodedValues.join(",")}\`;
    }
    return encodedValues.join(",");
  }

  const entries = objectEntries(value);
  if (entries.length > 0) {
    if (style === "label") {
      const values = explode
        ? entries.map(([key, entryValue]) => \`\${encodeURIComponent(key)}=\${encode(entryValue)}\`)
        : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
      return \`.\${values.join(".")}\`;
    }
    if (style === "matrix") {
      if (explode) {
        return entries.map(([key, entryValue]) => \`;\${encodeURIComponent(key)}=\${encode(entryValue)}\`).join("");
      }
      const values = entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
      return \`;\${encodedName}=\${values.join(",")}\`;
    }
    const values = explode
      ? entries.map(([key, entryValue]) => \`\${encodeURIComponent(key)}=\${encode(entryValue)}\`)
      : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
    return values.join(",");
  }

  const encodedValue = encode(value);
  if (style === "label") return \`.\${encodedValue}\`;
  if (style === "matrix") return \`;\${encodedName}=\${encodedValue}\`;
  return encodedValue;
}

function appendSerializedParameter(
  params: URLSearchParams,
  name: string,
  value: unknown,
  options: SerializedParameterOptions
) {
  if (value === undefined || value === null) return;

  const style = options.style || "form";
  const explode = shouldExplode(style, options.explode);

  if (Array.isArray(value)) {
    if (style === "form" && explode) {
      for (const entry of value) params.append(name, scalarToString(entry));
      return;
    }
    params.append(name, serializeParameterValue(name, value, { ...options, style, explode }));
    return;
  }

  const entries = objectEntries(value);
  if (entries.length > 0) {
    if (style === "deepObject") {
      for (const [key, entryValue] of entries) params.append(\`\${name}[\${key}]\`, scalarToString(entryValue));
      return;
    }
    if (style === "form" && explode) {
      for (const [key, entryValue] of entries) params.append(key, scalarToString(entryValue));
      return;
    }
    params.append(name, serializeParameterValue(name, value, { ...options, style, explode }));
    return;
  }

  params.append(name, scalarToString(value));
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
${authStrategy.applyHeaders ? `${authStrategy.applyHeaders}\n` : ""}  return headers;
}

function createServer() {
  const server = new McpServer({
    name: ${JSON.stringify(plan.server.name)},
    version: ${JSON.stringify(plan.server.version)},
  });

${plan.tools.map((tool) => renderNodeTool(tool, plan)).join("\n\n")}

  return server;
}

async function main() {
${transportStrategy.bootstrap}
}

main().catch(console.error);
`;
}

function renderReadme(plan: GenerationPlan): string {
    const install = `${plan.runtime.packageManager} install`;
    const dev = plan.runtime.packageManager === "npm" ? "npm run dev" : `${plan.runtime.packageManager} dev`;
    const build = plan.runtime.packageManager === "npm" ? "npm run build" : `${plan.runtime.packageManager} build`;
    const start = plan.runtime.packageManager === "npm" ? "npm run start" : `${plan.runtime.packageManager} start`;

    return `# ${plan.server.name}

Generated by MakeMCP ${plan.generatorVersion}.

## Install

\`\`\`bash
${install}
\`\`\`

## Configure

Copy \`.env.example\` to \`.env\` and provide the required values.

\`\`\`bash
cp .env.example .env
\`\`\`

## Run

\`\`\`bash
${dev}
\`\`\`

## Build

\`\`\`bash
${build}
${start}
\`\`\`

## Tools

${plan.tools.map((tool) => `- \`${tool.displayName}\`: ${tool.description}`).join("\n")}
`;
}

function renderDockerfile(plan: GenerationPlan): string {
    return `FROM node:20-alpine
WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY tests ./tests
COPY .env.example ./.env.example
COPY makemcp.manifest.json ./makemcp.manifest.json

RUN npm run build

EXPOSE ${plan.server.port}
CMD ["npm", "run", "start"]
`;
}

function renderDockerCompose(plan: GenerationPlan): string {
    const ports = plan.runtime.transport === "stdio"
        ? ""
        : `    ports:\n      - "${plan.server.port}:${plan.server.port}"\n`;

    return `services:
  ${plan.server.name}:
    build: .
    env_file:
      - .env
${ports}    restart: unless-stopped
`;
}

function renderNodeTest(plan: GenerationPlan): string {
    return `import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("manifest matches generated project", () => {
  const manifestPath = resolve(import.meta.dirname, "../makemcp.manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.serverName, ${JSON.stringify(plan.server.name)});
  assert.equal(manifest.toolCount, ${plan.tools.length});
});
`;
}

export function generateNodeProject(plan: GenerationPlan): GeneratedProject {
    const files = new Map<string, string>();
    const manifest = buildManifest(plan);

    files.set("package.json", JSON.stringify({
        name: plan.server.name,
        version: plan.server.version,
        type: "module",
        scripts: {
            build: "tsc",
            start: "node dist/src/index.js",
            dev: "tsx src/index.ts",
            test: "tsx --test tests/**/*.test.ts",
        },
        dependencies: {
            "@modelcontextprotocol/sdk": "^1.0.0",
            dotenv: "^16.4.7",
            zod: "^3.22.0",
        },
        devDependencies: {
            "@types/node": "^20.0.0",
            tsx: "^4.7.0",
            typescript: "^5.3.0",
        },
    }, null, 2));

    files.set("tsconfig.json", JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "./dist",
            rootDir: ".",
        },
        include: ["src/**/*", "tests/**/*"],
    }, null, 2));

    files.set(".env.example", getEnvExample(plan));
    files.set("src/index.ts", renderIndex(plan));
    files.set("makemcp.manifest.json", JSON.stringify(manifest, null, 2));

    if (plan.features.documentation) {
        files.set("README.md", renderReadme(plan));
    }

    if (plan.features.docker) {
        files.set("Dockerfile", renderDockerfile(plan));
        files.set("docker-compose.yml", renderDockerCompose(plan));
        files.set(".dockerignore", "node_modules\ndist\n.env\n");
    }

    if (plan.features.tests) {
        files.set("tests/manifest.test.ts", renderNodeTest(plan));
    }

    return { manifest, files };
}
