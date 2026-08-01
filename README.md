# Salary Cat Desktop

一只可爱的桌面月薪猫，基于 Electron、React 和 TypeScript。它常驻系统托盘，可以拖动、播放角色音乐，并通过独立的 FastAPI 后端与 OpenAI-compatible 模型对话。

## 功能

- 桌面悬浮桌宠、拖动和系统托盘
- 角色动画、音乐和可扩展角色资源
- 聊天输入框与 Markdown 回复气泡
- AI 回复流式显示、思考动画和长内容滚动
- 连续对话，会话 ID 自动续传
- 回复气泡在鼠标移出 40 秒后自动隐藏
- 透明区域鼠标穿透，不阻挡其他桌面窗口

## 项目结构

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

后端是同级目录中的独立项目：`E:\Project\SalaryCat_backend`，不属于本仓库的 `src/`。

## 环境要求

- Windows
- Node.js 20 或更高版本
- npm
- 已启动的 Salary Cat FastAPI 后端
- 后端可访问 MySQL 和已配置的 LLM 服务

## 开发启动

先启动后端（另开一个 PowerShell）：

```powershell
cd E:\Project\SalaryCat_backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

确认后端可以访问：

- http://127.0.0.1:8000/api/v1/health/live
- http://127.0.0.1:8000/docs

再启动桌面端：

```powershell
cd E:\Project\SalaryCat_Desktop
npm install
npm run dev
```

如果后端不是默认的 `http://127.0.0.1:8000`，在启动 Electron 前设置：

```powershell
$env:SALARY_CAT_API_URL = "http://127.0.0.1:9000"
npm run dev
```

## 常用命令

```powershell
npm run dev        # 开发模式
npm run typecheck  # TypeScript 类型检查
npm run build      # 生产构建
npm run pack       # 构建并生成未安装目录
npm run dist       # 构建 Windows 安装包
```

## 后端接口

桌面端通过 Electron 主进程调用：

```text
POST /api/v1/chat/stream  # NDJSON 流式聊天
POST /api/v1/chat         # 普通一次性聊天
```

模型密钥只配置在后端 `.env`，不要写入桌面端代码或安装包。桌面端只保存当前运行期间的 `conversation_id`，完整对话由后端写入 MySQL。

## 角色资源

默认角色位于：

```text
resources/characters/salary-cat/
├─ manifest.json
├─ *.gif / *.png
└─ *.mp3 / *.wav
```

`manifest.json` 决定角色名称、默认状态、各状态动画和主题音乐。新增角色后，将角色目录放入 `resources/characters/`，并在配置中指定对应的 `characterId`。

## 常见问题

### `sendChatMessage is not a function`

这是 Electron 仍在使用旧版 preload 的表现。停止当前进程并完整重启：

```powershell
Ctrl+C
npm run dev
```

如果程序仍在系统托盘，先右键托盘图标退出。

### `Connection error`

检查后端是否运行、`SALARY_CAT_API_URL` 是否正确，并确认后端 `.env` 中的 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL` 已配置。模型服务还必须支持 OpenAI-compatible Chat Completions 接口及流式响应。

### 回复框太大或被裁剪

窗口尺寸在 `src/shared/defaultConfig.ts` 的 `window.width` 和 `window.height` 中调整；回复气泡的宽度、最大高度和滚动提示在 `src/renderer/styles/index.css` 中调整。

### 修改提示文字

睡眠提示集中在 `src/shared/defaultConfig.ts` 的 `behavior.sleepMessages`。思考、错误和音乐提示位于 `src/renderer/scripts/pet/Pet.tsx`。

## 截图

<img width="311" height="287" alt="桌宠界面" src="https://github.com/user-attachments/assets/377c058d-3437-4b94-b85d-2cccc8cd0e26" />
<img width="296" height="278" alt="聊天界面" src="https://github.com/user-attachments/assets/70d4430a-8329-40aa-8f37-7963f7c9ba0b" />
<img width="285" height="293" alt="角色界面" src="https://github.com/user-attachments/assets/db2610e0-1466-4cec-8411-5e86129dc73e" />
<img width="483" height="254" alt="项目效果" src="https://github.com/user-attachments/assets/fab857de-ad10-4b1d-abef-e5865bdd96d4" />
