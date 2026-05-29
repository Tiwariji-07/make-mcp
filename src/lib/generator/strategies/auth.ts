import type { GenerationPlan, NormalizedAuth, ToolAuthSchemePlan } from "../types.ts";

export interface AuthSchemeEnvironmentConfig {
    key: string;
    scheme: ToolAuthSchemePlan;
    apiKeyEnvVar?: string;
    bearerTokenEnvVar?: string;
    basicUsernameEnvVar?: string;
    basicPasswordEnvVar?: string;
}

interface NodeAuthStrategy {
    envDeclarations: string;
    applyHeaders: string;
    applyQuery: string;
}

interface PythonAuthStrategy {
    envDeclarations: string;
    applyHeaders: string;
    applyQuery: string;
}

export function getAuthEnvironmentExample(auth: NormalizedAuth): string {
    if (auth.strategy === "apiKeyHeader" || auth.strategy === "apiKeyQuery" || auth.strategy === "apiKeyCookie") {
        return "\n# API Key\nAPI_KEY=your_api_key_here\n";
    }

    if (auth.strategy === "bearer") {
        return "\n# Bearer Token\nBEARER_TOKEN=your_token_here\n";
    }

    if (auth.strategy === "basic") {
        return "\n# Basic Auth\nBASIC_USERNAME=your_username\nBASIC_PASSWORD=your_password\n";
    }

    return "";
}

function toEnvIdentifier(value: string): string {
    const normalized = value
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
    const safe = normalized || "AUTH";
    return /^[0-9]/.test(safe) ? `AUTH_${safe}` : safe;
}

export function getAuthSchemeKey(scheme: ToolAuthSchemePlan): string {
    return [
        scheme.schemeName,
        scheme.strategy,
        scheme.apiKeyLocation || "",
        scheme.apiKeyName || "",
    ].join(":");
}

function makeUniqueEnvVar(desired: string, seen: Set<string>): string {
    if (!seen.has(desired)) {
        seen.add(desired);
        return desired;
    }

    let counter = 2;
    while (seen.has(`${desired}_${counter}`)) {
        counter += 1;
    }

    const unique = `${desired}_${counter}`;
    seen.add(unique);
    return unique;
}

function getDesiredEnvVars(scheme: ToolAuthSchemePlan): Omit<AuthSchemeEnvironmentConfig, "key" | "scheme"> {
    const base = toEnvIdentifier(scheme.schemeName);

    if (scheme.strategy === "apiKeyHeader" || scheme.strategy === "apiKeyQuery" || scheme.strategy === "apiKeyCookie") {
        return { apiKeyEnvVar: scheme.schemeName === "apiKey" ? "API_KEY" : `${base}_API_KEY` };
    }

    if (scheme.strategy === "bearer") {
        return { bearerTokenEnvVar: scheme.schemeName === "bearer" ? "BEARER_TOKEN" : `${base}_TOKEN` };
    }

    return {
        basicUsernameEnvVar: scheme.schemeName === "basic" ? "BASIC_USERNAME" : `${base}_USERNAME`,
        basicPasswordEnvVar: scheme.schemeName === "basic" ? "BASIC_PASSWORD" : `${base}_PASSWORD`,
    };
}

export function collectAuthSchemes(plan: GenerationPlan): AuthSchemeEnvironmentConfig[] {
    const byKey = new Map<string, ToolAuthSchemePlan>();

    for (const tool of plan.tools) {
        for (const requirement of tool.authStrategy.requirements || []) {
            for (const scheme of requirement.schemes) {
                byKey.set(getAuthSchemeKey(scheme), scheme);
            }
        }
    }

    const seenEnvVars = new Set<string>();
    return Array.from(byKey.entries()).map(([key, scheme]) => {
        const desired = getDesiredEnvVars(scheme);
        return {
            key,
            scheme,
            apiKeyEnvVar: desired.apiKeyEnvVar ? makeUniqueEnvVar(desired.apiKeyEnvVar, seenEnvVars) : undefined,
            bearerTokenEnvVar: desired.bearerTokenEnvVar ? makeUniqueEnvVar(desired.bearerTokenEnvVar, seenEnvVars) : undefined,
            basicUsernameEnvVar: desired.basicUsernameEnvVar ? makeUniqueEnvVar(desired.basicUsernameEnvVar, seenEnvVars) : undefined,
            basicPasswordEnvVar: desired.basicPasswordEnvVar ? makeUniqueEnvVar(desired.basicPasswordEnvVar, seenEnvVars) : undefined,
        };
    });
}

