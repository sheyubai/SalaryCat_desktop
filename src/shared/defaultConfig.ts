export const DEFAULT_CONFIG = {
  applicationName: "Salary Cat",
  characterId: "salary-cat",
  window: {
    width: 240,
    // 240px pet area + 80px transparent space above for the speech bubble.
    height: 320,
    margin: 12,
    backgroundColor: "#00000000"
  },
  behavior: {
    happyDurationMs: 1_800,
    replyDurationMs: 6_000,
    sleepAfterMs: 60_000
  }
} as const;
