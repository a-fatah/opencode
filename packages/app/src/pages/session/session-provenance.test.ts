import { describe, expect, test } from "bun:test"
import type { SessionProvenanceDetail } from "./session-provenance"
import { provenanceLastSync, provenanceLocation, provenanceQueryEnabled, provenanceWritebackEntry, provenanceWritebackStatus } from "./session-provenance"

describe("session provenance", () => {
  test("enables issue provenance and resolves materialized branch and workspace", () => {
    expect(
      provenanceQueryEnabled({
        type: "issue",
        integrationID: "linear",
        externalKey: "ENG-42",
        externalUrl: "https://linear.app/issue/ENG-42",
        watcherName: "Engineering",
      }),
    ).toBe(true)

    const detail = {
      provenance: { branch: "fallback" },
      branch: "eng-42",
      workspace: { directory: "/repo/eng-42", workspaceID: "workspace-42" },
    } as unknown as SessionProvenanceDetail
    expect(provenanceLocation(detail)).toEqual({
      branch: "eng-42",
      directory: "/repo/eng-42",
      workspaceID: "workspace-42",
    })
  })

  test("summarizes writeback and sync state", () => {
    const detail = {
      provenance: { lastSyncedAt: 10 },
      writebacks: [{ state: "applied" }],
    } as unknown as SessionProvenanceDetail
    expect(provenanceWritebackStatus(detail)).toBe("Writeback synced")
    expect(provenanceLastSync(detail)).toBe(10)
    expect(provenanceWritebackStatus({ ...detail, writebacks: [{ state: "failed" }] } as unknown as SessionProvenanceDetail)).toBe("Writeback failed")
  })

  test("describes each writeback checklist entry and status", () => {
    expect(provenanceWritebackEntry({ kind: "comment_created", state: "applied" } as SessionProvenanceDetail["writebacks"][number])).toEqual({ label: "Start comment", status: "Synced" })
    expect(provenanceWritebackEntry({ kind: "transition_started", state: "applying" } as SessionProvenanceDetail["writebacks"][number])).toEqual({ label: "Start transition", status: "Applying" })
    expect(provenanceWritebackEntry({ kind: "comment_failed", state: "failed" } as SessionProvenanceDetail["writebacks"][number])).toEqual({ label: "Failure comment", status: "Failed" })
  })
})
