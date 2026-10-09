import type { ChatResponse } from "../../shared/contracts";

/** NDJSON 与 Electron 分开，便于验证断流、UTF-8 分片和错误事件。 */
export async function readChatStream(response: Response, onDelta: (text: string) => void): Promise<ChatResponse> {
  if (!response.body) throw new Error("后端没有返回可读取的数据流。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let conversationId = "";
  let messageId = "";
  let completed = false;

  function consume(line: string): void {
    if (!line.trim() || completed) return;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(line);
      if (!value || typeof value !== "object") throw new Error();
    } catch {
      throw new Error("后端回复格式异常，请重试。");
    }
    if (value.type === "start" || value.type === "done") {
      if (typeof value.conversation_id === "string") conversationId = value.conversation_id;
      if (typeof value.message_id === "string") messageId = value.message_id;
      completed = value.type === "done";
    } else if (value.type === "delta" && typeof value.text === "string") {
      answer += value.text;
      if (answer.length > 1_000_000) throw new Error("回复过长，请缩小问题范围后重试。");
      onDelta(value.text);
    } else if (value.type === "error") {
      throw new Error(typeof value.detail === "string" ? value.detail
        : typeof value.message === "string" ? value.message : "模型生成回复失败。");
    }
  }

  try {
    while (!completed) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1 && !completed) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 1_000_000) throw new Error("后端回复格式异常，请重试。");
      if (done) { consume(buffer); break; }
    }
    if (!completed || !conversationId || !messageId) throw new Error("回复连接中断，请重试。");
    if (!answer.trim()) throw new Error("模型没有返回文字，请重试或检查模型配置。");
    return { conversationId, messageId, answer };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
