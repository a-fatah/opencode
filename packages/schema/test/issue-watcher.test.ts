import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Credential, Integration, Issue, IssueMatch, IssueWatcher, SessionProvenance } from "../src"

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

  test("keeps key prompts and verification fields precise", () => {
    expect(
      Schema.decodeUnknownSync(Integration.KeyMethod)({
        type: "key",
        prompts: [{ type: "text", key: "site", message: "Site URL" }],
      }).prompts,
    ).toHaveLength(1)
    expect(
      Schema.decodeUnknownSync(Credential.Key)({
        type: "key",
        key: "secret",
        inputs: { site: "https://example.atlassian.net", email: "dev@example.com" },
        verification: { status: "connected", detail: "Connected", checkedAt: 1 },
      }),
    ).toMatchObject({ inputs: { email: "dev@example.com" }, verification: { status: "connected" } })
    expect(Schema.decodeUnknownSync(Credential.Key)({ type: "key", key: "legacy" }).inputs).toEqual({})
  })

  test("defines bounded preview input and output contracts", () => {
    const input = Schema.decodeUnknownSync(IssueWatcher.PreviewInput)({
      integrationID: "jira",
      connectionID: "icn_connection",
      criteria: { issueProjects: ["DEV"], watchUpdates: true },
      routing: { mappings: [], fallback: "inbox", workspace: { type: "current" } },
      action: { mode: "inbox", promptTemplate: "{{issue.key}}", writeback: { comment: false, commentOnFailure: false } },
    })
    expect(String(input.connectionID)).toBe("icn_connection")
    expect(Schema.decodeUnknownSync(IssueWatcher.Preview)({ matches: [], truncated: false })).toEqual({
      matches: [],
      truncated: false,
    })
  })

  test("defines tagged history and paginated inbox contracts", () => {
    expect(
      Schema.decodeUnknownSync(IssueWatcher.HistoryEntry)({
        type: "run",
        run: {
          id: "iwr_run",
          watcherID: "iwt_watcher",
          startedAt: 1,
          outcome: "ok",
          scanned: 1,
          matched: 1,
          created: 0,
          queued: 0,
          unrouted: 1,
          skipped: 0,
          failed: 0,
        },
      }).type,
    ).toBe("run")
    expect(Schema.decodeUnknownSync(IssueWatcher.InboxPage)({ items: [] })).toEqual({ items: [] })
  })

  test("defines Slice 8 action results as tagged contracts", () => {
    expect(
      Schema.decodeUnknownSync(IssueWatcher.MaterializeResult)({
        status: "created",
        materializationID: "imz_materialization",
        sessionID: "ses_session",
      }).status,
    ).toBe("created")
    expect(
      Schema.decodeUnknownSync(IssueWatcher.BulkResult)({
        items: [{ status: "failed", matchID: "imt_match", error: { code: "unrouted", message: "Pick a project" } }],
      }).items[0]?.status,
    ).toBe("failed")
    expect(() =>
      Schema.decodeUnknownSync(IssueWatcher.DuplicateResolutionInput)({ action: "create_second", mode: "inbox" }),
    ).toThrow()
  })
})
