import type {
    GeneratedManifest,
    GeneratedProject,
    GenerationPlan,
    GenerationRequestBody,
    GenerationTool,
    ToolAuthRequirementPlan,
} from "../types.ts";
import { collectAuthSchemes, getAuthSchemeKey } from "../strategies/auth.ts";
import { getPythonTransportRunLine } from "../strategies/transport.ts";
import { renderGeneratedReadme } from "../readme.ts";
import { toPythonStringLiteral } from "../utils.ts";
import { toPythonType } from "../schema.ts";

const FASTMCP_VERSION = "3.3.1";

function renderPythonSerializationOptions(param: GenerationTool["params"][number]): string {
    const style = param.style === undefined ? "None" : JSON.stringify(param.style);
    const explode = param.explode === undefined ? "None" : param.explode ? "True" : "False";
    return `{ "location": ${JSON.stringify(param.location)}, "style": ${style}, "explode": ${explode} }`;
}

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
    const authSchemes = collectAuthSchemes(plan);
    const lines = [`# Base URL for the API`, `API_BASE_URL=${plan.spec.baseUrl || "https://api.example.com"}`];

    if (authSchemes.length > 0) {
        lines.push("", "# Auth");
    }

    for (const auth of authSchemes) {
        if (auth.apiKeyEnvVar) lines.push(`${auth.apiKeyEnvVar}=your_api_key_here`);
        if (auth.bearerTokenEnvVar) lines.push(`${auth.bearerTokenEnvVar}=your_token_here`);
        if (auth.basicUsernameEnvVar) lines.push(`${auth.basicUsernameEnvVar}=your_username`);
        if (auth.basicPasswordEnvVar) lines.push(`${auth.basicPasswordEnvVar}=your_password`);
    }

    return `${lines.join("\n")}\n`;
}

function getPythonBodyExpression(requestBody: GenerationRequestBody): string {
    if (
        requestBody.contentKind === "rawJsonObject" ||
        requestBody.contentKind === "rawArray" ||
        requestBody.contentKind === "text" ||
        requestBody.contentKind === "binary"
    ) {
        return requestBody.params[0]?.argName || "body";
    }

    const properties = requestBody.params
        .map((param) => `            ${JSON.stringify(param.sourceName)}: ${param.argName},`)
        .join("\n");

    return `{\n${properties}\n        }`;
}

function isMultipartBinaryParam(param: GenerationRequestBody["params"][number]): boolean {
    return param.schema?.format === "binary" || param.schema?.type === "file";
}

