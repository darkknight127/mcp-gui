/** Silence dev CSP warnings from Next’s dev headers (optional: set to "false" to keep warnings). */
if (process.env.MCP_GUI_SUPPRESS_ELECTRON_SECURITY_WARNINGS !== "false") {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}

const { app, BrowserWindow } = require("electron");

/** Match Next dev server default; use MCP_GUI_URL if you need 127.0.0.1. */
const DEFAULT_URL = "http://localhost:3001";
const MAX_ATTEMPTS = 60;
const RETRY_MS = 500;

function appUrl() {
  const raw = process.env.MCP_GUI_URL || DEFAULT_URL;
  try {
    return new URL(raw).href;
  } catch {
    return DEFAULT_URL;
  }
}

/** Next/Turbopack HMR uses WebSocket upgrades; Electron’s default webSecurity breaks the handshake on loopback. */
function shouldRelaxSecurityForUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

async function loadAppUrl(win, url) {
  let lastErr;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
  throw lastErr;
}

function createWindow() {
  const url = appUrl();
  const relax = shouldRelaxSecurityForUrl(url);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !relax,
    },
  });
  loadAppUrl(mainWindow, url).catch((err) => {
    console.error(`Failed to load ${url} after ${MAX_ATTEMPTS} attempts:`, err);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
