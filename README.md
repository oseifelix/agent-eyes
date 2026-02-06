# 👁️ AgentEyes

[![npm version](https://img.shields.io/npm/v/agent-eyes.svg)](https://www.npmjs.com/package/agent-eyes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Let your AI coding agent see your browser's console errors in real-time.**

AgentEyes bridges the gap between your development browser and AI coding assistants. Instead of copy-pasting error messages, your AI can now directly query what's happening in your browser.

---

## 🎯 The Problem

When debugging web apps, you often need to:
1. See an error in your browser console
2. Copy it manually
3. Paste it to your AI assistant
4. Wait for a response

**AgentEyes eliminates steps 1-3.** Your AI assistant can now directly ask: *"What errors are in the browser?"*

---

## 🔧 How It Works

```
┌─────────────────┐    WebSocket     ┌─────────────────┐    Stdio/MCP    ┌─────────────────┐
│   Your Browser  │ ───────────────► │  AgentEyes      │ ◄────────────── │   AI Agent      │
│   (Next.js app) │   Port 3001      │  Server         │                 │   (IDE)         │
└─────────────────┘                  └─────────────────┘                 └─────────────────┘
```

1. **Your browser** sends errors to AgentEyes via WebSocket (port 3001)
2. **AgentEyes server** stores the last 20 errors in memory
3. **Your AI agent** queries errors using the `get_browser_logs` MCP tool

---

## 📋 Prerequisites

Before you start, make sure you have:
- ✅ **Node.js 18+** installed ([download here](https://nodejs.org/))
- ✅ **An AI-powered IDE** that supports MCP (VS Code, Cursor, Windsurf, or AntiGravity)
- ✅ **A Next.js 13+ app** (or any React app)

---

## 🚀 Quick Start (3 Steps)

### Step 1: Install the Package

Open your terminal and run:

```bash
npm install agent-eyes
```

### Step 2: Add AgentEyes to Your IDE

Choose your IDE below and follow the instructions:

<details>
<summary><b>VS Code</b> (with MCP extension)</summary>

Create or edit `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

Edit your Cursor MCP settings at `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes"]
    }
  }
}
```

Then restart Cursor.
</details>

<details>
<summary><b>AntiGravity</b></summary>

Click on **Manage MCPs** in AntiGravity, then click **View raw config** and add:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes"]
    }
  }
}
```

Click **Refresh** to apply.
</details>

<details>
<summary><b>Windsurf</b></summary>

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type **"Open Windsurf Settings"** → Navigate to **Advanced → Cascade**
3. Click **"View raw config"** to open `~/.codeium/windsurf/mcp_config.json`
4. Add the following:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes"]
    }
  }
}
```

5. Click the **MCP servers button** (hammer icon) and hit **Refresh**
</details>

### Step 3: Add the React Component to Your App

In your Next.js app, edit `app/layout.tsx` (or create it):

```tsx
import { AgentEyesProvider } from 'agent-eyes/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AgentEyesProvider>
          {children}
        </AgentEyesProvider>
      </body>
    </html>
  );
}
```

> 💡 **Don't worry about production!** The component automatically disables itself when `NODE_ENV` is not `"development"`. It adds zero overhead to your production builds.

---

## ✅ Test It's Working

1. **Start your Next.js app** in development mode:
   ```bash
   npm run dev
   ```

2. **Open your browser** and navigate to your app (usually `http://localhost:3000`)

3. **Trigger a test error** in the browser console (F12 → Console):
   ```javascript
   console.error("Test error from AgentEyes!")
   ```

4. **Ask your AI agent**:
   > "Check my browser for any errors"

If everything is set up correctly, your AI will respond with the test error!

---

## 💬 Usage Examples

Once set up, you can ask your AI assistant things like:

- *"What errors are showing in my browser?"*
- *"Check the browser console for any issues"*
- *"Are there any unhandled exceptions in my app?"*
- *"Debug my frontend - what's going wrong?"*

The AI will use the `get_browser_logs` tool to fetch errors including:
- ❌ `console.error()` calls
- 💥 Uncaught exceptions (`window.onerror`)
- ⚠️ Unhandled promise rejections

---

## 🔍 API Reference

### Tool: `get_browser_logs`

Returns the last 20 browser errors with:

| Field | Description |
|-------|-------------|
| Timestamp | When the error occurred |
| Type | `error`, `crash`, or `unhandledrejection` |
| Message | The error message |
| Stack | First 3 lines of the stack trace |
| URL | The page where the error occurred |

---

## 🛠️ Troubleshooting

### "Port 3001 is already in use"

AgentEyes automatically handles this! On startup, it will:
- Detect if another **Node.js process** is using port 3001
- Terminate the old instance (e.g., a zombie AgentEyes process)
- Start fresh

If the port is used by a **non-Node.js service** (like Python or Java), AgentEyes will not kill it and will log a warning instead. In this case, you'll need to free the port manually.

### "Cannot find module 'agent-eyes/react'"

Make sure you installed the package:
```bash
npm install agent-eyes
```

### "No browser errors captured yet"

Check that:
1. Your Next.js app is running in **development** mode (`npm run dev`)
2. You added `<AgentEyesProvider />` to your layout
3. An error has actually occurred in the browser

### AI says "Unknown tool: get_browser_logs"

Your IDE hasn't loaded the MCP server. Try:
1. Restart your IDE
2. Check your MCP config file for typos
3. Look for MCP errors in your IDE's output panel

---

## 🏗️ Development

Want to contribute or run locally?

```bash
# Clone the repository
git clone https://github.com/oseifelix/agent-eyes.git
cd agent-eyes

# Install dependencies
npm install

# Build the TypeScript
npm run build

# Run the server
npm start
```

---

## 📄 License

MIT © 2024

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

**Made with ❤️ for the AI-assisted development community**
