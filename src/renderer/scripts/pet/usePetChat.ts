import { useCallback, useEffect, useRef, useState } from "react";
import { readableError } from "../../../shared/errors";

interface ChatBehavior {
  beginChat(): void;
  updateChat(message: string): void;
  finishChat(message: string): void;
}

/** 请求生命周期、会话和取消集中在这里；动画仍交给行为模块。 */
export function usePetChat({ beginChat, updateChat, finishChat }: ChatBehavior) {
  const [sending, setSending] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const activeRequest = useRef<{ id: symbol; answer: string } | null>(null);

  const stop = useCallback(() => {
    const request = activeRequest.current;
    if (!request) return;
    activeRequest.current = null;
    window.petAPI.cancelChatMessage();
    setSending(false);
    finishChat(request.answer ? `${request.answer}\n\n（已停止生成）` : "已停止生成，可以修改问题后重新发送。");
  }, [finishChat]);

  const newConversation = useCallback(() => {
    stop();
    conversationId.current = undefined;
    finishChat("新对话已开始，想聊点什么？");
  }, [stop, finishChat]);

  useEffect(() => {
    const channel = new BroadcastChannel("salary-cat-auth");
    channel.onmessage = newConversation;
    return () => channel.close();
  }, [newConversation]);

  useEffect(() => () => {
    if (activeRequest.current) window.petAPI.cancelChatMessage();
    activeRequest.current = null;
  }, []);

  const sendMessage = useCallback(async (input: string): Promise<boolean> => {
    const message = input.trim();
    if (!message || activeRequest.current) return false;
    const request = { id: Symbol("chat"), answer: "" };
    activeRequest.current = request;
    setSending(true);
    beginChat();
    try {
      const response = await window.petAPI.sendChatMessage({ message, conversationId: conversationId.current }, (text) => {
        if (activeRequest.current !== request) return;
        request.answer += text;
        updateChat(request.answer);
      });
      if (activeRequest.current !== request) return false;
      conversationId.current = response.conversationId;
      finishChat(response.answer);
      return true;
    } catch (error) {
      if (activeRequest.current !== request) return false;
      const reason = readableError(error, "请求失败，请稍后重试。");
      finishChat(request.answer ? `${request.answer}\n\n---\n${reason}` : reason);
      return false;
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setSending(false);
      }
    }
  }, [beginChat, updateChat, finishChat]);

  return { sending, sendMessage, stop, newConversation };
}
