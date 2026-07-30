import { describe, expect, test } from "bun:test"
import { getRelativeTime } from "./time"

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === "common.time.justNow") return "Just now"
  return `${params?.count}${key.includes("minutes") ? "m" : key.includes("hours") ? "h" : "d"} ago`
}

describe("getRelativeTime", () => {
  test("accepts millisecond timestamps", () => {
    const now = Date.now()
    expect(getRelativeTime(now - 30_000, t)).toBe("Just now")
    expect(getRelativeTime(now - 5 * 60_000, t)).toBe("5m ago")
    expect(getRelativeTime(now - 3 * 60 * 60_000, t)).toBe("3h ago")
    expect(getRelativeTime(now - 2 * 24 * 60 * 60_000, t)).toBe("2d ago")
  })
})
