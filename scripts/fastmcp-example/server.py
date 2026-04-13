"""
Feature-rich demo MCP server (FastMCP): tools, resources, prompts, structured data,
and optional HTTP auth.

  python server.py
  python server.py --auth=true

With --auth=true, /mcp requires Authorization: Bearer <token>.
Demo bearer tokens: demo-admin, demo-readonly, partner-service-key

OAuth 2 client_credentials (for MCP GUI "OAuth 2 manual"):
  POST http://127.0.0.1:8765/oauth/token
  Content-Type: application/x-www-form-urlencoded
  grant_type=client_credentials&client_id=mcp-demo-client&client_secret=mcp-demo-secret

Returns access_token oauth-cc-demo-token (also accepted as a Bearer token when --auth=true).

Stdio: MCP_HTTP=0 python server.py
"""

from __future__ import annotations

import argparse
import functools
import inspect
import json
import os
import sys
import time
from typing import Any, Callable, Literal

from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from fastmcp import FastMCP
from fastmcp.prompts import Message

from dotenv import load_dotenv

load_dotenv()

# ── OAuth / bearer demo secrets ─────────────────────────────────────────────
DEMO_CLIENT_ID = "mcp-demo-client"
DEMO_CLIENT_SECRET = "mcp-demo-secret"
OAUTH_CC_ACCESS_TOKEN = "oauth-cc-demo-token"

# When --auth=true, any of these Bearer values is accepted
DEMO_BEARER_TOKENS: dict[str, str] = {
    "demo-admin": "role:admin",
    "demo-readonly": "role:readonly",
    "partner-service-key": "role:partner",
    OAUTH_CC_ACCESS_TOKEN: "role:oauth2-client",
}

mcp = FastMCP("Demo MCP (full surface)")

# ── Optional tracing for MCP GUI (Executions tab + __debug_trace) ────────────
# Set MCP_DEBUG_PASSWORD to the same value the GUI shows after "Generate trace password".
TRACE: list[dict[str, Any]] = []


def traced(kind: str, name: str):
    """
    Record each invocation (sync or async) for MCP GUI.
    Apply *below* @mcp.tool / @mcp.resource / @mcp.prompt so the outer decorator is MCP's.
    """

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


@mcp.tool
async def __debug_trace(password: str) -> dict:
    if password != os.environ.get("MCP_DEBUG_PASSWORD"):
        raise Exception("Unauthorized")

    trace = list(TRACE)
    TRACE.clear()

    return {
        "trace": trace,
        "size": len(trace),
    }

# ── Tools: scalars, enums, nested objects, arrays, optional fields ────────────


@mcp.tool
@traced("tool", "wait")
def wait(delay: int = 5) -> str:
    """Wait for a given number of seconds."""
    time.sleep(delay)
    return "ok"


@mcp.tool
@traced("tool", "add_integers")
def add_integers(a: int, b: int) -> int:
    """Add two integers."""
    return a + b


@mcp.tool
@traced("tool", "log_event")
def log_event(
    level: Literal["debug", "info", "warn", "error"],
    message: str,
    tags: list[str] | None = None,
    meta: dict[str, str] | None = None,
) -> dict:
    """
    Structured logging-style tool: enum level, optional list and nested dict.
    """
    return {
        "level": level,
        "message": message,
        "tags": tags or [],
        "meta": meta or {},
        "accepted": True,
    }


@mcp.tool
@traced("tool", "user_profile_snapshot")
def user_profile_snapshot(user_id: str, include_orders: bool = False) -> dict:
    """Returns nested JSON (profile + optional fake orders)."""
    profile = {
        "user_id": user_id,
        "display_name": f"User {user_id}",
        "contact": {"email": f"{user_id}@example.invalid", "phone": None},
        "stats": {"logins": 42, "score": 98.6},
    }
    if include_orders:
        profile["orders"] = [
            {"id": "o1", "total": 19.99, "lines": [{"sku": "A", "qty": 1}]},
            {"id": "o2", "total": 4.5, "lines": [{"sku": "B", "qty": 3}]},
        ]
    return profile


@mcp.tool
@traced("tool", "matrix_sum")
def matrix_sum(rows: list[list[float]]) -> dict:
    """Accepts a 2D array; returns sums per row and grand total."""
    row_sums = [sum(r) for r in rows]
    return {"row_sums": row_sums, "grand_total": sum(row_sums), "num_rows": len(rows)}


@mcp.tool
@traced("tool", "describe_mcp_content_kinds")
def describe_mcp_content_kinds() -> str:
    """Text reference for MCP content types this server exercises elsewhere."""
    return (
        "MCP tool results may include text, image, or embedded resource parts. "
        "This demo uses text + JSON-like dict returns, static/template resources, "
        "and parameterized prompts."
    )


# ── Resources ───────────────────────────────────────────────────────────────


@mcp.resource("demo://static/manifest")
@traced("resource", "resource_manifest")
def resource_manifest() -> str:
    """Static text resource (JSON string)."""
    return json.dumps(
        {
            "name": "demo-manifest",
            "version": "1.0.0",
            "capabilities": ["tools", "resources", "prompts"],
        },
        indent=2,
    )


@mcp.resource("demo://note/{name}")
@traced("resource", "resource_note")
def resource_note(name: str) -> str:
    """Template resource URI with a path parameter."""
    return f"# Note: {name}\n\nThis is generated content for the `{name}` key."


