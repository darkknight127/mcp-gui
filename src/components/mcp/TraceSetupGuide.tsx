"use client";

import { useState, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";

hljs.registerLanguage("python", python);

const SNIPPET_IMPORTS = `import functools
import inspect
import os
import time
from typing import Any, Callable`;

const SNIPPET_TRACE_BUFFER = `${SNIPPET_IMPORTS}

TRACE: list[dict[str, Any]] = []


def traced(kind: str, name: str):
    """Apply *below* @mcp.tool so FastMCP registers the outer wrapper."""

    def decorator(fn: Callable):
        def record(ok: bool, duration_ms: float, args: tuple, kwargs: dict, out: Any, err: Any):
            TRACE.append(
                {
                    "kind": kind,
                    "name": name,
                    "ok": ok,
                    "duration_ms": round(duration_ms, 3),
                    "input": {
                        "args": [repr(a)[:500] for a in args],
                        "kwargs": {k: repr(v)[:500] for k, v in kwargs.items()},
                    },
                    "output": out,
                    "error": None if ok else repr(err),
                    "timestamp": time.time(),
                }
            )

        if inspect.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def awrapper(*args, **kwargs):
                t0 = time.perf_counter()
                try:
                    out = await fn(*args, **kwargs)
                    record(True, (time.perf_counter() - t0) * 1000, args, kwargs, out, None)
                    return out
                except Exception as e:
                    record(False, (time.perf_counter() - t0) * 1000, args, kwargs, None, e)
                    raise

            return awrapper

        @functools.wraps(fn)
        def swrapper(*args, **kwargs):
            t0 = time.perf_counter()
            try:
                out = fn(*args, **kwargs)
                record(True, (time.perf_counter() - t0) * 1000, args, kwargs, out, None)
                return out
            except Exception as e:
                record(False, (time.perf_counter() - t0) * 1000, args, kwargs, None, e)
                raise

        return swrapper

    return decorator
`;

const SNIPPET_DEBUG_TOOL = `@mcp.tool
async def __debug_trace(password: str) -> dict:
    if password != os.environ.get("MCP_DEBUG_PASSWORD"):
        raise Exception("Unauthorized")

    trace = list(TRACE)
    TRACE.clear()

    return {"trace": trace, "size": len(trace)}
`;

const SNIPPET_TOOL_ORDER = `@mcp.tool
@traced("tool", "add_integers")
def add_integers(a: int, b: int) -> int:
    return a + b
`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(
    () => hljs.highlight(code, { language: "python" }).value,
    [code]
  );
  function copy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="trace-setup-code-block">
      <div className="trace-setup-code-head">
        <span className="trace-setup-code-title">{title}</span>
        <button type="button" className="copy-btn trace-setup-copy" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="trace-setup-pre">
        <code
          className="hljs language-python"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

export function TraceSetupGuide() {
  return (
    <div className="trace-setup-guide">
      <p className="trace-setup-lead">
        MCP GUI looks for a tool named{" "}
        <code className="inline-code">__debug_trace</code> on your server. It is hidden from the
        normal <strong>Tools</strong> tree. When that tool exists, you can pull structured steps
        (tools, resources, prompts) into this Trace log.
      </p>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">1. Shared secret</h3>
        <p>
          Set an environment variable{" "}
          <code className="inline-code">MCP_DEBUG_PASSWORD</code> where the MCP process runs. In MCP
          GUI, open <strong>Edit MCP Server</strong> → generate a trace password and use the{" "}
          <strong>same</strong> value on the server. The GUI sends that password when calling{" "}
          <code className="inline-code">__debug_trace</code>.
        </p>
      </section>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">2. Where to add code</h3>
        <p>
          Add the buffer, decorator, and tool in the same module where you create{" "}
          <code className="inline-code">FastMCP(...)</code> and register handlers—typically your main{" "}
          <code className="inline-code">server.py</code> (or equivalent).
        </p>
      </section>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">3. In-memory buffer and the <code className="inline-code">traced</code> decorator</h3>
        <p>
          Keep a module-level list (e.g. <code className="inline-code">TRACE</code>) that each
          invocation appends to. The <code className="inline-code">traced(kind, name)</code>{" "}
          decorator wraps your function to record timing, success/failure, inputs, and output or
          error. Use <code className="inline-code">kind</code> values such as{" "}
          <code className="inline-code">&quot;tool&quot;</code>,{" "}
          <code className="inline-code">&quot;resource&quot;</code>, or{" "}
          <code className="inline-code">&quot;prompt&quot;</code>; <code className="inline-code">name</code>{" "}
          should match the logical name shown in the MCP surface.
        </p>
        <p>
          <strong>Decorator order (Python):</strong> put <code className="inline-code">@mcp.tool</code>{" "}
          <em>above</em> <code className="inline-code">@traced(...)</code>, with the{" "}
          <code className="inline-code">def</code> last. Decorators apply from the bottom up, so
          FastMCP&apos;s registration wraps the outside and your tracer wraps the actual handler
          body—the entrypoint the MCP client calls stays the FastMCP-generated one.
        </p>
        <CodeBlock title="Imports + TRACE buffer + traced decorator (full)" code={SNIPPET_TRACE_BUFFER} />
      </section>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">4. The <code className="inline-code">__debug_trace</code> tool</h3>
        <p>
          Expose exactly this tool name. It must accept a string argument{" "}
          <code className="inline-code">password</code>, validate it against{" "}
          <code className="inline-code">MCP_DEBUG_PASSWORD</code>, return a JSON object with a{" "}
          <code className="inline-code">trace</code> array (and optionally clear the buffer after
          copying). Each trace element should include fields the GUI can map to rows, e.g.{" "}
          <code className="inline-code">kind</code>, <code className="inline-code">name</code>,{" "}
          <code className="inline-code">ok</code>, <code className="inline-code">duration_ms</code>,{" "}
          <code className="inline-code">error</code>, <code className="inline-code">timestamp</code>.
        </p>
        <CodeBlock title="Minimal __debug_trace (FastMCP)" code={SNIPPET_DEBUG_TOOL} />
      </section>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">5. Wrap your handlers</h3>
        <p>
          Add <code className="inline-code">@traced(...)</code> under each{" "}
          <code className="inline-code">@mcp.tool</code> (and similarly for resources/prompts if
          you trace those).
        </p>
        <CodeBlock title="Tool with correct decorator order" code={SNIPPET_TOOL_ORDER} />
      </section>

      <section className="detail-section trace-setup-section">
        <h3 className="section-title">6. Finish in MCP GUI</h3>
        <p>
          Restart the MCP server, click refresh on the connection, then open this Trace log again.
          You should see the pull controls. Use <strong>Pull trace</strong> (or wait for the
          background poll) to import steps.
        </p>
        <p className="muted trace-setup-footnote">
          Reference implementation:{" "}
          <code className="inline-code">scripts/fastmcp-example/server.py</code> in this repo
          (full <code className="inline-code">traced</code> body, async/sync, and sample tools).
        </p>
      </section>
    </div>
  );
}
