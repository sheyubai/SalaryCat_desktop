import { app } from "electron";
import { join } from "node:path";

export function resourcesDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "resources")
    : join(process.cwd(), "resources");
}
