import type { NormalizedAuth } from "../types.ts";

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
    if (auth.strategy === "apiKeyHeader" || auth.strategy === "apiKeyQuery") {
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
                applyQuery: `    if API_KEY:\n        params[${JSON.stringify(auth.apiKeyName || "api_key")}] = API_KEY`,
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
