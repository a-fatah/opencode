import { describe, expect } from "bun:test"
import { Credential } from "@opencode-ai/core/credential"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { IssueWatcherWriteback } from "@opencode-ai/core/issue-watcher/writeback"
import { IssueWatcherOwner } from "@opencode-ai/core/issue-watcher/owner"
import { IssueProvider } from "@opencode-ai/core/issue-watcher/provider"
import {
  IssueMatchObservationTable,
  IssueMatchTable,
  IssueMaterializationTable,
  IssueWatcherRunTable,
  IssueWatcherTable,
  IssueWritebackOperationTable,
  SessionProvenanceTable,
} from "@opencode-ai/core/issue-watcher/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionExecutionAttemptTable, SessionTable } from "@opencode-ai/core/session/sql"
import { Credential as CredentialSchema } from "@opencode-ai/schema/credential"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Project } from "@opencode-ai/schema/project"
import { SessionExecutionAttempt } from "@opencode-ai/schema/session-execution-attempt"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Exit, Layer, Scope } from "effect"
import { testEffect } from "./lib/effect"

const activeOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "active" }),
})
const disabledOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "disabled", detail: "disabled for projection assertions" }),
})

const layer = (owner: Layer.Layer<IssueWatcherOwner.Service>) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      Credential.node,
      IssueProvider.node,
      IssueWatcherWriteback.node,
    ]),
    [
      [Database.node, Database.layerFromPath(":memory:")],
      [IssueWatcherOwner.node, owner],
    ],
  )

const integrationID = Integration.ID.make("writeback-test")
const connectionID = CredentialSchema.ConnectionID.make("icn_writeback-test")
const watcherID = IssueWatcher.ID.make("iwt_writeback-test")
const matchID = IssueMatch.ID.make("imt_writeback-test")
const materializationID = IssueMatch.MaterializationID.make("imz_writeback-test")
const observationID = IssueMatch.ObservationID.make("imo_writeback-test")
const runID = IssueWatcher.RunID.make("iwr_writeback-test")
const sessionID = SessionID.make("ses_writeback-test")
const messageID = SessionMessage.ID.make("msg_writeback-test")
const attemptID = SessionExecutionAttempt.ID.make("sea_writeback-test")
const projectID = Project.ID.make("writeback-test")
const timestamp = DateTime.makeUnsafe(1)

const issue = Issue.Info.make({
  id: "100",
  key: "DEV-100",
  title: "Fix writeback",
  description: "Exercise the durable outbox",
  url: "https://issues.example/DEV-100",
  status: "Open",
  labels: [],
  issueProject: "DEV",
  updatedAt: 1,
  raw: {},
})

const action = {
  mode: "run" as const,
  promptTemplate: "Fix {{issue.key}}",
  writeback: {
    comment: true,
    transitionOnStart: "In Progress",
    commentOnFailure: true,
  },
}

