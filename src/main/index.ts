import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  screen,
  shell,
  type Tray
} from "electron";
import { isAbsolute, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { getRegisteredMusicFile, registerIpcHandlers } from "./ipc/registerHandlers";
import { resourcesDirectory } from "./paths";
import { createTray } from "./tray/createTray";
import { createPetWindow } from "./window/createPetWindow";
import { IPC_CHANNELS } from "../shared/contracts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "salary-cat",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(840, display.width - 40);
  const height = Math.min(640, display.height - 40);
  settingsWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(display.x + (display.width - width) / 2),
    y: Math.round(display.y + (display.height - height) / 2),
    title: "月薪喵设置",
    icon: join(resourcesDirectory(), "cat.ico"),
    transparent: true,
    frame: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: true,
    minWidth: 640,
    minHeight: 480,
    maximizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWindow.setAlwaysOnTop(true, "screen-saver");
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.once("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#settings`);
  } else {
    void settingsWindow.loadURL(
      `${pathToFileURL(join(__dirname, "../renderer/index.html")).toString()}#settings`
    );
  }
  return settingsWindow;
}

function registerAssetProtocol(): void {
  protocol.handle("salary-cat", (request) => {
    const url = new URL(request.url);
    if (url.hostname === "music") {
      const filePath = getRegisteredMusicFile(url.pathname.replace(/^\//, ""));
      return filePath
        ? net.fetch(pathToFileURL(filePath).toString())
        : new Response("Not found", { status: 404 });
    }
    if (url.hostname !== "asset") {
      return new Response("Not found", { status: 404 });
    }

    const root = normalize(resourcesDirectory());
    const requestedPath = normalize(
      join(root, decodeURIComponent(url.pathname.replace(/^\/+/, "")))
    );
    const relativePath = relative(root, requestedPath);
    if (
      isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith("../") ||
      relativePath.startsWith("..\\")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(requestedPath).toString());
  });
}

app.whenReady().then(() => {
  registerAssetProtocol();
  registerIpcHandlers();
  ipcMain.handle(IPC_CHANNELS.openSettingsWindow, () => {
    createSettingsWindow();
  });
  ipcMain.handle(IPC_CHANNELS.toggleSettingsWindow, (): boolean => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
      return false;
    }
    createSettingsWindow();
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.closeSettingsWindow, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(IPC_CHANNELS.minimizeCurrentWindow, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(IPC_CHANNELS.getAppVersion, () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.openProjectHomepage, () =>
    shell.openExternal("https://github.com/sheyubai/SalaryCat_desktop")
  );
  petWindow = createPetWindow();
  tray = createTray(petWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      petWindow = createPetWindow();
    } else {
      petWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  tray?.destroy();
  tray = null;
});
