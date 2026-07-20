import assert from "node:assert/strict";
import test from "node:test";
import {
    joinProjectPath,
    renderClaudeCodeCommand,
    renderMcpClientConfig,
} from "./client-config.ts";

test("stdio client config uses the supplied absolute project path", () => {
    const entrypoint = joinProjectPath("/Users/demo/My MCP", "dist/src/index.js");
    const config = renderMcpClientConfig({
        serverName: "petstore",
        transport: "stdio",
        stdioCommand: "node",
        stdioArgs: [entrypoint],
        env: { API_BASE_URL: "https://example.com" },
    });

    assert.match(config, /"\/Users\/demo\/My MCP\/dist\/src\/index\.js"/);
    assert.doesNotMatch(config, /"dist\/src\/index\.js"/);
    assert.equal(
        renderClaudeCodeCommand({
            serverName: "petstore",
            transport: "stdio",
            stdioCommand: "node",
            stdioArgs: [entrypoint],
        }),
        "claude mcp add petstore -- node '/Users/demo/My MCP/dist/src/index.js'",
    );
});

test("project paths preserve Windows separators", () => {
    assert.equal(
        joinProjectPath("C:\\Users\\demo\\petstore", "src/server.py"),
        "C:\\Users\\demo\\petstore\\src\\server.py",
    );
});

test("remote client config contains only the server URL", () => {
    const config = renderMcpClientConfig({
        serverName: "petstore",
        transport: "http",
        transportUrl: "http://localhost:8080",
        env: { SHOULD_NOT_APPEAR: "secret" },
    });

    assert.match(config, /"url": "http:\/\/localhost:8080"/);
    assert.doesNotMatch(config, /SHOULD_NOT_APPEAR/);
});
