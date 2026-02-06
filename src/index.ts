#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";
import { exec } from "child_process";
import { createServer } from "net";

// ============================================================================
// Types
// ============================================================================

interface BrowserError {
    type: "error" | "unhandledrejection" | "crash";
    message: string;
    stack?: string;
    timestamp: number;
    url?: string;
}

// ============================================================================
// Error Buffer (Circular - keeps last 20)
// ============================================================================

const MAX_ERRORS = 20;
const errorBuffer: BrowserError[] = [];

function addError(error: BrowserError): void {
    errorBuffer.push(error);
    if (errorBuffer.length > MAX_ERRORS) {
        errorBuffer.shift();
    }
}

function getErrors(): BrowserError[] {
    return [...errorBuffer];
}

function formatErrorsForDisplay(): string {
    const errors = getErrors();

    if (errors.length === 0) {
        return "No browser errors captured yet. Make sure:\n1. AgentEyesProvider is added to your app\n2. Your app is running in development mode\n3. An error has occurred in the browser";
    }

    return errors
        .map((e, i) => {
            const time = new Date(e.timestamp).toLocaleTimeString();
            const stack = e.stack ? `\n   Stack: ${e.stack.split("\n").slice(0, 3).join("\n          ")}` : "";
            return `[${i + 1}] ${time} | ${e.type.toUpperCase()}\n   ${e.message}${stack}`;
        })
        .join("\n\n");
}

// ============================================================================
// Port Management (Takeover Mode)
// ============================================================================

const WS_PORT = 3001;

function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once("listening", () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

function killNodeProcessOnPort(port: number): Promise<{ killed: boolean; reason: string }> {
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";

        if (isWindows) {
            // Windows: find PID using netstat, verify it's node, then kill
            exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve({ killed: false, reason: "no_process" });
                    return;
                }

                // Parse PID from netstat output (last column)
                const lines = stdout.trim().split("\n");
                const pids = new Set<string>();
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[parts.length - 1];
                    if (pid && /^\d+$/.test(pid)) {
                        pids.add(pid);
                    }
                }

                if (pids.size === 0) {
                    resolve({ killed: false, reason: "no_process" });
                    return;
                }

                // Check if each PID is a node process before killing
                let killed = false;
                let remaining = pids.size;
                let nonNodeFound = false;

                for (const pid of pids) {
                    // Use tasklist to get process name
                    exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (taskErr, taskOut) => {
                        const isNode = taskOut && taskOut.toLowerCase().includes("node");

                        if (isNode) {
                            // It's a node process - safe to kill
                            exec(`taskkill /PID ${pid} /F`, (killErr) => {
                                if (!killErr) killed = true;
                                remaining--;
                                if (remaining === 0) {
                                    resolve({
                                        killed,
                                        reason: killed ? "success" : (nonNodeFound ? "not_node" : "kill_failed")
                                    });
                                }
                            });
                        } else {
                            // Not a node process - don't kill
                            nonNodeFound = true;
                            remaining--;
                            if (remaining === 0) {
                                resolve({
                                    killed,
                                    reason: killed ? "success" : "not_node"
                                });
                            }
                        }
                    });
                }
            });
        } else {
            // Unix/Mac: use lsof to find PID, ps to verify it's node
            exec(`lsof -ti:${port}`, (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve({ killed: false, reason: "no_process" });
                    return;
                }

                const pids = stdout.trim().split("\n").filter(Boolean);
                if (pids.length === 0) {
                    resolve({ killed: false, reason: "no_process" });
                    return;
                }

                // Check each PID to see if it's node
                let killed = false;
                let remaining = pids.length;
                let nonNodeFound = false;

                for (const pid of pids) {
                    exec(`ps -p ${pid} -o comm=`, (psErr, psOut) => {
                        const isNode = psOut && psOut.trim().toLowerCase().includes("node");

                        if (isNode) {
                            exec(`kill -9 ${pid}`, (killErr) => {
                                if (!killErr) killed = true;
                                remaining--;
                                if (remaining === 0) {
                                    resolve({
                                        killed,
                                        reason: killed ? "success" : (nonNodeFound ? "not_node" : "kill_failed")
                                    });
                                }
                            });
                        } else {
                            nonNodeFound = true;
                            remaining--;
                            if (remaining === 0) {
                                resolve({
                                    killed,
                                    reason: killed ? "success" : "not_node"
                                });
                            }
                        }
                    });
                }
            });
        }
    });
}

async function ensurePortAvailable(): Promise<void> {
    const portInUse = await isPortInUse(WS_PORT);

    if (portInUse) {
        console.error(`[agent-eyes] Port ${WS_PORT} is in use. Checking process...`);
        const result = await killNodeProcessOnPort(WS_PORT);

        if (result.killed) {
            console.error(`[agent-eyes] Successfully terminated previous Node.js instance.`);
            // Wait briefly for port to be released
            await new Promise(resolve => setTimeout(resolve, 500));
        } else if (result.reason === "not_node") {
            console.error(`[agent-eyes] Port ${WS_PORT} is used by a non-Node.js process.`);
            console.error(`[agent-eyes] AgentEyes will not kill it. Please free the port manually.`);
        } else {
            console.error(`[agent-eyes] Could not determine process on port ${WS_PORT}.`);
        }
    }
}

// ============================================================================
// WebSocket Server (receives errors from browser)
// ============================================================================

function startWebSocketServer(): void {
    const wss = new WebSocketServer({ port: WS_PORT });

    wss.on("connection", (ws: WebSocket) => {
        ws.on("message", (data: Buffer) => {
            try {
                const error = JSON.parse(data.toString()) as BrowserError;
                if (error.message && error.timestamp) {
                    addError(error);
                }
            } catch {
                // Ignore malformed messages
            }
        });
    });

    wss.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`[agent-eyes] Port ${WS_PORT} still in use after takeover attempt.`);
            console.error(`[agent-eyes] Browser errors won't be captured by this instance.`);
        } else {
            console.error(`[agent-eyes] WebSocket server error:`, err.message);
        }
    });

    wss.on("listening", () => {
        // Server started successfully - silent in normal operation
    });
}

// ============================================================================
// MCP Server (communicates with IDE via Stdio)
// ============================================================================

async function startMcpServer(): Promise<void> {
    const server = new Server(
        { name: "agent-eyes", version: "1.0.6" },
        { capabilities: { tools: {} } }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: "get_browser_logs",
                description:
                    "Get the last 20 console errors, crashes, and unhandled exceptions from the user's browser. Use this to debug issues the user is experiencing in their web application.",
                inputSchema: {
                    type: "object" as const,
                    properties: {},
                    required: [],
                },
            },
        ],
    }));

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "get_browser_logs") {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: formatErrorsForDisplay(),
                    },
                ],
            };
        }

        return {
            content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
            isError: true,
        };
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    // Ensure port is available (kill zombie if needed)
    await ensurePortAvailable();

    // Start WebSocket server for browser telemetry
    startWebSocketServer();

    // Start MCP server for IDE communication
    await startMcpServer();
}

main().catch(console.error);

