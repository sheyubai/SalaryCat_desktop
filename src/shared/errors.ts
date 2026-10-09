/** Electron 会给 IPC 错误添加技术前缀；界面只展示实际原因。 */
export function readableError(error: unknown, fallback = "操作失败，请稍后重试。"): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    : fallback;
}
