/**
 * Starts Next + Electron, or only Electron if port 3001 is already held by
 * a dev-server process whose command line / paths include this repo root.
 */
const net = require("net");
const path = require("path");
const { spawn, execFileSync, execSync } = require("child_process");
const fs = require("fs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.MCP_GUI_PORT || 3001);

function normalizeForCompare(p) {
  if (!p || typeof p !== "string") return "";
  return path.normalize(p).replace(/\\/g, "/").toLowerCase();
}

function projectRootNorm() {
  return normalizeForCompare(PROJECT_ROOT);
}

function textMentionsProject(text) {
  const n = projectRootNorm();
  if (!n) return false;
  return normalizeForCompare(text).includes(n);
}

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(2000, () => {
      s.destroy();
      resolve(false);
    });
  });
}

/** @returns {number[]} */
function listeningPidsWindows(port) {
  const out = execSync("netstat -ano", {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("TCP")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 5) continue;
    const local = parts[1];
    const m = local.match(/:(\d+)$/);
    if (!m || Number(m[1]) !== port) continue;
    const idx = parts.indexOf("LISTENING");
    if (idx < 0 || idx + 1 >= parts.length) continue;
    const pid = parseInt(parts[idx + 1], 10);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** @returns {number[]} */
function listeningPidsUnix(port) {
  try {
    const out = execFileSync(
      "lsof",
      ["-iTCP:" + port, "-sTCP:LISTEN", "-t", "-n", "-P"],
      { encoding: "utf8", windowsHide: true }
    );
    return out
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

/** @returns {{ Name?: string, ExecutablePath?: string, CommandLine?: string, Cwd?: string } | null} */
function getProcessInfoWindows(pid) {
  try {
    const script = `
      $p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"
      if ($null -eq $p) { exit 1 }
      @{
        Name = $p.Name
        ExecutablePath = $p.ExecutablePath
        CommandLine = $p.CommandLine
      } | ConvertTo-Json -Compress
    `.trim();
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-OutputFormat",
        "Text",
        "-Command",
        script,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

/** @returns {{ Name?: string, ExecutablePath?: string, CommandLine?: string, Cwd?: string } | null} */
function getProcessInfoUnix(pid) {
  try {
    const args = execFileSync(
      "ps",
      ["-p", String(pid), "-ww", "-o", "command="],
      { encoding: "utf8", windowsHide: true }
    ).trim();
    const first = args.split(/\s+/)[0] || "";
    const name = path.basename(first.replace(/^-/, ""));
    let cwd = "";
    if (process.platform === "linux") {
      try {
        cwd = fs.realpathSync(path.join("/proc", String(pid), "cwd"));
      } catch {
        /* ignore */
      }
    }
    return {
      Name: name,
      CommandLine: args,
      ExecutablePath: first.startsWith("/") ? first : "",
      Cwd: cwd,
    };
  } catch {
    return null;
  }
}

function getProcessInfo(pid) {
  return process.platform === "win32"
    ? getProcessInfoWindows(pid)
    : getProcessInfoUnix(pid);
}

function isLikelyJsRuntimeName(name) {
  if (!name) return false;
  const base = path.basename(String(name)).toLowerCase();
  return (
    base === "node.exe" ||
    base === "node" ||
    base === "bun.exe" ||
    base === "bun" ||
    base.startsWith("node") ||
    base.startsWith("bun")
  );
}

function isOurMcpGuiListener(info) {
  if (!info) return false;
  if (!isLikelyJsRuntimeName(info.Name)) return false;
  const blob = [info.CommandLine, info.ExecutablePath, info.Cwd]
    .filter(Boolean)
    .join("\n");
  return textMentionsProject(blob);
}

function listeningPids(port) {
  return process.platform === "win32"
    ? listeningPidsWindows(port)
    : listeningPidsUnix(port);
}

function describeListener(pid) {
  const info = getProcessInfo(pid);
  if (!info) return `pid ${pid} (could not read process details)`;
  return `pid ${pid} (${info.Name || "unknown"})`;
}

function prependPathBin(env) {
  const bin = path.join(PROJECT_ROOT, "node_modules", ".bin");
  const sep = path.delimiter;
  return { ...env, PATH: bin + sep + (env.PATH || "") };
}

function runElectron() {
  const env = prependPathBin(process.env);
  const electronCmd = process.platform === "win32" ? "electron.cmd" : "electron";
  spawn(electronCmd, ["desktop"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
}

function runNextAndElectron() {
  const env = prependPathBin(process.env);
  const waitAndElectron = `wait-on tcp:${PORT} && electron desktop`;
  const concurrentlyCmd =
    process.platform === "win32" ? "concurrently.cmd" : "concurrently";
  spawn(
    concurrentlyCmd,
    [
      "-k",
      "-n",
      "next,electron",
      "-c",
      "blue,green",
      "npm run dev",
      waitAndElectron,
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env,
      shell: true,
    }
  );
}

async function main() {
  const open = await isPortListening("127.0.0.1", PORT);
  if (!open) {
    runNextAndElectron();
    return;
  }

  const pids = listeningPids(PORT);
  if (pids.length === 0) {
    console.error(
      `Port ${PORT} appears open but no LISTENING process was found (try running as admin or install lsof on Unix).`
    );
    process.exit(1);
  }

  let ours = false;
  for (const pid of pids) {
    const info = getProcessInfo(pid);
    if (isOurMcpGuiListener(info)) {
      ours = true;
      break;
    }
  }

  if (ours) {
    console.log(
      `Port ${PORT} is already in use by this project (${PROJECT_ROOT}); starting Electron only.`
    );
    runElectron();
    return;
  }

  const detail = pids.map(describeListener).join("; ");
  console.error(
    `Port ${PORT} is in use by another process: ${detail}. Stop that process or pick a different port.`
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