function seed(options?: { readonly failedAttempt?: boolean }) {
  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db.insert(ProjectTable).values({
      id: projectID,
      worktree: AbsolutePath.make("/tmp/writeback-test"),
      sandboxes: [],
    }).run().pipe(Effect.orDie)
    yield* db.insert(SessionTable).values({
      id: sessionID,
      project_id: projectID,
      slug: "writeback-test",
      directory: AbsolutePath.make("/tmp/writeback-test"),
      title: "Writeback test",
      version: "test",
    }).run().pipe(Effect.orDie)
    yield* db.insert(IssueWatcherTable).values({
      id: watcherID,
      integration_id: integrationID,
      connection_id: connectionID,
      name: "Writeback test",
      criteria: { issueProjects: [], watchUpdates: true },
      routing: { mappings: [], fallback: "inbox", workspace: { type: "current" } },
      action,
    }).run().pipe(Effect.orDie)
    yield* db.insert(IssueWatcherRunTable).values({
      id: runID,
      watcher_id: watcherID,
      started_at: 1,
      outcome: "ok",
    }).run().pipe(Effect.orDie)
    yield* db.insert(IssueMatchTable).values({
      id: matchID,
      watcher_id: watcherID,
      integration_id: integrationID,
      connection_id: connectionID,
      external_id: issue.id,
      external_key: issue.key,
      external_url: issue.url,
      fingerprint: "fingerprint",
      external_updated_at: issue.updatedAt,
      state: "pending",
      project_id: projectID,
      payload: issue,
    }).run().pipe(Effect.orDie)
    yield* db.insert(IssueMatchObservationTable).values({
      id: observationID,
      match_id: matchID,
      run_id: runID,
      fingerprint: "fingerprint",
      external_updated_at: issue.updatedAt,
      payload: issue,
    }).run().pipe(Effect.orDie)
    yield* db.insert(IssueMaterializationTable).values({
      id: materializationID,
      match_id: matchID,
      mode: "run",
      project_id: projectID,
      workspace: { type: "current" },
      baseline_observation_id: observationID,
      state: "scheduled",
      session_id: sessionID,
      message_id: messageID,
      execution_attempt_id: attemptID,
    }).run().pipe(Effect.orDie)
    yield* db.insert(SessionProvenanceTable).values({
      session_id: sessionID,
      kind: "issue",
      watcher_id: watcherID,
      match_id: matchID,
      integration_id: integrationID,
      connection_id: connectionID,
      external_key: issue.key,
      external_url: issue.url,
      watcher_name: "Writeback test",
      writeback: {
        comment: "OpenCode started work on DEV-100: Fix writeback",
        transitionOnStart: "In Progress",
        commentOnFailure: "OpenCode could not complete work on DEV-100.",
      },
    }).run().pipe(Effect.orDie)
    if (options?.failedAttempt) {
      yield* db.insert(SessionExecutionAttemptTable).values({
        id: attemptID,
        session_id: sessionID,
        message_id: messageID,
        owner_epoch: "owner",
        status: "failed",
        failure: { type: "provider", message: "model failed" },
        scheduled_at: 1,
        started_at: 2,
        completed_at: 3,
      }).run().pipe(Effect.orDie)
    }
    yield* (yield* Credential.Service).createConnection({
      integrationID,
      connectionID,
      tenantIdentity: "issues.example",
      value: CredentialSchema.Key.make({ type: "key", key: "secret", inputs: {} }),
    })
  })
}

function adapter(input?: {
  readonly comment?: IssueProvider.Adapter["comment"]
  readonly transition?: IssueProvider.Adapter["transition"]
  readonly reconcileComment?: NonNullable<IssueProvider.Adapter["reconcileComment"]>
}): IssueProvider.Adapter {
  return {
    integrationID,
    name: "Writeback test",
    method: { type: "key" as const },
    tenantIdentity: () => Effect.succeed("issues.example"),
    verify: () => Effect.succeed({ ok: true, detail: "connected" }),
    metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
    metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
    search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
    get: () => Effect.succeed(issue),
    comment: input?.comment ?? (() => Effect.succeed({})),
    transition: input?.transition ?? (() => Effect.succeed({})),
    ...(input?.reconcileComment ? { reconcileComment: input.reconcileComment } : {}),
  } satisfies IssueProvider.Adapter
}

function register(value: IssueProvider.Adapter) {
  return Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* (yield* IssueProvider.Service).register(value).pipe(Scope.provide(scope))
    yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
  })
}

function operations() {
  return Effect.gen(function* () {
    return yield* (yield* Database.Service).db.select().from(IssueWritebackOperationTable).all().pipe(Effect.orDie)
  })
}

function awaitOperation(
  state: "pending" | "applying" | "applied" | "failed" | "unknown",
  remaining = 100,
): Effect.Effect<typeof IssueWritebackOperationTable.$inferSelect, unknown, Database.Service> {
  return Effect.gen(function* () {
    const row = (yield* operations())[0]
    if (row?.state === state) return row
    if (remaining === 0) return yield* Effect.die(`Outbox did not reach ${state}; current state is ${row?.state ?? "missing"}`)
    yield* Effect.yieldNow
    return yield* awaitOperation(state, remaining - 1)
  })
}

