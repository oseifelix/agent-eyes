#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";

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
// WebSocket Server (receives errors from browser)
// ============================================================================

const WS_PORT = 3001;

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
            // Port already in use - another instance is likely running
            // This is fine, we can still serve MCP requests
            // The browser will connect to the existing WebSocket server
            console.error(`[agent-eyes] Port ${WS_PORT} is already in use.`);
            console.error(`[agent-eyes] Another AgentEyes instance may be running.`);
            console.error(`[agent-eyes] MCP server will still work, but browser errors won't be captured by this instance.`);
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
        { name: "agent-eyes", version: "1.0.2" },
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

startWebSocketServer();
startMcpServer().catch(console.error);
