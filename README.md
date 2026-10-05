# Salary Cat Desktop

一只可爱的桌面月薪猫，基于 Electron、React 和 TypeScript。它常驻系统托盘，可以拖动、播放角色音乐，并通过独立的 Java/Spring Boot 后端与 OpenAI-compatible 模型对话。

## 截图

<img width="311" height="287" alt="桌宠界面" src="https://github.com/user-attachments/assets/377c058d-3437-4b94-b85d-2cccc8cd0e26" />
<img width="296" height="278" alt="聊天界面" src="https://github.com/user-attachments/assets/70d4430a-8329-40aa-8f37-7963f7c9ba0b" />
<img width="285" height="293" alt="角色界面" src="https://github.com/user-attachments/assets/db2610e0-1466-4cec-8411-5e86129dc73e" />

<img width="353" height="299" alt="image" src="https://github.com/user-attachments/assets/52e9814e-ad28-4998-b0ce-4a35ede421b5" />
<img width="422" height="339" alt="image" src="https://github.com/user-attachments/assets/4bd97916-2add-4284-b719-4f045ba16f57" />
<img width="620" height="377" alt="image" src="https://github.com/user-attachments/assets/3b164da5-0261-4132-bd5b-7098b3788a54" />
<img width="528" height="338" alt="image" src="https://github.com/user-attachments/assets/3efbfa4c-2fcd-47ae-b9ba-db09cea7a057" />


## 功能

- 桌面悬浮桌宠、拖动和系统托盘
- 角色动画、音乐和可扩展角色资源
- GIF 独立循环播放，音乐可单独暂停/继续，支持循环播放和自选音乐
- 聊天输入框与 Markdown 回复气泡
- AI 回复流式显示、思考动画和长内容滚动
- 连续对话，会话 ID 自动续传
- 回复气泡在鼠标移出 40 秒后自动隐藏
- 透明区域鼠标穿透，不阻挡其他桌面窗口

## 项目结构

第一次阅读前端，先看 [中文调用流程与开发指南](docs/frontend-guide.md)。

```text
src/
├─ main/       Electron 主进程：窗口、托盘、资源协议和 IPC
├─ preload/    安全桥：向渲染进程暴露受限 API
├─ renderer/   React 界面：桌宠、聊天框、回复气泡
└─ shared/     主进程与渲染进程共享的类型和默认配置
resources/     角色图片、GIF、音乐和 manifest.json
electron.vite.config.ts
package.json
```

后端是同级目录中的独立项目：`E:\Project\SalaryCat_server`，不属于本仓库的 `src/`。原 Python 后端 `E:\Project\SalaryCat_backend` 仍可作为回退服务。

## 环境要求

- Windows
- Node.js 20 或更高版本
- npm
- 已启动的 Salary Cat Java 后端（`E:\Project\SalaryCat_server`）
- 后端可访问 MySQL 和已配置的 LLM 服务

## 开发启动

先启动后端（另开一个 PowerShell）：

```powershell
cd E:\Project\SalaryCat_server
mvn spring-boot:run -pl salary-cat-web -am
```

确认后端可以访问：

- http://127.0.0.1:8000/api/v1/health/live
- http://127.0.0.1:8000/api/v1/health/ready

再启动桌面端：

```powershell
cd E:\Project\SalaryCat_Desktop
npm install
npm run dev
```

如果后端不是默认的 `http://127.0.0.1:8000`，在启动 Electron 前设置：

```powershell
$env:SALARY_CAT_API_URL = "http://127.0.0.1:9000"
# 如果后端开启了客户端令牌校验：
$env:SALARY_CAT_CLIENT_TOKEN = "替换为后端 SALARY_CAT_CLIENT_TOKEN"
npm run dev
```

## 常用命令

```powershell
npm run dev        # 开发模式
npm run typecheck  # TypeScript 类型检查
npm test           # 聊天与行为计时回归测试（模拟后端）
npm run test:desktop # 构建并验证实际 Electron 音频、动画与布局（隔离配置、模拟 IPC 服务端）
npm run build      # 生产构建
npm run pack       # 构建并生成未安装目录
npm run dist       # 构建 Windows 安装包
```

