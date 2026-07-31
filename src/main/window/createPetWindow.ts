import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "../../shared/defaultConfig";
import { resourcesDirectory } from "../paths";

export function createPetWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width, height, margin, backgroundColor } = DEFAULT_CONFIG.window;
  const window = new BrowserWindow({
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - margin,
    y: display.workArea.y + display.workArea.height - height - margin,
    title: DEFAULT_CONFIG.applicationName,
    icon: join(resourcesDirectory(), "cat.ico"),
    transparent: true,
    frame: false,
    backgroundColor,
    alwaysOnTop: true,
    // The frameless window has no resize handles, but the app itself needs to
    // grow it temporarily when chat controls are visible.
    resizable: true,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.setAlwaysOnTop(true, "floating");
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
