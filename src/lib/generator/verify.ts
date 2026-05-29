import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { GeneratedProject, VerificationCheck, VerificationReport } from "./types.ts";

const require = createRequire(import.meta.url);

function resolveTypeScriptCompilerPath(): string {
    const cwdPath = join(process.cwd(), "node_modules", "typescript", "lib", "tsc.js");
    if (existsSync(cwdPath)) {
        return cwdPath;
    }

    return require.resolve("typescript/lib/tsc.js");
}

function writeProjectToTempDir(project: GeneratedProject): string {
    const tempDir = mkdtempSync(join(tmpdir(), "makemcp-project-"));

    for (const [filePath, content] of project.files) {
        const absolutePath = join(tempDir, filePath);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content, "utf8");
    }

    return tempDir;
}

function verifyNoTemplateArtifacts(project: GeneratedProject): VerificationCheck {
    for (const [filePath, content] of project.files) {
        if (content.includes("{{") || content.includes("}}")) {
            return {
                name: "template-artifacts",
                status: "failed",
                details: `Unresolved template placeholder found in ${filePath}`,
            };
        }
    }

    return { name: "template-artifacts", status: "passed" };
}

function verifyProjectShape(project: GeneratedProject): VerificationCheck {
    const requiredFiles = project.manifest.language === "node"
        ? [
            "package.json",
            "tsconfig.json",
            "src/index.ts",
            "src/config.ts",
            "src/mcp/server.ts",
            "src/api/client.ts",
            "src/api/operations.ts",
            "src/api/serialization.ts",
            "makemcp.manifest.json",
        ]
        : ["pyproject.toml", "src/server.py", "makemcp.manifest.json"];

    const missing = requiredFiles.filter((filePath) => !project.files.has(filePath));
    if (missing.length > 0) {
        return {
            name: "project-shape",
            status: "failed",
            details: `Missing required files: ${missing.join(", ")}`,
        };
    }

    return { name: "project-shape", status: "passed" };
}

function createNodeVerificationFiles(tempDir: string) {
    const stubsPath = join(tempDir, "verification-stubs.d.ts");
    const configPath = join(tempDir, "tsconfig.verify.json");

    writeFileSync(stubsPath, `interface ImportMeta { dirname: string; }
declare const process: {
  env: Record<string, string | undefined>;
};
declare const Buffer: {
  from(value: string): {
    toString(encoding: string): string;
  };
};

declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  export class McpServer {
    constructor(config: unknown);
    tool(...args: unknown[]): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {}
}

declare module "@modelcontextprotocol/sdk/server/sse.js" {
  export class SSEServerTransport {
    constructor(path: string, response: unknown);
    sessionId: string;
    onclose?: () => void;
    handlePostMessage(request: unknown, response: unknown): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
  export class StreamableHTTPServerTransport {
    constructor(config: unknown);
    handleRequest(request: unknown, response: unknown): Promise<void>;
  }
}

declare module "zod" {
  export const z: any;
}

declare module "dotenv/config" {}

declare module "http" {
  const http: {
    createServer: (...args: any[]) => {
      listen: (...listenArgs: any[]) => void;
    };
  };
  export default http;
  export function createServer(...args: any[]): {
    listen: (...listenArgs: any[]) => void;
  };
}

declare module "node:test" {
  const test: any;
  export default test;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(...args: any[]): string;
}

declare module "node:path" {
  export function resolve(...args: any[]): string;
}
`, "utf8");

    writeFileSync(configPath, JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: {
            noEmit: true,
            noImplicitAny: false,
        },
        include: ["src/**/*", "tests/**/*", "verification-stubs.d.ts"],
    }, null, 2), "utf8");

    return { configPath };
}

function verifyNodeProject(project: GeneratedProject): VerificationCheck {
    const tempDir = writeProjectToTempDir(project);

    try {
        const packageJson = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf8")) as {
            scripts?: Record<string, string>;
        };

        if (!packageJson.scripts?.build) {
            return {
                name: "node-generated-project",
                status: "failed",
                details: "Generated package.json is missing a build script",
            };
        }

        const { configPath } = createNodeVerificationFiles(tempDir);
        const tscPath = resolveTypeScriptCompilerPath();
        const result = spawnSync(process.execPath, [tscPath, "--noEmit", "-p", configPath], {
            cwd: tempDir,
            encoding: "utf8",
        });

        if (result.error) {
            return {
                name: "node-generated-project",
                status: "skipped",
                details: result.error.message,
            };
        }

        if (result.status !== 0) {
            return {
                name: "node-generated-project",
                status: "failed",
                details: result.stderr || result.stdout || "Generated TypeScript project failed verification",
            };
        }

        return { name: "node-generated-project", status: "passed" };
    } catch (error) {
        return {
            name: "node-generated-project",
            status: "failed",
            details: error instanceof Error ? error.message : "Node project verification failed",
        };
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

function verifyPythonProject(project: GeneratedProject): VerificationCheck {
    const tempDir = writeProjectToTempDir(project);
    const pythonFiles = Array.from(project.files.keys()).filter((filePath) => filePath.endsWith(".py"));

    try {
        const pythonBinary = existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";
        const result = spawnSync(pythonBinary, [
            "-c",
            [
                "import pathlib",
                "sources = [pathlib.Path(p) for p in __import__('sys').argv[1:]]",
                "for source in sources:",
                "    compile(source.read_text(), str(source), 'exec')",
            ].join("\n"),
            ...pythonFiles,
        ], {
            cwd: tempDir,
            encoding: "utf8",
        });

        if (result.error) {
            return {
                name: "python-generated-project",
                status: "skipped",
                details: result.error.message,
            };
        }

        if (result.status !== 0) {
            return {
                name: "python-generated-project",
                status: "failed",
                details: result.stderr || result.stdout || "Generated Python project failed verification",
            };
        }

        return { name: "python-generated-project", status: "passed" };
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

export function verifyGeneratedProject(project: GeneratedProject): VerificationReport {
    const checks: VerificationCheck[] = [];
    checks.push(verifyNoTemplateArtifacts(project));
    checks.push(verifyProjectShape(project));

    if (project.manifest.language === "node") {
        checks.push(verifyNodeProject(project));
    } else {
        checks.push(verifyPythonProject(project));
    }

    return {
        status: checks.some((check) => check.status === "failed") ? "failed" : "passed",
        checks,
    };
}
