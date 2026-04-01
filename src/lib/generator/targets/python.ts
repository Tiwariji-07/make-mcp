import type {
    GeneratedManifest,
    GeneratedProject,
    GenerationPlan,
    GenerationRequestBody,
    GenerationTool,
} from "../types.ts";
import { getAuthEnvironmentExample, getPythonAuthStrategy } from "../strategies/auth.ts";
import { getPythonTransportRunLine } from "../strategies/transport.ts";
import { toPythonStringLiteral } from "../utils.ts";
import { toPythonType } from "../schema.ts";

function buildManifest(plan: GenerationPlan): GeneratedManifest {
    return {
        generatorVersion: plan.generatorVersion,
        contractVersion: plan.contractVersion,
        language: "python",
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

function getPythonBodyExpression(requestBody: GenerationRequestBody): string {
    if (requestBody.contentKind === "json-raw" || requestBody.contentKind === "text" || requestBody.contentKind === "binary") {
        return requestBody.params[0]?.argName || "body";
    }

    const properties = requestBody.params
        .map((param) => `            ${JSON.stringify(param.sourceName)}: ${param.argName},`)
        .join("\n");

    return `{\n${properties}\n        }`;
}

function renderPythonRequestBody(requestBody?: GenerationRequestBody): {
    setup: string;
    headerLines: string[];
    requestArgs: string[];
} {
    if (!requestBody) {
        return { setup: "", headerLines: [], requestArgs: [] };
    }

    switch (requestBody.contentKind) {
        case "json-object": {
            const setupLines = [
                "    json_body: dict[str, object] = {}",
                ...requestBody.params.map((param) => `    if ${param.argName} is not None:\n        json_body[${JSON.stringify(param.sourceName)}] = ${param.argName}`),
            ];

            return {
                setup: setupLines.join("\n"),
                headerLines: [`    request_headers["Content-Type"] = ${JSON.stringify(requestBody.contentType)}`],
                requestArgs: ["json=json_body"],
            };
        }
        case "json-raw":
            return {
                setup: "",
                headerLines: [`    request_headers["Content-Type"] = ${JSON.stringify(requestBody.contentType)}`],
                requestArgs: [`json=${getPythonBodyExpression(requestBody)}`],
            };
        case "text":
            return {
                setup: "",
                headerLines: [`    request_headers["Content-Type"] = ${JSON.stringify(requestBody.contentType)}`],
                requestArgs: [`content=str(${getPythonBodyExpression(requestBody)} or "")`],
            };
        case "form-urlencoded": {
            const setupLines = [
                "    form_body: dict[str, object] = {}",
                ...requestBody.params.map((param) => `    if ${param.argName} is not None:\n        form_body[${JSON.stringify(param.sourceName)}] = ${param.argName}`),
            ];

            return {
                setup: setupLines.join("\n"),
                headerLines: [`    request_headers["Content-Type"] = ${JSON.stringify(requestBody.contentType)}`],
                requestArgs: ["data=form_body"],
            };
        }
        case "multipart": {
            const setupLines = [
                "    multipart_files: dict[str, tuple[None, str]] = {}",
                ...requestBody.params.map((param) => `    if ${param.argName} is not None:\n        multipart_files[${JSON.stringify(param.sourceName)}] = (None, str(${param.argName}))`),
            ];

            return {
                setup: setupLines.join("\n"),
                headerLines: [],
                requestArgs: ["files=multipart_files"],
            };
        }
        case "binary":
            return {
                setup: "",
                headerLines: [`    request_headers["Content-Type"] = ${JSON.stringify(requestBody.contentType)}`],
                requestArgs: [`content=${getPythonBodyExpression(requestBody)}`],
            };
    }
}

function renderPythonTool(tool: GenerationTool, plan: GenerationPlan): string {
    const authStrategy = getPythonAuthStrategy(plan.auth);
    const pathParams = tool.params.filter((param) => param.location === "path");
    const queryParams = tool.params.filter((param) => param.location === "query");
    const headerParams = tool.params.filter((param) => param.location === "header");
    const cookieParams = tool.params.filter((param) => param.location === "cookie");
    const bodyRender = renderPythonRequestBody(tool.requestBody);

    const signature = tool.params
        .map((param) => `${param.argName}: ${toPythonType(param.type)}${param.required ? "" : " | None = None"}`)
        .join(", ");

    const pathReplacements = pathParams
        .map((param) => `    url = url.replace(${JSON.stringify(`{${param.sourceName}}`)}, str(${param.argName}))`)
        .join("\n");

    const queryLines = queryParams
        .map((param) => `    if ${param.argName} is not None:\n        params[${JSON.stringify(param.sourceName)}] = ${param.argName}`)
        .join("\n");

    const headerLines = headerParams
        .map((param) => `    if ${param.argName} is not None:\n        request_headers[${JSON.stringify(param.sourceName)}] = str(${param.argName})`)
        .join("\n");

    const cookieLines = cookieParams
        .map((param) => `    if ${param.argName} is not None:\n        cookies[${JSON.stringify(param.sourceName)}] = str(${param.argName})`)
        .join("\n");

    const requestArgs = [
        `method=${JSON.stringify(tool.method)}`,
        "url=url",
        "headers=request_headers",
        "params=params",
        "cookies=cookies",
        ...bodyRender.requestArgs,
    ];

    return `@mcp.tool(name=${toPythonStringLiteral(tool.displayName)})
def ${tool.functionName}(${signature}) -> dict:
    """${tool.description.replace(/"""/g, "'''")}"""
    url = f"{API_BASE_URL}${tool.path}"
${pathReplacements ? `${pathReplacements}\n` : ""}    params: dict[str, object] = {}
${queryLines ? `${queryLines}\n` : ""}${authStrategy.applyQuery ? `${authStrategy.applyQuery}\n` : ""}    request_headers = get_headers()
${headerLines ? `${headerLines}\n` : ""}    cookies: dict[str, str] = {}
${cookieLines ? `${cookieLines}\n` : ""}${bodyRender.setup ? `${bodyRender.setup}\n` : ""}${bodyRender.headerLines.length > 0 ? `${bodyRender.headerLines.join("\n")}\n` : ""}    response = client.request(
        ${requestArgs.join(",\n        ")},
    )
    response.raise_for_status()

    if "application/json" in response.headers.get("content-type", ""):
        return response.json()
    return {"text": response.text}
`;
}

function renderServer(plan: GenerationPlan): string {
    const authStrategy = getPythonAuthStrategy(plan.auth);
    const runLine = getPythonTransportRunLine(plan);

    return `"""${plan.server.name} - MCP server generated by MakeMCP ${plan.generatorVersion}"""

import os
import httpx
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", ${JSON.stringify(plan.spec.baseUrl || "https://api.example.com")})
${authStrategy.envDeclarations}

mcp = FastMCP(${JSON.stringify(plan.server.name)})
client = httpx.Client(timeout=30.0)


def get_headers() -> dict:
    """Return HTTP headers for outbound requests."""
    headers: dict[str, str] = {}
${authStrategy.applyHeaders ? `${authStrategy.applyHeaders}\n` : ""}    return headers


${plan.tools.map((tool) => renderPythonTool(tool, plan)).join("\n")}
if __name__ == "__main__":
${runLine}
`;
}

function renderReadme(plan: GenerationPlan): string {
    return `# ${plan.server.name}

Generated by MakeMCP ${plan.generatorVersion}.

## Install

\`\`\`bash
pip install -e .
\`\`\`

## Configure

\`\`\`bash
cp .env.example .env
\`\`\`

## Run

\`\`\`bash
python src/server.py
\`\`\`

## Tools

${plan.tools.map((tool) => `- \`${tool.displayName}\`: ${tool.description}`).join("\n")}
`;
}

function renderDockerfile(plan: GenerationPlan): string {
    return `FROM python:3.11-slim
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
COPY tests ./tests
COPY .env.example ./.env.example
COPY makemcp.manifest.json ./makemcp.manifest.json

RUN pip install -e .

EXPOSE ${plan.server.port}
CMD ["python", "src/server.py"]
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

function renderPythonTest(plan: GenerationPlan): string {
    return `import json
from pathlib import Path


def test_manifest_metadata() -> None:
    manifest_path = Path(__file__).resolve().parents[1] / "makemcp.manifest.json"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["serverName"] == ${JSON.stringify(plan.server.name)}
    assert manifest["toolCount"] == ${plan.tools.length}
`;
}

export function generatePythonProject(plan: GenerationPlan): GeneratedProject {
    const files = new Map<string, string>();
    const manifest = buildManifest(plan);

    files.set("pyproject.toml", `[project]
name = ${JSON.stringify(plan.server.name)}
version = ${JSON.stringify(plan.server.version)}
description = ${JSON.stringify(`MCP server generated by MakeMCP ${plan.generatorVersion}`)}
requires-python = ">=3.10"
dependencies = [
    "fastmcp>=0.1.0",
    "httpx>=0.25.0",
    "python-dotenv>=1.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`);

    files.set(".env.example", getEnvExample(plan));
    files.set("src/server.py", renderServer(plan));
    files.set("src/__init__.py", "");
    files.set("makemcp.manifest.json", JSON.stringify(manifest, null, 2));

    if (plan.features.documentation) {
        files.set("README.md", renderReadme(plan));
    }

    if (plan.features.docker) {
        files.set("Dockerfile", renderDockerfile(plan));
        files.set("docker-compose.yml", renderDockerCompose(plan));
        files.set(".dockerignore", "__pycache__/\n.env\n.pytest_cache/\n");
    }

    if (plan.features.tests) {
        files.set("tests/test_manifest.py", renderPythonTest(plan));
    }

    return { manifest, files };
}