export function getNodeAuthStrategy(auth: NormalizedAuth): NodeAuthStrategy {
    switch (auth.strategy) {
        case "apiKeyHeader":
            return {
                envDeclarations: 'const API_KEY = process.env.API_KEY || "";',
                applyHeaders: `  if (API_KEY) headers[${JSON.stringify(auth.apiKeyName || "X-API-Key")}] = API_KEY;`,
                applyQuery: "",
            };
        case "apiKeyQuery":
            return {
                envDeclarations: 'const API_KEY = process.env.API_KEY || "";',
                applyHeaders: "",
                applyQuery: `      if (API_KEY) queryString.append(${JSON.stringify(auth.apiKeyName || "api_key")}, API_KEY);`,
            };
        case "bearer":
            return {
                envDeclarations: 'const BEARER_TOKEN = process.env.BEARER_TOKEN || "";',
                applyHeaders: '  if (BEARER_TOKEN) headers["Authorization"] = `Bearer ${BEARER_TOKEN}`;',
                applyQuery: "",
            };
        case "basic":
            return {
                envDeclarations: 'const BASIC_USERNAME = process.env.BASIC_USERNAME || "";\nconst BASIC_PASSWORD = process.env.BASIC_PASSWORD || "";',
                applyHeaders: '  if (BASIC_USERNAME || BASIC_PASSWORD) headers["Authorization"] = `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString("base64")}`;',
                applyQuery: "",
            };
        default:
            return {
                envDeclarations: "",
                applyHeaders: "",
                applyQuery: "",
            };
    }
}

export function getPythonAuthStrategy(auth: NormalizedAuth): PythonAuthStrategy {
    switch (auth.strategy) {
        case "apiKeyHeader":
            return {
                envDeclarations: 'API_KEY = os.getenv("API_KEY", "")',
                applyHeaders: `    if API_KEY:\n        headers[${JSON.stringify(auth.apiKeyName || "X-API-Key")}] = API_KEY`,
                applyQuery: "",
            };
        case "apiKeyQuery":
            return {
                envDeclarations: 'API_KEY = os.getenv("API_KEY", "")',
                applyHeaders: "",
                applyQuery: `    if API_KEY:\n        params.append((${JSON.stringify(auth.apiKeyName || "api_key")}, API_KEY))`,
            };
        case "bearer":
            return {
                envDeclarations: 'BEARER_TOKEN = os.getenv("BEARER_TOKEN", "")',
                applyHeaders: '    if BEARER_TOKEN:\n        headers["Authorization"] = f"Bearer {BEARER_TOKEN}"',
                applyQuery: "",
            };
        case "basic":
            return {
                envDeclarations: 'BASIC_USERNAME = os.getenv("BASIC_USERNAME", "")\nBASIC_PASSWORD = os.getenv("BASIC_PASSWORD", "")',
                applyHeaders: '    if BASIC_USERNAME or BASIC_PASSWORD:\n        import base64\n        auth = base64.b64encode(f"{BASIC_USERNAME}:{BASIC_PASSWORD}".encode()).decode()\n        headers["Authorization"] = f"Basic {auth}"',
                applyQuery: "",
            };
        default:
            return {
                envDeclarations: "",
                applyHeaders: "",
                applyQuery: "",
            };
    }
}
