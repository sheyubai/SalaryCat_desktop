export const DEFAULT_CONFIG = {
  applicationName: "Salary Cat",
  characterId: "salary-cat",
  window: {
    width: 240,
    // 80px speech space + 240px pet area + 24px shadow space below.
    height: 344,
    margin: 12,
    backgroundColor: "#00000000"
  },
  behavior: {
    happyDurationMs: 1_800,
    replyDurationMs: 6_000,
    sleepAfterMs: 60_000
  }
} as const;
