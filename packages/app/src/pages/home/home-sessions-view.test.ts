import { describe, expect, test } from "bun:test"
import { homeRelativeTime, homeSessionMatchesSource, homeSessionSourceGroups } from "./home-session-metadata"

describe("Home session issue metadata", () => {
  test("formats relative update times", () => {
    const now = 10 * 60 * 60 * 1000
    expect(homeRelativeTime(now - 30_000, now)).toBe("just now")
    expect(homeRelativeTime(now - 5 * 60_000, now)).toBe("5m ago")
    expect(homeRelativeTime(now - 2 * 60 * 60_000, now)).toBe("2h ago")
  })

  test("filters issue and manual sessions", () => {
    expect([true, false].filter((issue) => homeSessionMatchesSource("all", issue))).toEqual([true, false])
    expect([true, false].filter((issue) => homeSessionMatchesSource("issues", issue))).toEqual([true])
    expect([true, false].filter((issue) => homeSessionMatchesSource("manual", issue))).toEqual([false])
  })

  test("groups issue and manual sessions into visible source sections", () => {
    const records = [{ id: "manual", issue: false }, { id: "issue", issue: true }, { id: "issue-2", issue: true }]
    expect(homeSessionSourceGroups(records, (record) => record.issue)).toEqual([
      { id: "issues", title: "From issues", sessions: [records[1], records[2]] },
      { id: "manual", title: "Manual", sessions: [records[0]] },
    ])
  })
})