@mcp.resource("demo://blob/sample")
@traced("resource", "resource_sample_blob")
def resource_sample_blob() -> str:
    """Plain-text resource advertised as blob-like sample content."""
    return "sample-bytes-demo\nline2\n"


# ── Prompts ─────────────────────────────────────────────────────────────────


@mcp.prompt
@traced("prompt", "summarize_topic")
def summarize_topic(topic: str, audience: str = "engineer") -> str:
    """Single user message template with an optional argument default."""
    return (
        f"You are writing for a {audience} audience.\n"
        f"Summarize the following topic in 3 bullet points: {topic}"
    )


@mcp.prompt
@traced("prompt", "code_review_request")
def code_review_request(language: str, code: str) -> str:
    """Two required string arguments (code review)."""
    return (
        f"Review this {language} code for bugs and style.\n\n"
        f"```{language}\n{code}\n```"
    )


@mcp.prompt
@traced("prompt", "onboarding_conversation")
def onboarding_conversation(user_name: str) -> list[Message]:
    """Multi-message prompt (user + assistant roles)."""
    return [
        Message(f"Welcome {user_name}. What do you want to automate today?"),
        Message(
            "I can help you design tools, resources, and prompts for MCP.",
            role="assistant",
        ),
    ]


# ── HTTP stack: OAuth token + optional bearer gate ───────────────────────────


async def oauth_token_endpoint(request: Request) -> JSONResponse:
    form = await request.form()
    if form.get("grant_type") != "client_credentials":
        return JSONResponse(
            {"error": "unsupported_grant_type"},
            status_code=400,
        )
    cid = form.get("client_id")
    csec = form.get("client_secret")
    if cid != DEMO_CLIENT_ID or csec != DEMO_CLIENT_SECRET:
        return JSONResponse({"error": "invalid_client"}, status_code=401)
    return JSONResponse(
        {
            "access_token": OAUTH_CC_ACCESS_TOKEN,
            "token_type": "Bearer",
            "expires_in": 3600,
        }
    )


async def oauth_protected_resource_metadata(_request: Request) -> JSONResponse:
    """Minimal stub so MCP OAuth clients can discover an authorization server URL."""
    base = str(_request.base_url).rstrip("/")
    return JSONResponse(
        {
            "resource": f"{base}/mcp",
            "authorization_servers": [base],
            "scopes_supported": ["mcp.read"],
            "bearer_methods_supported": ["header"],
        }
    )


class BearerAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, valid_tokens: set[str]):
        super().__init__(app)
        self._valid = valid_tokens

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path == "/oauth/token" or path.startswith("/.well-known/"):
            return await call_next(request)
        if path.startswith("/mcp"):
            auth = request.headers.get("authorization") or ""
            parts = auth.split(None, 1)
            if len(parts) != 2 or parts[0].lower() != "bearer":
                return JSONResponse(
                    {"error": "invalid_request", "error_description": "Bearer token required"},
                    status_code=401,
                )
            token = parts[1].strip()
            if token not in self._valid:
                return JSONResponse(
                    {"error": "invalid_token", "error_description": "Unknown or revoked token"},
                    status_code=401,
                )
        return await call_next(request)


def build_http_app(*, require_bearer: bool):
    mcp_asgi = mcp.http_app(path="/mcp")
    routes = [
        Route("/oauth/token", endpoint=oauth_token_endpoint, methods=["POST"]),
        Route(
            "/.well-known/oauth-protected-resource",
            endpoint=oauth_protected_resource_metadata,
            methods=["GET"],
        ),
        Route(
            "/.well-known/oauth-protected-resource/mcp",
            endpoint=oauth_protected_resource_metadata,
            methods=["GET"],
        ),
        Mount("/", app=mcp_asgi),
    ]
    # Mounted apps do not run their own lifespan; uvicorn only runs the root app’s.
    # FastMCP’s streamable-http transport must run mcp_asgi.lifespan to start its task group.
    application = Starlette(routes=routes, lifespan=mcp_asgi.lifespan)
    if require_bearer:
        application.add_middleware(
            BearerAuthMiddleware,
            valid_tokens=set(DEMO_BEARER_TOKENS.keys()),
        )
    return application


def main() -> None:
    parser = argparse.ArgumentParser(description="FastMCP demo server")
    parser.add_argument(
        "--auth",
        default="false",
        help='If "true", require Bearer token on /mcp (demo tokens in module docstring)',
    )
    args = parser.parse_args()
    require = str(args.auth).lower() in ("true", "1", "yes", "on")

    raw = os.environ.get("MCP_HTTP", "1").strip().lower()
    use_http = raw not in ("0", "false", "no", "off")

    if not use_http:
        mcp.run()
        return

    try:
        import uvicorn
    except ImportError:
        print("HTTP mode requires uvicorn: pip install uvicorn[standard]", file=sys.stderr)
        sys.exit(1)

    app = build_http_app(require_bearer=require)
    print("MCP HTTP demo — http://127.0.0.1:8765/mcp", flush=True)
    if require:
        print("Bearer required. Try: demo-admin | demo-readonly | partner-service-key", flush=True)
        print(
            f"Or OAuth CC: POST /oauth/token client_id={DEMO_CLIENT_ID} "
            f"client_secret={DEMO_CLIENT_SECRET} → use access_token",
            flush=True,
        )
    else:
        print("Auth off. Use --auth=true to require Bearer.", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8760, log_level="info")


if __name__ == "__main__":
    main()
