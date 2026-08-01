export const DEFAULT_CONFIG = {
  applicationName: "Salary Cat",
  characterId: "salary-cat",
  window: {
    // 扩大的空白区域会鼠标穿透，不会挡住桌面操作。
    width: 500,
    // 176px speech space + 240px pet area + 24px shadow space below.
    height: 440,
    margin: 12,
    // 调试窗口边界时使用黑色；恢复透明可改回 "#00000000"。
    backgroundColor: "#00000000"
  },
  behavior: {
    happyDurationMs: 1_800,
    replyDurationMs: 6_000,
    sleepAfterMs: 60_000,
    sleepMessages: [
      "喵喵，愿你做个甜甜的梦。",
      "月薪喵进入省电模式，晚安喵～",
      "今天辛苦啦，明天也要好好生活哦。",
      "喵～我在梦里继续给你加油。",
      "轻轻哼一首晚安小调，陪你休息一会儿。",
      "我真的特别爱你，为什么你会落泪",
      "我真的特别爱你，答应我不再流泪，在这世界\n没有多少的时间，能让我对你思念"
    ]
  }
} as const;