describe("IssueWatcher Wave 7 writeback projection", () => {
  const it = testEffect(layer(disabledOwner))

  it.effect("atomically enqueues a deterministic materialized comment and deduplicates replay", () =>
    Effect.gen(function* () {
      yield* seed()
      const events = yield* EventV2.Service
      const db = (yield* Database.Service).db
      const rolledBack = yield* events.publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      }, { commit: () => Effect.die("rollback") }).pipe(Effect.exit)
      expect(Exit.isFailure(rolledBack)).toBe(true)
      expect(yield* operations()).toEqual([])
      expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual([])

      const published = yield* events.publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      const first = (yield* operations())[0]
      expect(first).toMatchObject({
        kind: "comment_created",
        trigger_id: materializationID,
        state: "pending",
        attempts: 0,
        request: {
          type: "comment",
          externalKey: issue.key,
          text: "OpenCode started work on DEV-100: Fix writeback",
        },
      })
      expect(first?.request).toMatchObject({ marker: `[opencode-writeback:${first.id}]` })
      if (!published.durable) return yield* Effect.die("Expected a durable materialized event")

      yield* events.replay({
        id: published.id,
        type: `${IssueWatcher.Event.SessionMaterialized.type}.1`,
        aggregateID: materializationID,
        seq: published.durable.seq,
        data: published.data,
      })
      expect(yield* operations()).toEqual([first])
    }),
  )

  it.effect("enqueues the configured transition when execution starts", () =>
    Effect.gen(function* () {
      yield* seed()
      yield* (yield* EventV2.Service).publish(SessionEvent.Execution.Started, {
        sessionID,
        messageID,
        attemptID,
        ownerEpoch: "owner",
        timestamp,
      })
      expect(yield* operations()).toMatchObject([{
        kind: "transition_started",
        trigger_id: attemptID,
        state: "pending",
        request: {
          type: "transition",
          externalKey: issue.key,
          targetStatus: "In Progress",
        },
      }])
    }),
  )

  it.effect("enqueues a distinct transition for a later explicit retry attempt", () =>
    Effect.gen(function* () {
      yield* seed()
      const retryAttemptID = SessionExecutionAttempt.ID.make("sea_writeback-retry")
      const retryMessageID = SessionMessage.ID.make("msg_writeback-retry")
      yield* (yield* EventV2.Service).publish(SessionEvent.Execution.Started, {
        sessionID,
        messageID: retryMessageID,
        attemptID: retryAttemptID,
        ownerEpoch: "owner",
        timestamp,
      })
      expect(yield* operations()).toMatchObject([{
        kind: "transition_started",
        trigger_id: retryAttemptID,
      }])
    }),
  )

  it.effect("requires an explicit failed-attempt failure comment and keeps it idempotent", () =>
    Effect.gen(function* () {
      yield* seed()
      const writeback = yield* IssueWatcherWriteback.Service
      const unavailable = yield* writeback.enqueueFailureComment(sessionID).pipe(Effect.flip)
      expect(unavailable).toMatchObject({
        _tag: "IssueWatcherWriteback.NotAvailableError",
        detail: "The latest execution attempt has not failed",
      })
      expect(yield* operations()).toEqual([])

      const db = (yield* Database.Service).db
      yield* db.insert(SessionExecutionAttemptTable).values({
        id: attemptID,
        session_id: sessionID,
        message_id: messageID,
        owner_epoch: "owner",
        status: "failed",
        failure: { type: "provider", message: "model failed" },
        scheduled_at: 1,
        completed_at: 2,
      }).run().pipe(Effect.orDie)
      yield* (yield* EventV2.Service).publish(SessionEvent.Execution.Failed, {
        sessionID,
        messageID,
        attemptID,
        ownerEpoch: "owner",
        timestamp,
        failure: { type: "provider", message: "model failed" },
      })
      expect(yield* operations()).toEqual([])

      const first = yield* writeback.enqueueFailureComment(sessionID)
      const second = yield* writeback.enqueueFailureComment(sessionID)
      expect(second.id).toBe(first.id)
      expect(yield* operations()).toMatchObject([{
        id: first.id,
        kind: "comment_failed",
        trigger_id: attemptID,
        state: "pending",
        request: { text: "OpenCode could not complete work on DEV-100. model failed" },
      }])
    }),
  )

  it.effect("keeps the outbox row when its session is deleted", () =>
    Effect.gen(function* () {
      yield* seed()
      yield* (yield* EventV2.Service).publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      const before = yield* operations()
      yield* (yield* Database.Service).db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
      expect(yield* operations()).toEqual(before)
      expect(yield* (yield* Database.Service).db.select().from(SessionProvenanceTable).all().pipe(Effect.orDie)).toEqual([])
    }),
  )
})

