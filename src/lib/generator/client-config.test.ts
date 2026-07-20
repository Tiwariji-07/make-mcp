import assert from "node:assert/strict";
import test from "node:test";
import {
    clientConfigLocation,
    detectOperatingSystem,
    isAbsoluteProjectPath,
    joinProjectPath,
    renderClaudeCodeCommand,
    renderConnectionCheck,
    renderMcpClientConfig,
    renderVsCodeClientConfig,
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

test("detects operating systems and returns client-specific config locations", () => {
    assert.equal(detectOperatingSystem("MacIntel"), "macos");
    assert.equal(detectOperatingSystem("Win32"), "windows");
    assert.equal(detectOperatingSystem("Linux x86_64"), "linux");
    assert.equal(clientConfigLocation("claude-desktop", "macos"), "~/Library/Application Support/Claude/claude_desktop_config.json");
    assert.equal(clientConfigLocation("cursor", "windows"), "%USERPROFILE%\\.cursor\\mcp.json");
    assert.equal(clientConfigLocation("vscode", "linux"), "~/.vscode/mcp.json");
});

test("validates absolute project paths per operating system", () => {
    assert.equal(isAbsoluteProjectPath("/Users/demo/server", "macos"), true);
    assert.equal(isAbsoluteProjectPath("relative/server", "linux"), false);
    assert.equal(isAbsoluteProjectPath("C:\\Users\\demo\\server", "windows"), true);
    assert.equal(isAbsoluteProjectPath("/absolute/path/to/server", "macos"), false);
});

test("renders VS Code's servers shape and executable connection checks", () => {
    const input = {
        serverName: "petstore",
        transport: "stdio" as const,
        stdioCommand: "node",
        stdioArgs: ["/tmp/petstore/dist/src/index.js"],
    };
    assert.match(renderVsCodeClientConfig(input), /"servers"/);
    assert.match(renderVsCodeClientConfig(input), /"type": "stdio"/);
    assert.equal(
        renderConnectionCheck(input, "claude-code"),
        "claude mcp get petstore && claude mcp list",
    );
    assert.match(renderConnectionCheck(input, "cursor"), /@modelcontextprotocol\/inspector/);
});
