import {
  app,
  BrowserWindow,
  net,
  protocol,
  type Tray
} from "electron";
import { isAbsolute, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { registerIpcHandlers } from "./ipc/registerHandlers";
import { resourcesDirectory } from "./paths";
import { createTray } from "./tray/createTray";
import { createPetWindow } from "./window/createPetWindow";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "salary-cat",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function registerAssetProtocol(): void {
  protocol.handle("salary-cat", (request) => {
    const url = new URL(request.url);
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
