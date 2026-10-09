import { ipcMain } from "electron";
import { IPC_CHANNELS, type ChatRequest, type ChatResponse } from "../../shared/contracts";
import { backendFetch, errorDetail } from "../backend/client";
import { readChatStream } from "../backend/chatStream";

export function registerChatHandlers(): void {
  const requests = new Map<number, { requestId: string; controller: AbortController }>();
  ipcMain.on(IPC_CHANNELS.cancelChatMessage, (event, requestId: string) => {
    const active = requests.get(event.sender.id);
    if (active?.requestId === requestId) active.controller.abort();
  });
  ipcMain.handle(IPC_CHANNELS.sendChatMessage, async (event,
    payload: { requestId: string; request: ChatRequest }): Promise<ChatResponse> => {
    const message = payload?.request?.message?.trim();
    if (!message || message.length > 4000 || typeof payload.requestId !== "string") {
      throw new Error("消息需为 1–4000 个字符。");
    }
    const senderId = event.sender.id;
    requests.get(senderId)?.controller.abort();
    const controller = new AbortController();
    const active = { requestId: payload.requestId, controller };
    requests.set(senderId, active);
    const onDestroyed = () => controller.abort();
    event.sender.once("destroyed", onDestroyed);
    const deadline = AbortSignal.timeout(120_000);
    try {
      const response = await backendFetch("/api/v1/chat/stream", {
        method: "POST",
        signal: AbortSignal.any([controller.signal, deadline]),
        body: JSON.stringify({ message, conversation_id: payload.request.conversationId })
      });
      if (!response.ok) throw new Error(errorDetail(await response.json().catch(() => null), response.status));
      return await readChatStream(response, (text) => {
        if (!event.sender.isDestroyed() && !controller.signal.aborted) {
          event.sender.send(IPC_CHANNELS.chatDelta, { requestId: payload.requestId, text });
        }
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("已停止生成。");
      if (deadline.aborted) throw new Error("回复等待超过两分钟，请重试或检查模型服务。");
      throw error;
    } finally {
      event.sender.removeListener("destroyed", onDestroyed);
      if (requests.get(senderId) === active) requests.delete(senderId);
    }
  });
}
