import { useEffect, useState, type FormEvent } from "react";

import type { UsageStats, UserLlmSettings, UserMusicSettings, UserPreferences } from "../../../shared/contracts";

type SettingsSection = "usage" | "model" | "appearance" | "behavior" | "music" | "about";

interface PetSettingsModalProps {
  settings: UserLlmSettings;
  preferences: UserPreferences;
  usageStats: UsageStats | null;
  appVersion: string;
  onSave: (settings: UserLlmSettings) => void;
  onSavePreferences: (preferences: UserPreferences) => void;
  onClose: () => void;
}

const sections: Array<{id: SettingsSection; label: string; icon: string}> = [
  { id: "usage", label: "使用统计", icon: "chart" },
  { id: "model", label: "模型配置", icon: "✦" },
  { id: "appearance", label: "外观与窗口", icon: "◐" },
  { id: "behavior", label: "行为与提示", icon: "♡" },
  { id: "music", label: "音乐配置", icon: "♫" },
  { id: "about", label: "关于月薪喵", icon: "ⓘ" }
];

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.1A10.8 10.8 0 0 1 12 4.9c5.1 0 8.5 4.1 9.5 7.1a10.7 10.7 0 0 1-4.1 5.1M6.3 6.4A10.8 10.8 0 0 0 2.5 12c1 3 4.4 7.1 9.5 7.1 1.1 0 2.1-.2 3-.6" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S5.8 4.9 12 4.9 21.5 12 21.5 12 18.2 19.1 12 19.1 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" /></svg>;
}

