import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelConfigurationStatus, PetAPI } from "../../../shared/contracts";
import { useAccountSettings } from "./useAccountSettings";

let current: ReturnType<typeof useAccountSettings>;
let root: Root;
let container: HTMLDivElement;
const api = {
  getAuthSession: vi.fn(), getModelConfiguration: vi.fn(), getUsageStats: vi.fn(),
  logout: vi.fn(), saveModelConfiguration: vi.fn()
};
const model = { configured: true, baseUrl: "https://example.com", model: "model-a" };
function Harness() { current = useAccountSettings(); return null; }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("petAPI", api satisfies Pick<PetAPI, keyof typeof api>);
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getAuthSession.mockResolvedValue({ userId: "a" });
  api.getModelConfiguration.mockResolvedValue(model);
  api.getUsageStats.mockResolvedValue({ total_tokens: 10 });
  api.logout.mockResolvedValue(undefined);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it("后端失败有明确错误而不会把已保存配置清空，可主动重试", async () => {
  await act(async () => root.render(createElement(Harness)));
  expect(current.settings.model).toBe("model-a");
  api.getModelConfiguration.mockRejectedValueOnce(new Error("Error invoking remote method 'model-config:get': Error: 后端离线"));
  await act(async () => current.reload());
  expect(current.errors.model).toBe("后端离线");
  expect(current.settings.model).toBe("model-a");
  await act(async () => current.reload());
  expect(current.errors.model).toBe("");
});

it("账号切换后，旧账号迟到的配置和统计不能覆盖当前账号", async () => {
  let resolveOld!: (value: ModelConfigurationStatus) => void;
  api.getModelConfiguration.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  await act(async () => root.render(createElement(Harness)));
  api.getModelConfiguration.mockResolvedValue({ ...model, model: "model-b" });
  await act(async () => current.handleLoggedIn({ userId: "b" }));
  expect(current.authSession?.userId).toBe("b");
  await act(async () => resolveOld(model));
  expect(current.settings.model).toBe("model-b");
});

it("退出登录立即清空当前账号的配置且忽略在途加载", async () => {
  let resolveOld!: (value: ModelConfigurationStatus) => void;
  api.getModelConfiguration.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  await act(async () => root.render(createElement(Harness)));
  await act(async () => current.logout());
  await act(async () => resolveOld(model));
  expect(current.authSession).toBeNull();
  expect(current.settings.configured).toBe(false);
  expect(current.usageStats).toBeNull();
});

it("匿名模式也读取默认配置，不伪装成没有保存", async () => {
  api.getAuthSession.mockResolvedValue(null);
  await act(async () => root.render(createElement(Harness)));
  expect(current.authSession).toBeNull();
  expect(current.settings.configured).toBe(true);
});
