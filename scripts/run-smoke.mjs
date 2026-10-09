import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import electron from "electron";

export async function runSmoke(name, prepare) {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, `salary-cat-${name}-`));
  try {
    await prepare?.(directory);
    const env = { ...process.env, SALARY_CAT_SMOKE_DIRECTORY: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [resolve(`scripts/smoke-${name}.mjs`)], {
      env, stdio: "inherit", windowsHide: true
    });
    const stop = () => child.kill();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      process.exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code ?? 1));
      });
    } finally {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
  } finally {
    // Only remove the unique directory this run created, after Electron releases it.
    const resolvedDirectory = await realpath(directory);
    if (resolvedDirectory !== directory || dirname(resolvedDirectory) !== temporaryRoot) {
      throw new Error("Smoke test temporary directory changed; refusing to remove it.");
    }
    await rm(resolvedDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
