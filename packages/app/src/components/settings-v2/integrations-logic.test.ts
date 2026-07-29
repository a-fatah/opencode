import { describe, expect, test } from "bun:test"
import { tenantPromptKey, valuesFingerprint, visiblePrompts, type KeyMethod } from "./integrations-logic"

const method = {
  type: "key",
  prompts: [
    { type: "select", key: "cloud", message: "Hosting", options: [{ label: "Cloud", value: "yes" }] },
    { type: "text", key: "site", message: "Jira site URL", when: { key: "cloud", op: "eq", value: "yes" } },
    { type: "text", key: "host", message: "Server", when: { key: "cloud", op: "neq", value: "yes" } },
  ],
} satisfies KeyMethod

describe("integration connection state", () => {
  test("evaluates conditional prompts", () => {
    expect(visiblePrompts(method, { cloud: "yes" }).map((prompt) => prompt.key)).toEqual(["cloud", "site"])
  })

  test("derives the tenant prompt from method metadata", () => {
    expect(tenantPromptKey(method, "https://team.atlassian.net")).toBe("site")
  })

  test("fingerprints are stable and change with credentials", () => {
    expect(valuesFingerprint("secret", { b: "2", a: "1" })).toBe(valuesFingerprint("secret", { a: "1", b: "2" }))
    expect(valuesFingerprint("next", { a: "1" })).not.toBe(valuesFingerprint("secret", { a: "1" }))
  })
})
