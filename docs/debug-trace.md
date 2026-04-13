# Installing and using the debug trace tool

This guide explains how to wire **MCP GUI** to your MCP server’s **`__debug_trace`** tool so the **Executions** tab can show per-tool history. The “installation” is configuration on both sides plus a small amount of server code; there is no separate package to install beyond your normal MCP stack.

## What you get

- MCP GUI **polls** `__debug_trace` (about every 30 seconds while the app is open) and stores results in local SQLite (`data/mcp-gui.db`).
- The **Executions** tab (next to **Run** on each tool) shows imported trace rows filtered by tool name.
- The tool is **hidden** from the normal Tools list once MCP GUI detects it.

## Prerequisites

- **MCP GUI** running (see the root [README](../README.md): `npm ci`, `npm run dev`, open the app URL).
- Your MCP server process must be able to read an environment variable: **`MCP_DEBUG_PASSWORD`**.

## 1. Connect the server in MCP GUI

1. Add your server connection and **Connect** so the tree loads.
2. Use **Refresh** on the API tree if needed so tools are up to date.
3. Open **Edit** for that server.

If the server exposes **`__debug_trace`**, you will see the trace block with **`MCP_DEBUG_PASSWORD=`** and controls to **generate** a password. If the server is disconnected, the tool errors, or the tool is missing, MCP GUI shows an explanation instead of the form.

## 2. Set the password on the server

1. In MCP GUI, **generate** a trace password and copy the value (or use the env line shown).
2. On the machine that runs your MCP server, set the **same** value. Pick one approach:

   **Shell (session only)** — good for a quick test:

   ```bash
   # Unix / macOS (example; use your shell’s export syntax)
   export MCP_DEBUG_PASSWORD="paste-the-value-from-the-gui"

   # Windows (cmd)
   set MCP_DEBUG_PASSWORD=paste-the-value-from-the-gui

   # Windows (PowerShell)
   $env:MCP_DEBUG_PASSWORD = "paste-the-value-from-the-gui"
   ```

   **`.env` file (persistent, local dev)** — if your server loads env from a file (e.g. Python **`python-dotenv`** / `load_dotenv()`, Node **`dotenv`**, or your process manager reads `.env`), add a line next to your server code:

   ```env
   MCP_DEBUG_PASSWORD=paste-the-value-from-the-gui
   ```

   No quotes needed unless the value itself contains spaces. Keep `.env` out of version control (list it in `.gitignore`); treat it like any other secret file.

3. **Restart** the MCP server process so it picks up the variable (or reloads the env file, depending on how you run it).

The password is stored in **plain text** in `data/mcp-gui.db` so the Next.js server can call `__debug_trace`. Treat that database like other local secrets.

## 3. Implement tracing on your server

You need three pieces on the MCP server:

1. **A buffer** — e.g. a module-level list `TRACE: list[dict] = []`.
2. **A tool** named exactly **`__debug_trace`** with a `password: str` argument that:
   - Compares `password` to `os.environ["MCP_DEBUG_PASSWORD"]` (or your framework’s equivalent).
   - On success, returns something like `{"trace": list(TRACE), "size": len(TRACE)}`, then **clears** `TRACE` (same contract as the demo server).
3. **A decorator** (e.g. `@traced("tool", "my_tool_name")`) applied **directly above** each handler, **below** your framework’s `@tool` / `@resource` / `@prompt` decorators so registration still sees the wrapped function. The decorator should support **sync and async** handlers and append one record per call with at least:
   - **`kind`** / **`type`** — e.g. `"tool"`.
   - **`tool`** / **`name`** — logical name (**must match** the tool name in the GUI tree for filtering).
   - **`duration_ms`** — wall time for the handler.
   - **`ok`** — boolean; on failure set `ok: false` and **`error`**.
   - **`input`**, **`output`**, **`timestamp`** — as you need for debugging.

### Reference implementation (FastMCP / Python)

The demo server under `scripts/fastmcp-example/` includes a full **`traced()`** implementation and **`__debug_trace`**. After setting `MCP_DEBUG_PASSWORD`, run the server as in the README, connect MCP GUI to it, and invoke traced tools to see rows on **Executions**.

```bash
cd scripts/fastmcp-example
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
set MCP_DEBUG_PASSWORD=your-generated-secret   # Windows cmd; adjust for your shell
python server.py
```

## 4. Pull traces in the UI

- While MCP GUI stays open, connected servers are polled about every **30 seconds**.
- You can also use **Pull trace now** on **Executions** for an immediate pull.

If no password has been generated yet for that connection, the client skips storing errors for that pull path.

## Security notes

- **`__debug_trace`** returns whatever you put in the trace buffer; do not log production secrets.
- Anyone who can call the tool with the correct password can read and drain the buffer. Prefer **local** or **trusted** networks; add your own network-layer controls if you expose the server more broadly.

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| No trace block in **Edit** server | Server not connected, tree not refreshed, or tool not named `__debug_trace` / not registered. |
| **Unauthorized** from the tool | `MCP_DEBUG_PASSWORD` on the server does not match the value in MCP GUI; restart the server after changing env. |
| Executions empty | Confirm `@traced` is **under** the MCP tool decorator; confirm `name` matches the tool id in the tree; run a tool and wait for poll or use **Pull trace now**. |

For app requirements, development URLs, and the full FastMCP demo (auth, OAuth, headers), see the root [README](../README.md).
