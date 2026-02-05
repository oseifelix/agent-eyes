"use client";

import { useEffect, useRef } from "react";

const WS_URL = "ws://localhost:3001";
const RECONNECT_DELAY = 3000;

interface ErrorPayload {
    type: "error" | "unhandledrejection" | "crash";
    message: string;
    stack?: string;
    timestamp: number;
    url: string;
}

/**
 * AgentEyesProvider - Captures browser errors and sends them to the AgentEyes MCP server.
 * Only active in development mode.
 * 
 * Usage:
 * ```tsx
 * // In your root layout.tsx
 * import { AgentEyesProvider } from 'agent-eyes/react';
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <AgentEyesProvider />
 *         {children}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function AgentEyesProvider(): null {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Only run in development
        if (process.env.NODE_ENV !== "development") {
            return;
        }

        // --- WebSocket Connection ---
        function connect(): void {
            try {
                wsRef.current = new WebSocket(WS_URL);

                wsRef.current.onclose = () => {
                    reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
                };

                wsRef.current.onerror = () => {
                    wsRef.current?.close();
                };
            } catch {
                reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
            }
        }

        function send(payload: ErrorPayload): void {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify(payload));
            }
        }

        // --- Console.error Interception ---
        const originalConsoleError = console.error;
        console.error = (...args: unknown[]) => {
            const message = args.map(a =>
                a instanceof Error ? a.message : String(a)
            ).join(" ");

            const stack = args.find(a => a instanceof Error) instanceof Error
                ? (args.find(a => a instanceof Error) as Error).stack
                : undefined;

            send({
                type: "error",
                message,
                stack,
                timestamp: Date.now(),
                url: window.location.href,
            });

            originalConsoleError.apply(console, args);
        };

        // --- Global Error Handler ---
        const handleError = (event: ErrorEvent): void => {
            send({
                type: "crash",
                message: event.message,
                stack: event.error?.stack,
                timestamp: Date.now(),
                url: window.location.href,
            });
        };

        // --- Unhandled Promise Rejection ---
        const handleRejection = (event: PromiseRejectionEvent): void => {
            const error = event.reason;
            send({
                type: "unhandledrejection",
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: Date.now(),
                url: window.location.href,
            });
        };

        // Start connection
        connect();
        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);

        // Cleanup
        return () => {
            console.error = originalConsoleError;
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            wsRef.current?.close();
        };
    }, []);

    return null;
}

export default AgentEyesProvider;