## 登录与后端接口

桌面端通过 Electron 主进程调用：

```text
POST /api/v1/auth/register      # 注册并登录
POST /api/v1/auth/login         # 登录并返回 access_token/refresh_token
POST /api/v1/auth/refresh       # 自动刷新短期 access token
POST /api/v1/auth/logout        # 撤销当前会话
POST /api/v1/chat/stream        # NDJSON 流式聊天
POST /api/v1/chat               # 普通一次性聊天
GET  /api/v1/usage              # 当前登录用户的 Token 使用统计
```

打开设置页的“账号登录”即可注册或登录。桌面端启动后会自动恢复本机保存的登录凭证；access token 过期时由主进程使用 refresh token 自动换新，刷新失败才要求重新登录。登录凭证由 Electron 主进程使用系统加密存储，完整对话和 Token 使用统计由后端按登录用户写入、查询 MySQL。

模型配置通过设置页保存到后端，API Key 由后端加密存储且不回显。聊天请求只携带消息和可选的 `conversation_id`，不再携带模型 Key。桌面端只在当前运行期间保存会话 ID，外观、音乐和行为偏好保存在本机。

## 角色资源

### 跳舞与音乐

- 点击小猫展开菜单，通过音符/暂停图标控制音乐，不显示额外的播放状态文字标签。
- GIF 始终独立循环播放，暂停音乐、缓冲或曲目结束不会冻结 GIF。未开启循环时，曲目结束后音乐停止。
- 在“音乐配置”中选择自选文件并保存。换文件会停止当前曲目，需要手动开始新曲目；保存音量或循环设置不会打断播放。
- 移除自选文件并保存，可恢复角色自带音乐。文件失效时，悬停音符按钮查看错误，点击可重试，也可以打开设置更换文件。
- 跳舞期间不自动休眠，可以同时聊天。系统开启“减少动态效果”时保留静态角色，音乐仍可播放。
- 播放时每 30 秒结算一次时长，暂停、切歌、结束时补记尾段。后端不可用时仍能跳舞；统计上报为尽力发送，不保证断网或强制结束进程时的数据补偿。

`npm run test:desktop` 使用实际构建的 renderer/preload、角色 GIF 和音乐，但模拟后端与部分窗口 IPC，不读取真实登录信息。截图和验证结果在 `out/dance-smoke/`；它不等于真实服务器记账的端到端验证。

默认角色位于：

```text
resources/characters/salary-cat/
├─ manifest.json
├─ *.gif / *.png
└─ *.mp3 / *.wav
```

`manifest.json` 决定角色名称、默认状态、各状态动画和主题音乐。可选的 `animations.dancing` 用于指定播放音乐时的素材；默认小猫复用已有 GIF，音乐暂停时 GIF 仍继续播放。仅在系统开启“减少动态效果”时显示静态帧。新增角色后，将角色目录放入 `resources/characters/`，并在配置中指定对应的 `characterId`。

## 常见问题

### `sendChatMessage is not a function`

这是 Electron 仍在使用旧版 preload 的表现。停止当前进程并完整重启：

```powershell
Ctrl+C
npm run dev
```

如果程序仍在系统托盘，先右键托盘图标退出。

### `Connection error`

检查后端是否运行、`SALARY_CAT_API_URL` 是否正确，并确认后端数据库、Flyway 迁移和账号令牌配置正常。用户在设置页保存的模型服务必须支持 OpenAI-compatible Chat Completions 接口及流式响应。

### 回复框太大或被裁剪

窗口尺寸在 `src/shared/defaultConfig.ts` 的 `window.width` 和 `window.height` 中调整；回复气泡的宽度、最大高度和滚动提示在 `src/renderer/styles/index.css` 中调整。

### 修改提示文字

睡眠提示集中在 `src/shared/defaultConfig.ts` 的 `behavior.sleepMessages`。思考提示在 `src/renderer/scripts/pet/usePetBehavior.ts`，聊天错误处理在 `usePetChat.ts`，音乐提示仍在 `Pet.tsx`。




