import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Issue, IssueMatch, IssueWatcher, SessionProvenance } from "../src"

describe("issue watcher contracts", () => {
  test("generated IDs validate their exact prefixes", () => {
    const ids = [
      [IssueWatcher.ID.create(), "iwt_"],
      [IssueWatcher.RunID.create(), "iwr_"],
      [IssueMatch.ID.create(), "imt_"],
      [IssueMatch.ObservationID.create(), "imo_"],
      [IssueMatch.SessionLinkID.create(), "ims_"],
      [IssueMatch.MaterializationID.create(), "imz_"],
      [IssueMatch.WritebackOperationID.create(), "iwo_"],
    ] as const

    ids.forEach(([id, prefix]) => expect(id).toStartWith(prefix))
    expect(() => Schema.decodeUnknownSync(IssueWatcher.ID)("iwt-invalid")).toThrow()
    expect(() => Schema.decodeUnknownSync(IssueMatch.ID)("imt-invalid")).toThrow()
  })

  test("normalizes JSON payloads without opaque values", () => {
    expect(
      Schema.decodeUnknownSync(Issue.Info)({
        id: "100",
        key: "DEV-100",
        title: "Ship it",
        description: "Ready",
        url: "https://issues.example/DEV-100",
        status: "Open",
        labels: ["api"],
        issueProject: "DEV",
        updatedAt: 1,
        raw: { revision: 1 },
      }),
    ).toMatchObject({ raw: { revision: 1 } })
    expect(() =>
      Schema.decodeUnknownSync(Issue.Info)({
        id: "100",
        key: "DEV-100",
        title: "Ship it",
        description: "Ready",
        url: "https://issues.example/DEV-100",
        status: "Open",
        labels: [],
        issueProject: "DEV",
        updatedAt: 1,
        raw: undefined,
      }),
    ).toThrow()
  })

  test("optional provenance fields omit undefined when encoded", () => {
    expect(
      Schema.encodeSync(SessionProvenance.Ref)(
        {
          ...Schema.decodeUnknownSync(SessionProvenance.Ref)({
            type: "issue",
            integrationID: "jira",
            externalKey: "DEV-100",
            externalUrl: "https://issues.example/DEV-100",
            watcherName: "API issues",
          }),
          watcherID: undefined,
          branch: undefined,
        },
      ),
    ).toEqual({
      type: "issue",
      integrationID: "jira",
      externalKey: "DEV-100",
      externalUrl: "https://issues.example/DEV-100",
      watcherName: "API issues",
    })
  })

  test("defines all current events and one durable materialization event", () => {
    expect(IssueWatcher.Event.Definitions.map((definition) => definition.type)).toEqual([
      "issue_watcher.updated",
      "issue_watcher.run.completed",
      "issue_match.created",
      "issue_match.updated",
      "issue_watcher.inbox.changed",
      "issue_watcher.session.materialized",
    ])
    expect(IssueWatcher.Event.DurableDefinitions).toEqual([IssueWatcher.Event.SessionMaterialized])
    expect(IssueWatcher.Event.SessionMaterialized.durable).toEqual({ aggregate: "materializationID", version: 1 })
  })
})