function SectionIcon({ icon }: { icon: string }) {
  if (icon === "chart") {
    return <svg className="settings-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V10M10 19V5M16 19v-7M22 19H2" /></svg>;
  }
  return <span>{icon}</span>;
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function PetSettingsModal({
  settings,
  preferences,
  usageStats,
  appVersion,
  onSave,
  onSavePreferences,
  onClose
}: PetSettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("usage");
  const [draft, setDraft] = useState(settings);
  const [appearance, setAppearance] = useState(preferences.appearance);
  const [behavior, setBehavior] = useState(preferences.behavior);
  const [music, setMusic] = useState<UserMusicSettings>(preferences.music);
  const [sleepMessagesText, setSleepMessagesText] = useState(
    preferences.behavior.sleepMessages.join("\n")
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(
      () => setNotice(null),
      notice.kind === "success" ? 2_000 : 4_000
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const nextSettings = {
        apiKey: draft.apiKey.trim(),
        baseUrl: draft.baseUrl.trim().replace(/\/$/, ""),
        model: draft.model.trim()
      };
      const hasCustomSetting = Object.values(nextSettings).some(Boolean);
      if (hasCustomSetting && Object.values(nextSettings).some((value) => !value)) {
        throw new Error("请完整填写 API Key、接口地址和模型名称。");
      }
      if (nextSettings.baseUrl) {
        const url = new URL(nextSettings.baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("接口地址必须以 http:// 或 https:// 开头。");
        }
      }
      onSave(nextSettings);
      setNotice({ kind: "success", message: "设置已保存" });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "保存设置失败，请重试。"
      });
    }
  }

  async function copyApiKey(): Promise<void> {
    if (!draft.apiKey) {
      setNotice({ kind: "error", message: "没有可复制的 API Key。" });
      return;
    }
    try {
      await navigator.clipboard.writeText(draft.apiKey);
      setNotice({ kind: "success", message: "API Key 已复制" });
    } catch {
      setNotice({ kind: "error", message: "复制失败，请手动复制。" });
    }
  }

  function saveAppearance(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSavePreferences({ appearance, behavior: preferences.behavior, music: preferences.music });
    setNotice({ kind: "success", message: "外观设置已保存" });
  }

  function saveBehavior(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const sleepMessages = sleepMessagesText
        .split("\n")
        .map((message) => message.trim())
        .filter(Boolean);
      if (!sleepMessages.length) {
        throw new Error("请至少保留一条睡眠提示。" );
      }
      if (behavior.sleepAfterSeconds < 10 || behavior.dismissAfterSeconds < 5) {
        throw new Error("休眠时间至少 10 秒，回复停留时间至少 5 秒。" );
      }
      onSavePreferences({
        appearance: preferences.appearance,
        behavior: { ...behavior, sleepMessages },
        music: preferences.music
      });
      setNotice({ kind: "success", message: "行为设置已保存" });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "保存行为设置失败。"
      });
    }
  }

  async function selectMusicFile(): Promise<void> {
    try {
      const sourcePath = await window.petAPI.selectMusicFile();
      if (sourcePath) {
        setMusic({ ...music, sourcePath });
      }
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "无法选择音乐文件。"
      });
    }
  }

  function saveMusic(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSavePreferences({ appearance: preferences.appearance, behavior: preferences.behavior, music });
    setNotice({ kind: "success", message: "音乐设置已保存" });
  }

  function renderContent() {
    if (activeSection === "usage") {
      const stats = usageStats;
      const duration = (seconds: number) => `${Math.floor(seconds / 3_600)}时${Math.floor((seconds % 3_600) / 60)}分`;
      const maxTokens = Math.max(...(stats?.daily_tokens.map((item) => item.tokens) ?? [0]), 1);
      const today = new Date();
      const firstActivityDay = new Date(today);
      firstActivityDay.setDate(today.getDate() - 181);
      const monthLabels = Array.from({ length: 7 }, (_, index) => {
        const month = new Date(firstActivityDay);
        month.setMonth(firstActivityDay.getMonth() + index);
        return `${month.getMonth() + 1}月`;
      });
      return <section className="settings-content usage-content">
        <header className="settings-content-header"><div><p className="settings-eyebrow">YOUR ACTIVITY</p><h2>使用统计</h2><p>记录月薪喵陪伴你的每一天。</p></div></header>
        <div className="usage-metrics">
          <div><b>{stats?.total_tokens.toLocaleString() ?? "—"}</b><span>累计 Token</span></div><div><b>{stats?.peak_day_tokens.toLocaleString() ?? "—"}</b><span>单日峰值</span></div><div><b>{stats ? duration(stats.chat_duration_seconds) : "—"}</b><span>聊天时长</span></div><div><b>{stats?.current_streak_days ?? "—"} 天</b><span>当前连续</span></div><div><b>{stats?.longest_streak_days ?? "—"} 天</b><span>最长连续</span></div><div><b>{stats ? duration(stats.dance_duration_seconds) : "—"}</b><span>跳舞时间</span></div>
        </div>
        <h3 className="usage-title">Token 活动</h3><div className="usage-heatmap">{Array.from({ length: 182 }, (_, index) => { const day = new Date(firstActivityDay); day.setDate(firstActivityDay.getDate() + index); const key = localDateKey(day); const tokens = stats?.daily_tokens.find((item) => item.date === key)?.tokens ?? 0; const level = tokens ? Math.min(4, Math.ceil(tokens / maxTokens * 4)) : 0; return <span key={key} className={`usage-cell level-${level}`} data-tooltip={`${key}\n${tokens.toLocaleString()} Token`} />; })}</div><div className="usage-months">{monthLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
        {!stats && <p className="usage-empty">暂时无法连接后端，启动后端后会显示统计数据。</p>}
      </section>;
    }
    if (activeSection === "appearance") {
      return (
        <form className="settings-content" onSubmit={saveAppearance}>
          <header className="settings-content-header">
            <div><p className="settings-eyebrow">DESKTOP PET</p><h2>外观与窗口</h2><p>调整月薪喵的视觉效果和窗口行为。</p></div>
          </header>
          <label className="settings-field settings-range"><span>桌宠大小 <b>{Math.round(appearance.scale * 100)}%</b></span><input type="range" min="0.8" max="1.25" step="0.05" value={appearance.scale} onChange={(event) => setAppearance({ ...appearance, scale: Number(event.target.value) })} /></label>
          <label className="settings-field settings-range"><span>桌宠透明度 <b>{appearance.opacity}%</b></span><input type="range" min="40" max="100" step="5" value={appearance.opacity} onChange={(event) => setAppearance({ ...appearance, opacity: Number(event.target.value) })} /></label>
          <label className="settings-switch"><input type="checkbox" checked={appearance.alwaysOnTop} onChange={(event) => setAppearance({ ...appearance, alwaysOnTop: event.target.checked })} /><span><b>始终置顶</b><small>让月薪喵显示在其他窗口上方。</small></span></label>
          <footer className="settings-actions"><button type="submit" className="settings-save">保存设置</button></footer>
        </form>
      );
    }

    if (activeSection === "behavior") {
      return (
        <form className="settings-content" onSubmit={saveBehavior}>
          <header className="settings-content-header">
            <div><p className="settings-eyebrow">PET BEHAVIOR</p><h2>行为与提示</h2><p>设置休眠节奏和回复提示。</p></div>
          </header>
          <label className="settings-field"><span>无操作后休眠（秒）</span><input type="number" min="10" value={behavior.sleepAfterSeconds} onChange={(event) => setBehavior({ ...behavior, sleepAfterSeconds: Number(event.target.value) })} /></label>
          <label className="settings-field"><span>回复框停留时间（秒）</span><input type="number" min="5" value={behavior.dismissAfterSeconds} onChange={(event) => setBehavior({ ...behavior, dismissAfterSeconds: Number(event.target.value) })} /><small>鼠标停在回复框上时会暂停计时。</small></label>
          <label className="settings-field"><span>睡眠提示</span><textarea value={sleepMessagesText} onChange={(event) => setSleepMessagesText(event.target.value)} placeholder="每行一条随机提示" /><small>每行一条，进入睡眠状态时随机显示。</small></label>
          <footer className="settings-actions"><button type="submit" className="settings-save">保存设置</button></footer>
        </form>
      );
    }

    if (activeSection === "music") {
      const fileName = music.sourcePath.split(/[\\/]/).pop();
      return (
        <form className="settings-content" onSubmit={saveMusic}>
          <header className="settings-content-header">
            <div><p className="settings-eyebrow">PERSONAL MUSIC</p><h2>音乐配置</h2><p>设置后，桌宠的音乐按钮会优先播放此文件。</p></div>
          </header>
          <div className="music-file-picker">
            <span className="music-file-icon">♫</span>
            <div><b>{fileName || "还没有选择音乐"}</b><small>{music.sourcePath || "支持 MP3、WAV、OGG、M4A、FLAC"}</small></div>
            <button type="button" onClick={() => void selectMusicFile()}>选择文件</button>
          </div>
          {music.sourcePath && <button className="music-clear" type="button" onClick={() => setMusic({ ...music, sourcePath: "" })}>移除当前音乐</button>}
          <label className="settings-field settings-range"><span>播放音量 <b>{music.volume}%</b></span><input type="range" min="0" max="100" step="5" value={music.volume} onChange={(event) => setMusic({ ...music, volume: Number(event.target.value) })} /></label>
          <label className="settings-switch"><input type="checkbox" checked={music.loop} onChange={(event) => setMusic({ ...music, loop: event.target.checked })} /><span><b>循环播放</b><small>开启后，音乐结束时会自动重新播放。</small></span></label>
          <footer className="settings-actions"><button type="submit" className="settings-save">保存设置</button></footer>
        </form>
      );
    }

    if (activeSection === "about") {
      return (
        <section className="settings-about">
          <span className="settings-about-mark">ฅ</span><h2>月薪喵</h2><p>一个陪伴您工作的月薪喵 AI 桌宠。</p>
          <dl><div><dt>版本</dt><dd>{appVersion}</dd></div><div><dt>开发者</dt><dd>sheyubai</dd></div><div><dt>项目状态</dt><dd>持续开发中</dd></div></dl>
          <button className="settings-project-link" type="button" onClick={() => void window.petAPI.openProjectHomepage()}>查看项目主页 ↗</button>
        </section>
      );
    }

    return (
      <form className="settings-content" onSubmit={submit}>
        <header className="settings-content-header">
          <div>
            <p className="settings-eyebrow">AI PROVIDER</p>
            <h2>模型配置</h2>
            <p>使用你自己的 API Key 和 OpenAI-compatible 服务。</p>
          </div>
        </header>

        <label className="settings-field">
          <span>API Key</span>
          <div className="api-key-input">
            <input
              type={showApiKey ? "text" : "password"}
              value={draft.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(event) => {
                setDraft({ ...draft, apiKey: event.target.value });
              }}
            />
            <button
              className="api-key-icon-button"
              type="button"
              onClick={() => setShowApiKey((visible) => !visible)}
              title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
              aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
            >
              <EyeIcon open={showApiKey} />
            </button>
            <button className="api-key-icon-button" type="button" onClick={() => void copyApiKey()} title="复制 API Key" aria-label="复制 API Key">
              <CopyIcon />
            </button>
          </div>
          <small>仅用于本次用户配置的模型调用。</small>
        </label>
        <label className="settings-field">
          <span>接口地址</span>
          <input
            type="url"
            value={draft.baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(event) => {
              setDraft({ ...draft, baseUrl: event.target.value });
            }}
          />
        </label>
        <label className="settings-field">
          <span>模型名称</span>
          <input
            type="text"
            value={draft.model}
            placeholder="gpt-4o-mini"
            onChange={(event) => {
              setDraft({ ...draft, model: event.target.value });
            }}
          />
        </label>

        <div className="settings-security-note">
          <span>⚠</span>
          <p>Key 会保存在当前电脑，并在每次对话时发送到你的后端。请不要在共享设备上保存私人 Key。</p>
        </div>
        <footer className="settings-actions">
          <button type="submit" className="settings-save">保存设置</button>
        </footer>
      </form>
    );
  }

  return (
    <div className="settings-backdrop" role="presentation">
      <section className="settings-modal" aria-label="月薪喵设置">
        <aside className="settings-sidebar">
          <div className="settings-brand">
            <span className="settings-cat-mark" aria-hidden="true">ฅ</span>
            <div>
              <strong>月薪喵</strong>
              <small>AI 桌宠</small>
            </div>
          </div>
          <nav className="settings-nav" aria-label="设置分类">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? "is-active" : ""}
                onClick={() => setActiveSection(section.id)}
              >
                <SectionIcon icon={section.icon} />{section.label}
              </button>
            ))}
          </nav>
          <p className="settings-version">Salary Cat Desktop · {appVersion}</p>
        </aside>
        <main className="settings-main">
          <div className="settings-titlebar" aria-hidden="true" />
          <button className="settings-minimize" type="button" onClick={() => void window.petAPI.minimizeCurrentWindow()} aria-label="最小化">−</button>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭">×</button>
          {notice && (
            <div className={`settings-toast is-${notice.kind}`} role="status">
              {notice.kind === "success" ? "✓" : "!"} {notice.message}
            </div>
          )}
          {renderContent()}
        </main>
      </section>
    </div>
  );
}
