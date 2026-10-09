// 实际 renderer、preload、IPC 和 Electron net.fetch；仅后端 HTTP 服务使用本地 fixture。
import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

let window;
const directory = process.env.SALARY_CAT_SMOKE_DIRECTORY;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (code) => window.webContents.executeJavaScript(code);
async function until(code, label) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (await evaluate(code)) return;
    await delay(40);
  }
  throw new Error(`Timed out: ${label}`);
}
async function send(message) {
  await evaluate(`(() => {const input=document.querySelector('.pet-chat-input input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(message)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('.pet-chat-input').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
}

async function run() {
  assert.ok(directory, "Start this test with scripts/run-chat-smoke.mjs.");
  const profile = join(directory, "profile");
  mkdirSync(profile);
  app.setPath("userData", profile);
  protocol.registerSchemesAsPrivileged([{ scheme: "salary-cat", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
  let cancelled = false;
  let configFails = true;
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.url === "/api/v1/chat/stream") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      const event = (value) => response.write(JSON.stringify(value) + "\n");
      event({ type: "start", conversation_id: "fixture-conversation", message_id: "fixture-message" });
      event({ type: "delta", text: "正在认真听你说。" });
      if (body.message === "慢回复") {
        response.on("close", () => { cancelled = true; });
        return;
      }
      await delay(120);
      if (body.message !== "模拟断流") event({ type: "done", conversation_id: "fixture-conversation", message_id: "fixture-message" });
      response.end(); return;
    }
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/v1/model-config") {
      response.statusCode = configFails ? 503 : 200;
      response.end(JSON.stringify(configFails ? { message: "模拟后端暂时离线" }
        : { configured: true, base_url: "https://example.com/v1", model: "smoke-model" })); return;
    }
    if (request.url === "/api/v1/usage") {
      response.end(JSON.stringify({ total_tokens: 10, peak_day_tokens: 10, peak_day: null, chat_duration_seconds: 60, current_streak_days: 1, longest_streak_days: 1, dance_duration_seconds: 0, daily_tokens: [] })); return;
    }
    response.end("{}");
  });
  await app.whenReady();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SALARY_CAT_API_URL = `http://127.0.0.1:${server.address().port}`;
  delete process.env.SALARY_CAT_CLIENT_TOKEN;
  const { registerIpcHandlers } = await import(pathToFileURL(join(directory, "handlers.mjs")).href);
  await registerIpcHandlers();
  ipcMain.handle("app:version", () => "smoke");
  ipcMain.handle("settings:toggle", () => true);
  ipcMain.handle("settings:close", () => undefined);
  ipcMain.handle("window:minimize", () => undefined);
  protocol.handle("salary-cat", (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
    return ["cat.GIF", "music.mp3"].includes(path)
      ? net.fetch(pathToFileURL(resolve("resources", path)).href) : new Response("Not found", { status: 404 });
  });
  window = new BrowserWindow({ show: false, width: 500, height: 440, frame: false, backgroundColor: "#f5eee6", webPreferences: {
    preload: resolve("out/preload/preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  const rendererErrors = [];
  window.webContents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  await window.loadFile(resolve("out/renderer/index.html"));
  await until(`Boolean(document.querySelector('.pet-hitbox'))`, "pet ready");
  await evaluate(`document.querySelector('.pet-hitbox').click()`);
  await evaluate(`document.querySelector('[aria-label="开始对话"]').click()`);
  await send("慢回复");
  await until(`document.querySelector('.speech-bubble')?.textContent.includes('认真听') && Boolean(document.querySelector('[aria-label="停止生成"]'))`, "live delta");
  await evaluate(`document.querySelector('[aria-label="停止生成"]').click()`);
  await until(`document.querySelector('.speech-bubble')?.textContent.includes('已停止生成')`, "stopped");
  for (let i = 0; i < 50 && !cancelled; i++) await delay(40);
  assert.ok(cancelled, "stop must close the real HTTP response");
  assert.equal(await evaluate(`document.querySelector('.pet-chat-input input').value`), "慢回复");
  await send("模拟断流");
  await until(`document.querySelector('.speech-bubble')?.textContent.includes('连接中断')`, "truncated stream error");
  assert.equal(await evaluate(`document.querySelector('.pet-chat-input input').value`), "模拟断流");
  await send("恢复聊天");
  await until(`document.querySelector('.pet-chat-input input').value === ''`, "successful send");
  await send("接着聊");
  await until(`document.querySelector('.pet-chat-input input').value === ''`, "follow up");
  assert.equal(requests.at(-1).conversation_id, "fixture-conversation");
  await evaluate(`document.querySelector('[aria-label="开始新对话"]').click()`);
  await send("新话题");
  await until(`document.querySelector('.pet-chat-input input').value === ''`, "new conversation");
  assert.equal(requests.at(-1).conversation_id, undefined);
  const petWindow = window;
  window = new BrowserWindow({ show: false, width: 840, height: 640, frame: false, backgroundColor: "#f5eee6", webPreferences: {
    preload: resolve("out/preload/preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  window.webContents.on("console-message", (event) => { if (event.level === "error") rendererErrors.push(event.message); });
  petWindow.destroy();
  await window.loadFile(resolve("out/renderer/index.html"), { hash: "settings" });
  await until(`Boolean(document.querySelector('.settings-nav'))`, "settings ready");
  await evaluate(`[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent.includes('模型配置')).click()`);
  await until(`document.querySelector('.settings-load-status')?.textContent.includes('模拟后端暂时离线')`, "visible configuration failure");
  configFails = false;
  await evaluate(`document.querySelector('.settings-load-status button').click()`);
  await until(`[...document.querySelectorAll('input')].some(i=>i.value==='smoke-model')`, "configuration retry");
  assert.deepEqual(rendererErrors, []);
  window.destroy(); server.closeAllConnections(); server.close();
  console.log("Chat desktop smoke passed: real IPC/HTTP streaming, cancellation, retry, conversation reset, settings recovery.");
  app.exit(0);
}

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
