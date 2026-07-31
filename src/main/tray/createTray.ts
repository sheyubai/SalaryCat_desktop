import { app, BrowserWindow, Menu, Tray } from "electron";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "../../shared/defaultConfig";
import { resourcesDirectory } from "../paths";

export function createTray(petWindow: BrowserWindow): Tray {
  const tray = new Tray(join(resourcesDirectory(), "cat.ico"));
  tray.setToolTip(DEFAULT_CONFIG.applicationName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示月薪喵",
        click: () => petWindow.show()
      },
      {
        label: "隐藏月薪喵",
        click: () => petWindow.hide()
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit()
      }
    ])
  );
  tray.on("double-click", () => petWindow.show());
  return tray;
}