function renderPythonMultipartAppend(param: GenerationRequestBody["params"][number]): string {
    const sourceName = JSON.stringify(param.sourceName);

    if (!isMultipartBinaryParam(param)) {
        return `    if ${param.argName} is not None:\n        multipart_files[${sourceName}] = (None, str(${param.argName}))`;
    }

    return `    if ${param.argName} is not None:\n        multipart_files[${sourceName}] = (${sourceName}, base64.b64decode(${param.argName}), "application/octet-stream")`;
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
        case "flattenedObject": {
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
        case "rawJsonObject":
        case "rawArray":
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
        case "formUrlencoded": {
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
                "    multipart_files: dict[str, object] = {}",
                ...requestBody.params.map(renderPythonMultipartAppend),
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

function renderPythonAuthRequirements(requirements?: ToolAuthRequirementPlan[]): string {
    if (!requirements?.length) return "[]";

    const renderedRequirements = requirements.map((requirement) => {
        const schemes = requirement.schemes
            .map((scheme) => `AUTH_SCHEMES[${JSON.stringify(getAuthSchemeKey(scheme))}]`)
            .join(", ");
        return `{"schemes": [${schemes}]}`;
    });

    return `[\n        ${renderedRequirements.join(",\n        ")}\n    ]`;
}

function getPythonSignatureParams(tool: GenerationTool): GenerationTool["params"] {
    return [...tool.params].sort((left, right) => Number(right.required) - Number(left.required));
}

function renderPythonOperation(tool: GenerationTool): string {
    const pathParams = tool.params.filter((param) => param.location === "path");
    const queryParams = tool.params.filter((param) => param.location === "query");
    const headerParams = tool.params.filter((param) => param.location === "header");
    const cookieParams = tool.params.filter((param) => param.location === "cookie");
    const bodyRender = renderPythonRequestBody(tool.requestBody);

    const signature = getPythonSignatureParams(tool)
        .map((param) => `${param.argName}: ${toPythonType(param.type)}${param.required ? "" : " | None = None"}`)
        .join(", ");

    const pathReplacements = pathParams
        .map((param) => `    path = path.replace(${JSON.stringify(`{${param.sourceName}}`)}, serialize_path_parameter(${JSON.stringify(param.sourceName)}, ${param.argName}, ${renderPythonSerializationOptions(param)}))`)
        .join("\n");

    const queryLines = queryParams
        .map((param) => `    append_serialized_parameter(params, ${JSON.stringify(param.sourceName)}, ${param.argName}, ${renderPythonSerializationOptions(param)})`)
        .join("\n");

    const headerLines = headerParams
        .map((param) => `    if ${param.argName} is not None:\n        request_headers[${JSON.stringify(param.sourceName)}] = serialize_parameter_value(${JSON.stringify(param.sourceName)}, ${param.argName}, ${renderPythonSerializationOptions(param)})`)
        .join("\n");

    const cookieLines = cookieParams
        .map((param) => `    if ${param.argName} is not None:\n        cookies[${JSON.stringify(param.sourceName)}] = serialize_parameter_value(${JSON.stringify(param.sourceName)}, ${param.argName}, ${renderPythonSerializationOptions(param)})`)
        .join("\n");

    const requestArgs = [
        `method=${JSON.stringify(tool.method)}`,
        "path=path",
        "headers=request_headers",
        "params=params",
        "cookies=cookies",
        ...bodyRender.requestArgs,
    ];

    return `def ${tool.functionName}_operation(${signature}) -> dict:
    path = ${JSON.stringify(tool.path)}
${pathReplacements ? `${pathReplacements}\n` : ""}    params: list[tuple[str, str]] = []
${queryLines ? `${queryLines}\n` : ""}    request_headers: dict[str, str] = {}
${headerLines ? `${headerLines}\n` : ""}    cookies: dict[str, str] = {}
${cookieLines ? `${cookieLines}\n` : ""}${bodyRender.setup ? `${bodyRender.setup}\n` : ""}${bodyRender.headerLines.length > 0 ? `${bodyRender.headerLines.join("\n")}\n` : ""}    apply_auth(
        params=params,
        headers=request_headers,
        cookies=cookies,
        auth_requirements=${renderPythonAuthRequirements(tool.authStrategy.requirements)},
    )
    response = request_api(
        ${requestArgs.join(",\n        ")},
    )
    return response_to_tool_result(response)
`;
}

function renderPythonServerTool(tool: GenerationTool): string {
    const signature = getPythonSignatureParams(tool)
        .map((param) => `${param.argName}: ${toPythonType(param.type)}${param.required ? "" : " | None = None"}`)
        .join(", ");
    const args = getPythonSignatureParams(tool).map((param) => param.argName).join(", ");

    return `@mcp.tool(name=${toPythonStringLiteral(tool.displayName)})
def ${tool.functionName}(${signature}) -> dict:
    """${tool.description.replace(/"""/g, "'''")}"""
    return ${tool.functionName}_operation(${args})
`;
}

function renderServer(plan: GenerationPlan): string {
    const runLine = getPythonTransportRunLine(plan);
    const operationImports = plan.tools
        .map((tool) => `    ${tool.functionName}_operation,`)
        .join("\n");

    return `"""${plan.server.name} - MCP server generated by MakeMCP ${plan.generatorVersion}"""

from __future__ import annotations

from fastmcp import FastMCP
from config import MCP_SERVER_CONFIG
from operations import (
${operationImports}
)


mcp = FastMCP(MCP_SERVER_CONFIG["name"])


${plan.tools.map(renderPythonServerTool).join("\n")}
if __name__ == "__main__":
${runLine}
`;
}

function renderConfig(plan: GenerationPlan): string {
    const authSchemes = collectAuthSchemes(plan);
    const authSchemeEntries = authSchemes.map((auth) => {
        const scheme = auth.scheme;

        if (scheme.strategy === "apiKeyHeader" || scheme.strategy === "apiKeyQuery" || scheme.strategy === "apiKeyCookie") {
            return `    ${JSON.stringify(auth.key)}: {"type": "apiKey", "in": ${JSON.stringify(scheme.apiKeyLocation || "header")}, "name": ${JSON.stringify(scheme.apiKeyName || "X-API-Key")}, "value": os.getenv(${JSON.stringify(auth.apiKeyEnvVar)}, "")},`;
        }

        if (scheme.strategy === "bearer") {
            return `    ${JSON.stringify(auth.key)}: {"type": "bearer", "token": os.getenv(${JSON.stringify(auth.bearerTokenEnvVar)}, "")},`;
        }

        return `    ${JSON.stringify(auth.key)}: {"type": "basic", "username": os.getenv(${JSON.stringify(auth.basicUsernameEnvVar)}, ""), "password": os.getenv(${JSON.stringify(auth.basicPasswordEnvVar)}, "")},`;
    }).join("\n");

    return `from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

API_BASE_URL = os.getenv("API_BASE_URL", ${JSON.stringify(plan.spec.baseUrl || "https://api.example.com")})
AUTH_SCHEMES = {
${authSchemeEntries}
}

MCP_SERVER_CONFIG = {
    "name": ${JSON.stringify(plan.server.name)},
    "version": ${JSON.stringify(plan.server.version)},
    "host": ${JSON.stringify(plan.server.host)},
    "port": ${plan.server.port},
}
`;
}

function renderApiClient(): string {
    return `from __future__ import annotations

import base64
import httpx
from config import API_BASE_URL

client = httpx.Client(timeout=30.0)


AuthScheme = dict[str, object]
AuthRequirement = dict[str, list[AuthScheme]]


def is_auth_scheme_configured(scheme: AuthScheme) -> bool:
    if scheme["type"] == "apiKey":
        return bool(scheme.get("value"))
    if scheme["type"] == "bearer":
        return bool(scheme.get("token"))
    return bool(scheme.get("username") or scheme.get("password"))


def is_auth_requirement_configured(requirement: AuthRequirement) -> bool:
    schemes = requirement.get("schemes", [])
    return all(is_auth_scheme_configured(scheme) for scheme in schemes)


def has_header(headers: dict[str, str], name: str) -> bool:
    normalized_name = name.lower()
    return any(header_name.lower() == normalized_name for header_name in headers)


def apply_auth(
    *,
    params: list[tuple[str, str]],
    headers: dict[str, str],
    cookies: dict[str, str],
    auth_requirements: list[AuthRequirement],
) -> None:
    requirement = next((entry for entry in auth_requirements if is_auth_requirement_configured(entry)), None)
    if requirement is None:
        return

    for scheme in requirement.get("schemes", []):
        if not is_auth_scheme_configured(scheme):
            continue

        if scheme["type"] == "apiKey":
            name = str(scheme["name"])
            if scheme["in"] == "query" and not any(param_name == name for param_name, _ in params):
                params.append((name, str(scheme["value"])))
            elif scheme["in"] == "cookie" and name not in cookies:
                cookies[name] = str(scheme["value"])
            elif scheme["in"] == "header" and not has_header(headers, name):
                headers[name] = str(scheme["value"])
        elif scheme["type"] == "bearer" and not has_header(headers, "Authorization"):
            headers["Authorization"] = f"Bearer {scheme['token']}"
        elif scheme["type"] == "basic" and not has_header(headers, "Authorization"):
            username = str(scheme.get("username", ""))
            password = str(scheme.get("password", ""))
            token = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {token}"


def request_api(
    *,
    method: str,
    path: str,
    headers: dict[str, str],
    params: list[tuple[str, str]],
    cookies: dict[str, str],
    **kwargs: object,
) -> httpx.Response:
    request_kwargs = {key: value for key, value in kwargs.items() if value is not None}
    return client.request(
        method=method,
        url=f"{API_BASE_URL}{path}",
        headers=headers,
        params=params,
        cookies=cookies,
        **request_kwargs,
    )


def response_to_tool_result(response: httpx.Response) -> dict:
    response.raise_for_status()
    if "application/json" in response.headers.get("content-type", ""):
        return response.json()
    return {"text": response.text}
`;
}

function renderSerialization(): string {
    return `from __future__ import annotations

from urllib.parse import quote


def default_parameter_style(location: str) -> str:
    if location in ("path", "header"):
        return "simple"
    return "form"


def should_explode(style: str, explode: bool | None) -> bool:
    return explode if explode is not None else style == "form"


def scalar_to_string(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int, float)):
        return str(value)
    return str(value)


def object_entries(value: object) -> list[tuple[str, object]]:
    if not isinstance(value, dict):
        return []
    return [(str(key), entry_value) for key, entry_value in value.items() if entry_value is not None]


def serialize_parameter_value(name: str, value: object, options: dict) -> str:
    style = options.get("style") or default_parameter_style(options["location"])
    explode = should_explode(style, options.get("explode"))
    delimiter = " " if style == "spaceDelimited" else "|" if style == "pipeDelimited" else ","

    if isinstance(value, list):
        return delimiter.join(scalar_to_string(entry) for entry in value)

    entries = object_entries(value)
    if entries:
        if explode:
            return delimiter.join(f"{key}={scalar_to_string(entry_value)}" for key, entry_value in entries)
        flattened: list[str] = []
        for key, entry_value in entries:
            flattened.extend([key, scalar_to_string(entry_value)])
        return delimiter.join(flattened)

    return scalar_to_string(value)


def serialize_path_parameter(name: str, value: object, options: dict) -> str:
    style = options.get("style") or "simple"
    explode = should_explode(style, options.get("explode"))
    encoded_name = quote(name, safe="")

    def encode(entry: object) -> str:
        return quote(scalar_to_string(entry), safe="")

    if isinstance(value, list):
        encoded_values = [encode(entry) for entry in value]
        if style == "label":
            return "." + ".".join(encoded_values)
        if style == "matrix":
            if explode:
                return "".join(f";{encoded_name}={entry}" for entry in encoded_values)
            return f";{encoded_name}={','.join(encoded_values)}"
        return ",".join(encoded_values)

    entries = object_entries(value)
    if entries:
        if style == "label":
            if explode:
                values = [f"{quote(key, safe='')}={encode(entry_value)}" for key, entry_value in entries]
            else:
                values = [item for key, entry_value in entries for item in (quote(key, safe=""), encode(entry_value))]
            return "." + ".".join(values)
        if style == "matrix":
            if explode:
                return "".join(f";{quote(key, safe='')}={encode(entry_value)}" for key, entry_value in entries)
            values = [item for key, entry_value in entries for item in (quote(key, safe=""), encode(entry_value))]
            return f";{encoded_name}={','.join(values)}"
        if explode:
            values = [f"{quote(key, safe='')}={encode(entry_value)}" for key, entry_value in entries]
        else:
            values = [item for key, entry_value in entries for item in (quote(key, safe=""), encode(entry_value))]
        return ",".join(values)

    encoded_value = encode(value)
    if style == "label":
        return f".{encoded_value}"
    if style == "matrix":
        return f";{encoded_name}={encoded_value}"
    return encoded_value


def append_serialized_parameter(params: list[tuple[str, str]], name: str, value: object, options: dict) -> None:
    if value is None:
        return

    style = options.get("style") or "form"
    explode = should_explode(style, options.get("explode"))

    if isinstance(value, list):
        if style == "form" and explode:
            params.extend((name, scalar_to_string(entry)) for entry in value)
            return
        params.append((name, serialize_parameter_value(name, value, {**options, "style": style, "explode": explode})))
        return

    entries = object_entries(value)
    if entries:
        if style == "deepObject":
            params.extend((f"{name}[{key}]", scalar_to_string(entry_value)) for key, entry_value in entries)
            return
        if style == "form" and explode:
            params.extend((key, scalar_to_string(entry_value)) for key, entry_value in entries)
            return
        params.append((name, serialize_parameter_value(name, value, {**options, "style": style, "explode": explode})))
        return

    params.append((name, scalar_to_string(value)))
`;
}

function renderOperations(plan: GenerationPlan): string {
    const needsBase64 = plan.tools.some((tool) =>
        tool.requestBody?.contentKind === "multipart" &&
        tool.requestBody.params.some(isMultipartBinaryParam)
    );

    return `from __future__ import annotations

${needsBase64 ? "import base64\n" : ""}from api_client import apply_auth, request_api, response_to_tool_result
from config import AUTH_SCHEMES
from serialization import (
    append_serialized_parameter,
    serialize_parameter_value,
    serialize_path_parameter,
)


${plan.tools.map(renderPythonOperation).join("\n")}`;
}

function renderReadme(plan: GenerationPlan): string {
    return renderGeneratedReadme(plan, {
        installCommand: "pip install -e .",
        runCommand: "python src/server.py",
        stdioClientCommand: "python",
        stdioClientArgs: ["src/server.py"],
    });
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

function getPythonTestSchemaType(schema?: Record<string, unknown>): string | undefined {
    const type = schema?.type;
    if (typeof type === "string") return type;
    if (Array.isArray(type)) return type.find((entry): entry is string => typeof entry === "string");
    return undefined;
}

function getPythonTestSampleValue(param: GenerationTool["params"][number]): unknown {
    const schemaType = getPythonTestSchemaType(param.schema);

    if (param.schema?.format === "binary" || schemaType === "file") return "ZmlsZSBjb250ZW50";
    if (schemaType === "array") return ["alpha", "beta"];
    if (schemaType === "object") return { status: "open", owner: "team" };
    if (schemaType === "integer" || schemaType === "number") return 42;
    if (schemaType === "boolean") return true;

    return `${param.argName}-value`;
}

function toPythonLiteral(value: unknown): string {
    if (value === null || value === undefined) return "None";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (Array.isArray(value)) return `[${value.map(toPythonLiteral).join(", ")}]`;
    if (typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .map(([key, entryValue]) => `${JSON.stringify(key)}: ${toPythonLiteral(entryValue)}`)
            .join(", ")}}`;
    }
    return JSON.stringify(String(value));
}

function pythonScalarToExpectedString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "string" || typeof value === "number") return String(value);
    return String(value);
}

function pythonExpectedObjectEntries(value: unknown): [string, unknown][] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => entryValue !== undefined);
}

function pythonExpectedExplode(style: string, explode?: boolean): boolean {
    return explode ?? style === "form";
}

function pythonExpectedSerializedParameterValue(
    name: string,
    value: unknown,
    options: { location: string; style?: string; explode?: boolean }
): string {
    const style = options.style || (options.location === "path" || options.location === "header" ? "simple" : "form");
    const explode = pythonExpectedExplode(style, options.explode);
    const delimiter = style === "spaceDelimited" ? " " : style === "pipeDelimited" ? "|" : ",";

    if (Array.isArray(value)) {
        return value.map(pythonScalarToExpectedString).join(delimiter);
    }

    const entries = pythonExpectedObjectEntries(value);
    if (entries.length > 0) {
        if (explode) {
            return entries.map(([key, entryValue]) => `${key}=${pythonScalarToExpectedString(entryValue)}`).join(delimiter);
        }
        return entries.flatMap(([key, entryValue]) => [key, pythonScalarToExpectedString(entryValue)]).join(delimiter);
    }

    return pythonScalarToExpectedString(value);
}

function pythonExpectedPathParameter(
    name: string,
    value: unknown,
    options: { style?: string; explode?: boolean }
): string {
    const style = options.style || "simple";
    const explode = pythonExpectedExplode(style, options.explode);
    const encode = (entry: unknown) => encodeURIComponent(pythonScalarToExpectedString(entry));
    const encodedName = encodeURIComponent(name);

    if (Array.isArray(value)) {
        const encodedValues = value.map(encode);
        if (style === "label") return `.${encodedValues.join(".")}`;
        if (style === "matrix") {
            return explode
                ? encodedValues.map((entry) => `;${encodedName}=${entry}`).join("")
                : `;${encodedName}=${encodedValues.join(",")}`;
        }
        return encodedValues.join(",");
    }

    const entries = pythonExpectedObjectEntries(value);
    if (entries.length > 0) {
        if (style === "label") {
            const values = explode
                ? entries.map(([key, entryValue]) => `${encodeURIComponent(key)}=${encode(entryValue)}`)
                : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
            return `.${values.join(".")}`;
        }
        if (style === "matrix") {
            if (explode) {
                return entries.map(([key, entryValue]) => `;${encodeURIComponent(key)}=${encode(entryValue)}`).join("");
            }
            const values = entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
            return `;${encodedName}=${values.join(",")}`;
        }
        const values = explode
            ? entries.map(([key, entryValue]) => `${encodeURIComponent(key)}=${encode(entryValue)}`)
            : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
        return values.join(",");
    }

    const encodedValue = encode(value);
    if (style === "label") return `.${encodedValue}`;
    if (style === "matrix") return `;${encodedName}=${encodedValue}`;
    return encodedValue;
}

function pythonExpectedQueryEntries(
    name: string,
    value: unknown,
    options: { style?: string; explode?: boolean }
): [string, string][] {
    const style = options.style || "form";
    const explode = pythonExpectedExplode(style, options.explode);

    if (Array.isArray(value)) {
        if (style === "form" && explode) {
            return value.map((entry) => [name, pythonScalarToExpectedString(entry)]);
        }
        return [[name, pythonExpectedSerializedParameterValue(name, value, { location: "query", style, explode })]];
    }

    const entries = pythonExpectedObjectEntries(value);
    if (entries.length > 0) {
        if (style === "deepObject") {
            return entries.map(([key, entryValue]) => [`${name}[${key}]`, pythonScalarToExpectedString(entryValue)]);
        }
        if (style === "form" && explode) {
            return entries.map(([key, entryValue]) => [key, pythonScalarToExpectedString(entryValue)]);
        }
        return [[name, pythonExpectedSerializedParameterValue(name, value, { location: "query", style, explode })]];
    }

    return [[name, pythonScalarToExpectedString(value)]];
}

function getPythonTestArgs(tool: GenerationTool): Record<string, unknown> {
    return Object.fromEntries(tool.params.map((param) => [param.argName, getPythonTestSampleValue(param)]));
}

function getPythonExpectedPath(tool: GenerationTool, args: Record<string, unknown>): string {
    return tool.params
        .filter((param) => param.location === "path")
        .reduce((path, param) => {
            const replacement = pythonExpectedPathParameter(param.sourceName, args[param.argName], {
                style: param.style,
                explode: param.explode,
            });
            return path.replace(`{${param.sourceName}}`, replacement);
        }, tool.path);
}

function getPythonExpectedQueryEntries(tool: GenerationTool, args: Record<string, unknown>): [string, string][] {
    return tool.params
        .filter((param) => param.location === "query")
        .flatMap((param) => pythonExpectedQueryEntries(param.sourceName, args[param.argName], {
            style: param.style,
            explode: param.explode,
        }));
}

function getPythonExpectedJsonBody(tool: GenerationTool, args: Record<string, unknown>): unknown {
    const requestBody = tool.requestBody;
    if (!requestBody) return undefined;

    if (requestBody.contentKind === "rawJsonObject" || requestBody.contentKind === "rawArray") {
        return args[requestBody.params[0]?.argName || "body"];
    }

    return Object.fromEntries(requestBody.params.map((param) => [param.sourceName, args[param.argName]]));
}

function renderPythonAuthEnvAssignments(plan: GenerationPlan): string {
    const assignments: string[] = [`    monkeypatch.setenv("API_BASE_URL", "https://unit.example.test")`];

    for (const auth of collectAuthSchemes(plan)) {
        if (auth.apiKeyEnvVar) assignments.push(`    monkeypatch.setenv(${JSON.stringify(auth.apiKeyEnvVar)}, "test-api-key")`);
        if (auth.bearerTokenEnvVar) assignments.push(`    monkeypatch.setenv(${JSON.stringify(auth.bearerTokenEnvVar)}, "test-bearer-token")`);
        if (auth.basicUsernameEnvVar) assignments.push(`    monkeypatch.setenv(${JSON.stringify(auth.basicUsernameEnvVar)}, "test-user")`);
        if (auth.basicPasswordEnvVar) assignments.push(`    monkeypatch.setenv(${JSON.stringify(auth.basicPasswordEnvVar)}, "test-pass")`);
    }

    return assignments.join("\n");
}

function renderPythonOperationBehaviorTest(tool: GenerationTool): string {
    const args = getPythonTestArgs(tool);
    const expectedPath = getPythonExpectedPath(tool, args);
    const expectedQueryEntries = getPythonExpectedQueryEntries(tool, args);
    const headerParams = tool.params.filter((param) => param.location === "header");
    const cookieParams = tool.params.filter((param) => param.location === "cookie");
    const requestBody = tool.requestBody;
    const assertions: string[] = [
        `    assert call["method"] == ${JSON.stringify(tool.method)}`,
        `    assert call["url"] == "https://unit.example.test${expectedPath}"`,
        `    for item in ${toPythonLiteral(expectedQueryEntries)}:`,
        `        assert tuple(item) in call["params"]`,
    ];

    for (const param of headerParams) {
        assertions.push(`    assert call["headers"][${JSON.stringify(param.sourceName)}] == ${JSON.stringify(pythonExpectedSerializedParameterValue(param.sourceName, args[param.argName], { location: "header", style: param.style, explode: param.explode }))}`);
    }

    for (const param of cookieParams) {
        assertions.push(`    assert call["cookies"][${JSON.stringify(param.sourceName)}] == ${JSON.stringify(pythonExpectedSerializedParameterValue(param.sourceName, args[param.argName], { location: "cookie", style: param.style, explode: param.explode }))}`);
    }

    if (requestBody?.contentKind === "flattenedObject" || requestBody?.contentKind === "rawJsonObject" || requestBody?.contentKind === "rawArray") {
        assertions.push(`    assert call["headers"]["Content-Type"] == ${JSON.stringify(requestBody.contentType)}`);
        assertions.push(`    assert call["json"] == ${toPythonLiteral(getPythonExpectedJsonBody(tool, args))}`);
    } else if (requestBody?.contentKind === "formUrlencoded") {
        const entries = Object.fromEntries(requestBody.params.map((param) => [param.sourceName, args[param.argName]]));
        assertions.push(`    assert call["headers"]["Content-Type"] == ${JSON.stringify(requestBody.contentType)}`);
        assertions.push(`    assert call["data"] == ${toPythonLiteral(entries)}`);
    } else if (requestBody?.contentKind === "multipart") {
        for (const param of requestBody.params) {
            if (isMultipartBinaryParam(param)) {
                assertions.push(`    assert call["files"][${JSON.stringify(param.sourceName)}][0] == ${JSON.stringify(param.sourceName)}`);
                assertions.push(`    assert call["files"][${JSON.stringify(param.sourceName)}][1] == b"file content"`);
                assertions.push(`    assert call["files"][${JSON.stringify(param.sourceName)}][2] == "application/octet-stream"`);
            } else {
                assertions.push(`    assert call["files"][${JSON.stringify(param.sourceName)}] == (None, ${JSON.stringify(pythonScalarToExpectedString(args[param.argName]))})`);
            }
        }
    } else if (requestBody?.contentKind === "text") {
        assertions.push(`    assert call["headers"]["Content-Type"] == ${JSON.stringify(requestBody.contentType)}`);
        assertions.push(`    assert call["content"] == ${JSON.stringify(pythonScalarToExpectedString(args[requestBody.params[0]?.argName || "body"]))}`);
    } else if (requestBody?.contentKind === "binary") {
        assertions.push(`    assert call["headers"]["Content-Type"] == ${JSON.stringify(requestBody.contentType)}`);
        assertions.push(`    assert call["content"] == args[${JSON.stringify(requestBody.params[0]?.argName || "body")}]`);
    }

    return `def test_${tool.functionName}_operation_builds_api_request(monkeypatch) -> None:
    api_client, operations, _serialization = load_modules(monkeypatch)
    fake_client = FakeClient()
    monkeypatch.setattr(api_client, "client", fake_client)
    args = ${toPythonLiteral(args)}

    operations.${tool.functionName}_operation(**args)

    call = fake_client.calls[-1]
${assertions.join("\n")}`;
}

function renderPythonTest(plan: GenerationPlan): string {
    return `from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))


class FakeResponse:
    def __init__(self, *, status_code: int = 200, text: str = '{"ok": true}', json_body: object | None = None) -> None:
        self.status_code = status_code
        self.text = text
        self.headers = {"content-type": "application/json"}
        self._json_body = {"ok": True} if json_body is None else json_body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}: {self.text}")

    def json(self) -> object:
        return self._json_body


class FakeClient:
    def __init__(self, response: FakeResponse | None = None) -> None:
        self.calls: list[dict[str, object]] = []
        self.response = response or FakeResponse()

    def request(self, **kwargs: object) -> FakeResponse:
        self.calls.append(kwargs)
        return self.response


def load_modules(monkeypatch):
${renderPythonAuthEnvAssignments(plan)}
    import config
    import api_client
    import operations
    import serialization

    importlib.reload(config)
    importlib.reload(api_client)
    importlib.reload(operations)
    importlib.reload(serialization)
    return api_client, operations, serialization


def test_request_api_constructs_urls_and_reports_http_errors(monkeypatch) -> None:
    api_client, _operations, _serialization = load_modules(monkeypatch)
    fake_client = FakeClient()
    monkeypatch.setattr(api_client, "client", fake_client)

    api_client.request_api(
        method="GET",
        path="/reports/alpha",
        headers={"Accept": "application/json"},
        params=[("q", "a b")],
        cookies={"session": "cookie-value"},
    )

    call = fake_client.calls[-1]
    assert call["method"] == "GET"
    assert call["url"] == "https://unit.example.test/reports/alpha"
    assert call["headers"] == {"Accept": "application/json"}
    assert call["params"] == [("q", "a b")]
    assert call["cookies"] == {"session": "cookie-value"}

    with pytest.raises(RuntimeError, match="HTTP 418: teapot"):
        api_client.response_to_tool_result(FakeResponse(status_code=418, text="teapot"))


def test_serialization_helpers_encode_paths_and_queries(monkeypatch) -> None:
    _api_client, _operations, serialization = load_modules(monkeypatch)

    assert serialization.serialize_path_parameter(
        "ids",
        ["a", "b"],
        {"location": "path", "style": "matrix", "explode": True},
    ) == ";ids=a;ids=b"

    params: list[tuple[str, str]] = []
    serialization.append_serialized_parameter(
        params,
        "filter",
        {"status": "open"},
        {"location": "query", "style": "deepObject", "explode": True},
    )
    serialization.append_serialized_parameter(
        params,
        "tags",
        ["a", "b"],
        {"location": "query", "style": "form", "explode": True},
    )
    assert params == [("filter[status]", "open"), ("tags", "a"), ("tags", "b")]


def test_apply_auth_injects_headers_query_parameters_and_cookies(monkeypatch) -> None:
    api_client, _operations, _serialization = load_modules(monkeypatch)
    params: list[tuple[str, str]] = []
    headers: dict[str, str] = {}
    cookies: dict[str, str] = {}

    api_client.apply_auth(
        params=params,
        headers=headers,
        cookies=cookies,
        auth_requirements=[{
            "schemes": [
                {"type": "apiKey", "in": "header", "name": "X-API-Key", "value": "key"},
                {"type": "apiKey", "in": "query", "name": "api_key", "value": "query-key"},
                {"type": "apiKey", "in": "cookie", "name": "session", "value": "cookie-value"},
            ],
        }],
    )

    assert headers["X-API-Key"] == "key"
    assert ("api_key", "query-key") in params
    assert cookies["session"] == "cookie-value"


${plan.tools.map(renderPythonOperationBehaviorTest).join("\n\n")}
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
    "fastmcp==${FASTMCP_VERSION}",
    "httpx>=0.25.0",
    "python-dotenv>=1.0.0",
]
${plan.features.tests ? `
[project.optional-dependencies]
test = ["pytest>=8.0.0"]
` : ""}

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
only-include = ["src"]
sources = ["src"]
`);

    files.set(".env.example", getEnvExample(plan));
    files.set("src/server.py", renderServer(plan));
    files.set("src/config.py", renderConfig(plan));
    files.set("src/api_client.py", renderApiClient());
    files.set("src/operations.py", renderOperations(plan));
    files.set("src/serialization.py", renderSerialization());
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
        files.set("tests/test_behavior.py", renderPythonTest(plan));
    }

    return { manifest, files };
}
