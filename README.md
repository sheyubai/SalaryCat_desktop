# Salary Cat Desktop

Electron + React + TypeScript 桌面小猫：拖动、托盘、角色动画、音乐、聊天及独立设置窗口。后端是同级独立仓库 `SalaryCat_Back`。

**开发前先看 [前后端架构图与开发流程](docs/frontend-guide.md)**，其中包含阅读顺序、文件职责、聊天链路和分阶段整理方案。

## 项目结构

```text
src/main/       Electron 主进程：窗口、托盘、IPC、后端通信
src/preload/    window.petAPI 安全桥
src/renderer/   React 页面、组件和交互逻辑
src/shared/     IPC 类型和默认配置
resources/      程序必需的 GIF、音乐、图标、角色清单
scripts/        安装检查及桌面集成测试
```

## 本地启动

需要 Node.js 22.12+、npm。统一使用 `package-lock.json`；首次安装或锁文件变化后执行 `npm ci`。

先按后端 README 启动 `SalaryCat_Back`，默认地址为 `http://127.0.0.1:8000`，再在本项目目录执行：

```powershell
npm ci
npm run dev
```

自定义后端地址或客户端令牌时，在启动前设置环境变量：

```powershell
$env:SALARY_CAT_API_URL = "http://127.0.0.1:9000"
$env:SALARY_CAT_CLIENT_TOKEN = "与后端一致的客户端令牌"
npm run dev
```

在设置页登录并保存模型配置。模型 API Key 由后端加密保存；桌面端只保存系统加密后的登录凭证。外观、行为、音乐偏好保存在本机。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发模式 |
| `npm test` | 单元测试 |
| `npm run build` | 类型检查并构建 |
| `npm run test:desktop` | 构建并验证真实 Electron 音频、GIF 和缩放 |
| `npm run test:chat-desktop` | 构建并验证真实 IPC/HTTP 流式、取消、断流与设置重试 |
| `npm run pack` | 生成可运行目录 |
| `npm run dist` | 生成安装包 |

桌面集成测试使用隔离配置和本地测试服务，不使用真实账号或付费模型。结果输出到控制台，临时文件在退出时清理，不保存问答截图。

`out/`、`release/` 是可再生输出，不提交 Git。安装包仅收集 `out/main`、`out/preload`、`out/renderer` 和必要资源。

## 角色与交互约定

角色定义在 `resources/characters/salary-cat/manifest.json`，素材路径相对于 `resources/`：当前使用 `cat.GIF` 和 `music.mp3`，窗口/托盘使用 `cat.ico`。

- 暂停音乐后 GIF 继续播放；仅系统“减少动态效果”偏好会使用静态帧。
- 音乐状态由图标和悬停提示表达，不显示文字标签；暂停图标为音符加斜线。
- 桌宠大小范围为 80%–100%。
- 聊天可停止、开始新对话；失败保留草稿，账号切换清空当前会话。
- 音乐时长上报为尽力发送；流式 Token 为估算值，不能用于核对模型账单。

## 排查入口

- Preload API 缺失：退出托盘中的旧进程，再完整重启 `npm run dev`。
- 后端连接失败：检查地址、服务运行情况及 `/api/v1/health/live`、`/api/v1/health/ready`。
- 模型配置保存失败：检查后端加密密钥配置和日志，见后端 README。
- 修改界面或行为：按 [开发指南的文件索引](docs/frontend-guide.md#2-现在从哪里读代码) 找对应模块。