describe("IssueWatcher Wave 7 writeback delivery", () => {
  const it = testEffect(layer(activeOwner))

  it.effect("applies one pending operation once under concurrent event notifications", () =>
    Effect.gen(function* () {
      yield* seed()
      let calls = 0
      yield* register(adapter({ comment: () => Effect.sync(() => { calls++; return {} }) }))
      const events = yield* EventV2.Service
      yield* Effect.all([
        events.publish(IssueWatcher.Event.SessionMaterialized, { materializationID, matchID, sessionID }),
        events.publish(IssueWatcher.Event.SessionMaterialized, { materializationID, matchID, sessionID }),
      ], { concurrency: "unbounded" })
      const row = yield* awaitOperation("applied")
      expect(row.attempts).toBe(1)
      expect(row.provider_result_id).toBeNull()
      expect(calls).toBe(1)
      expect(yield* operations()).toHaveLength(1)
    }),
  )

  it.effect("recovers an accepted comment from provider reconciliation without sending it again", () =>
    Effect.gen(function* () {
      yield* seed()
      let calls = 0
      yield* register(adapter({
        comment: () => Effect.sync(() => { calls++; return {} }),
        reconcileComment: () => Effect.succeed({ applied: true, providerResultID: "comment-100" }),
      }))
      yield* (yield* EventV2.Service).publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      yield* awaitOperation("applied")
      const db = (yield* Database.Service).db
      yield* db.update(IssueWritebackOperationTable).set({
        state: "unknown",
        provider_result_id: null,
        error: "crashed after provider acceptance",
      }).where(eq(IssueWritebackOperationTable.session_id, sessionID)).run().pipe(Effect.orDie)

      yield* (yield* IssueWatcherWriteback.Service).reconcileSession(sessionID)
      const row = yield* awaitOperation("applied")
      expect(row.provider_result_id).toBe("comment-100")
      expect(calls).toBe(1)
    }),
  )

  it.effect("marks an ambiguous provider outcome unknown without a blind retry", () =>
    Effect.gen(function* () {
      yield* seed()
      let calls = 0
      yield* register(adapter({
        comment: () => Effect.gen(function* () {
          calls++
          return yield* new IssueProvider.AmbiguousRequestError({ detail: "connection closed after send" })
        }),
      }))
      yield* (yield* EventV2.Service).publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      const row = yield* awaitOperation("unknown")
      expect(row).toMatchObject({ attempts: 1, error: "connection closed after send" })
      yield* Effect.yieldNow
      expect(calls).toBe(1)
    }),
  )

  it.effect("retries only after reconciliation confirms the comment is absent", () =>
    Effect.gen(function* () {
      yield* seed()
      let calls = 0
      let successful = 0
      let reconciliations = 0
      yield* register(adapter({
        comment: () => Effect.gen(function* () {
          calls++
          if (calls === 1) return yield* new IssueProvider.AmbiguousRequestError({ detail: "unknown" })
          successful++
          return {}
        }),
        reconcileComment: () => Effect.sync(() => {
          reconciliations++
          return { applied: false }
        }),
      }))
      yield* (yield* EventV2.Service).publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      yield* awaitOperation("unknown")
      yield* (yield* IssueWatcherWriteback.Service).reconcileSession(sessionID)
      const row = yield* awaitOperation("applied")
      expect(row.attempts).toBe(2)
      expect(reconciliations).toBe(1)
      expect(calls).toBe(2)
      expect(successful).toBe(1)
    }),
  )
})

describe("IssueWatcher Wave 7 writeback recovery", () => {
  const it = testEffect(layer(disabledOwner))

  it.effect("moves applying work to unknown on active startup without blindly applying it", () =>
    Effect.gen(function* () {
      yield* seed()
      let calls = 0
      yield* register(adapter({ comment: () => Effect.sync(() => { calls++; return {} }) }))
      yield* (yield* EventV2.Service).publish(IssueWatcher.Event.SessionMaterialized, {
        materializationID,
        matchID,
        sessionID,
      })
      const dbService = yield* Database.Service
      yield* dbService.db.update(IssueWritebackOperationTable).set({ state: "applying", attempts: 1 })
        .where(eq(IssueWritebackOperationTable.session_id, sessionID)).run().pipe(Effect.orDie)

      const startupScope = yield* Scope.make()
      const context = yield* Layer.buildWithMemoMap(AppNodeBuilder.build(IssueWatcherWriteback.node, [
        [Database.node, Layer.succeed(Database.Service, dbService)],
        [EventV2.node, Layer.succeed(EventV2.Service, yield* EventV2.Service)],
        [Credential.node, Layer.succeed(Credential.Service, yield* Credential.Service)],
        [IssueProvider.node, Layer.succeed(IssueProvider.Service, yield* IssueProvider.Service)],
        [IssueWatcherOwner.node, activeOwner],
      ]), Layer.makeMemoMapUnsafe(), startupScope)
      void context

      const row = yield* awaitOperation("unknown")
      expect(row).toMatchObject({
        attempts: 1,
        error: "Provider cannot reconcile comments",
      })
      expect(calls).toBe(0)
      yield* Scope.close(startupScope, Exit.void)
    }),
  )
})
