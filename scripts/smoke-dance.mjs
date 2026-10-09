// 真实 Chromium 音频/GIF + 生产 renderer/preload；IPC 对端模拟，不需要账号或模型服务。
import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function run() {
const root = process.cwd();
const directory = process.env.SALARY_CAT_SMOKE_DIRECTORY;
assert.ok(directory, "Start this test with scripts/run-dance-smoke.mjs.");
const profile = join(directory, "profile");
mkdirSync(profile);
app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([{ scheme: "salary-cat", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const records = [];
const errors = [];
let window;
const delay = (ms) => new Promise((ok) => setTimeout(ok, ms));
const evaluate = (code) => window.webContents.executeJavaScript(code, true);
async function until(code, label, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(code)) return;
    await delay(80);
  }
  throw new Error(`Timed out: ${label}`);
}
async function capture(rect) {
  // 隐藏窗口的首张截图可能是上一张合成帧；先触发合成再采样。
  await window.webContents.capturePage(rect);
  await delay(100);
  return window.webContents.capturePage(rect);
}
async function preferences(patch) {
  await evaluate(`(() => {
    const value = JSON.parse(localStorage.getItem('salary-cat-preferences'));
    const patch = ${JSON.stringify(patch)};
    for (const key of Object.keys(patch)) value[key] = { ...value[key], ...patch[key] };
    localStorage.setItem('salary-cat-preferences', JSON.stringify(value));
    const channel = new BroadcastChannel('salary-cat-preferences');
    channel.postMessage('updated'); channel.close();
  })()`);
  await delay(160);
}
async function toggle() {
  await evaluate(`document.querySelector('.pet-action-button').click()`);
}
const musicIs = (label) => `document.querySelector('.pet-action-button')?.getAttribute('aria-label') === ${JSON.stringify(label)}`;

try {
  await app.whenReady();
  // 一秒静音 WAV，用于验证真实解码器的 ended/loop，完全不产生外部请求。
  const pcm = Buffer.alloc(44 + 16_000 * 2);
  pcm.write("RIFF"); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(16_000, 24); pcm.writeUInt32LE(32_000, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(pcm.length - 44, 40);
  await writeFile(join(directory, "short.wav"), pcm);
  protocol.handle("salary-cat", (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname.slice(1));
    if (url.hostname === "smoke" && relative === "short.wav") return net.fetch(pathToFileURL(join(directory, "short.wav")).href);
    if (url.hostname === "asset" && ["cat.GIF", "music.mp3"].includes(relative)) return net.fetch(pathToFileURL(join(root, "resources", relative)).href);
    return new Response("Not found", { status: 404 });
  });
  ipcMain.handle("character:manifest", async () => JSON.parse(await readFile(join(root, "resources/characters/salary-cat/manifest.json"), "utf8")));
  ipcMain.handle("music:get-url", (_event, path) => {
    if (path === "short.wav") return "salary-cat://smoke/short.wav";
    throw new Error("File not found");
  });
  ipcMain.handle("usage:record-activity", (_event, kind, seconds) => records.push({ kind, seconds }));
  ipcMain.handle("window:position", () => ({ x: 0, y: 0 }));
  ipcMain.handle("settings:open", () => undefined);
  ipcMain.handle("settings:toggle", () => true);
  ipcMain.handle("chat:send", async (event, { requestId }) => {
    event.sender.send("chat:delta", { requestId, text: "跳舞时也能陪你聊天。" });
    await delay(100);
    return { conversationId: "smoke", messageId: "smoke-1", answer: "跳舞时也能陪你聊天。" };
  });
  ipcMain.on("window:size", (_event, size) => window.setSize(size.width, size.height));
  ipcMain.on("window:mouse-passthrough", () => undefined);
  ipcMain.on("window:always-on-top", () => undefined);
  window = new BrowserWindow({
    show: false, width: 500, height: 440, frame: false, backgroundColor: "#f5eee6",
    webPreferences: { preload: resolve(root, "out/preload/preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  await window.loadFile(join(root, "out/renderer/index.html"));
  await evaluate(`localStorage.setItem('salary-cat-preferences', JSON.stringify({appearance:{scale:1,opacity:100,alwaysOnTop:true}, behavior:{sleepAfterSeconds:10,dismissAfterSeconds:40,sleepMessages:['休息一下']},music:{sourcePath:'',volume:0,loop:true}}))`);
  await window.loadFile(join(root, "out/renderer/index.html"));
  await until(`document.querySelector('img.pet-sprite')?.naturalWidth > 0 && document.querySelector('img.pet-sprite').style.visibility === 'visible'`, "initial animated sprite");
  await evaluate(`document.querySelector('.pet-hitbox').click()`);
  await until(`document.querySelector('.pet-action-button')?.getAttribute('aria-label') === '播放音乐'`, "start control");
  await toggle();
  await until(musicIs("暂停音乐"), "real MP3 playback");
  assert.equal(await evaluate(`document.querySelector('.pet-dance-status')`), null, "no music text tag");
  assert.equal(await evaluate(`document.querySelector('img.pet-sprite').style.visibility`), "visible");
  const spriteRect = await evaluate(`(() => { const r=document.querySelector('canvas.pet-sprite').getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.min(Math.round(r.width),innerWidth-Math.round(r.x)),height:Math.min(Math.round(r.height),innerHeight-Math.round(r.y))}; })()`);
  const dancingFrames = [];
  for (let i = 0; i < 5; i++) {
    await delay(180);
    dancingFrames.push((await capture(spriteRect)).toBitmap().toString("base64"));
  }
  assert.ok(new Set(dancingFrames).size > 1, "GIF should move while audio is playing");
  await delay(1_300);
  await toggle();
  await until(musicIs("继续音乐"), "pause control");
  await until(`document.querySelector('img.pet-sprite').style.visibility === 'visible'`, "GIF stays visible after music pause");
  const pausedFrames = [];
  const reportedBeforePause = records.length;
  for (let i = 0; i < 5; i++) {
    await delay(180);
    pausedFrames.push((await capture(spriteRect)).toBitmap().toString("base64"));
  }
  assert.ok(new Set(pausedFrames).size > 1, "GIF must continue animating while music is paused");
  assert.equal(records.length, reportedBeforePause, "paused music must not accrue playback time");
  assert.ok(records.some((r) => r.kind === "dance" && r.seconds >= 2), "real playback should record elapsed time");
  await toggle();
  await until(musicIs("暂停音乐"), "resume");
  await evaluate(`document.querySelectorAll('.pet-action-button')[1].click()`);
  await until(`Boolean(document.querySelector('.pet-chat-input input'))`, "chat input");
  await evaluate(`(() => {const input=document.querySelector('.pet-chat-input input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'一起跳舞'); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('.pet-chat-input').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  await until(`document.querySelector('.speech-bubble')?.textContent.includes('跳舞时也能陪你聊天')`, "chat while dancing");
  await delay(10_500);
  assert.ok(await evaluate(musicIs("暂停音乐")), "dance must survive sleep deadline");
  assert.ok(await evaluate(`document.querySelector('.speech-bubble')?.textContent.includes('跳舞时也能陪你聊天')`));
  await preferences({ music: { sourcePath: "short.wav", loop: false } });
  await until(`document.querySelector('.pet-action-button')?.getAttribute('aria-label') === '播放音乐'`, "new track should stay stopped");
  await toggle();
  await until(musicIs("暂停音乐"), "WAV playback");
  await until(`document.querySelector('.pet-action-button')?.getAttribute('aria-label') === '播放音乐'`, "natural ended event");
  await preferences({ music: { loop: true } });
  await toggle();
  await until(musicIs("暂停音乐"), "loop playback");
  await delay(2_300);
  assert.ok(await evaluate(musicIs("暂停音乐")), "loop must continue beyond track duration");
  await preferences({ music: { sourcePath: "missing.mp3" } });
  await until(musicIs("重试播放"), "missing file recovery UI");
  assert.ok(await evaluate(`document.querySelector('.speech-bubble')?.textContent.includes('跳舞时也能陪你聊天')`), "music error must preserve chat");
  await preferences({ music: { sourcePath: "" } });
  await until(`document.querySelector('.pet-action-button')?.getAttribute('aria-label') === '播放音乐'`, "restore theme");
  await toggle();
  await until(musicIs("暂停音乐"), "theme restored");
  for (const scale of [.8, 1]) {
    await preferences({ appearance: { scale } });
    const inside = await evaluate(`(() => {const r=document.querySelector('.pet-action-menu').getBoundingClientRect(); const input=document.querySelector('.pet-chat-input').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= input.top && input.bottom <= innerHeight;})()`);
    assert.ok(inside, `music controls and input must fit at scale ${scale}`);
  }
  await toggle();
  assert.deepEqual(errors, [], "renderer console errors");
  console.log("Dance desktop smoke passed: real MP3/WAV, GIF keeps moving on pause, usage, chat coexistence, playback recovery, 80%/100% scale.");
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}
}

// Electron 的默认入口加载器需要先完成模块求值，避免在顶层等待 ready。
void run().catch((error) => { console.error(error); app.exit(1); });
