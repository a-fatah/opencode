export * as IssueWatcherWriteback from "./writeback"

import { Credential } from "@opencode-ai/schema/credential"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Integration } from "@opencode-ai/schema/integration"
import { SessionExecutionAttempt } from "@opencode-ai/schema/session-execution-attempt"
import { SessionID } from "@opencode-ai/schema/session-id"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { Credential as CredentialService } from "../credential"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { SessionEvent } from "../session/event"
import { SessionExecutionAttemptTable } from "../session/sql"
import { Hash } from "../util/hash"
import { IssueProvider } from "./provider"
import { IssueWatcherOwner } from "./owner"
import {
  IssueMatchTable,
  IssueWatcherTable,
  IssueWritebackOperationTable,
  SessionProvenanceTable,
} from "./sql"

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "IssueWatcherWriteback.NotFoundError",
  { sessionID: SessionID },
) {}

export class NotAvailableError extends Schema.TaggedErrorClass<NotAvailableError>()(
  "IssueWatcherWriteback.NotAvailableError",
  { sessionID: SessionID, detail: Schema.String },
) {}

export interface Interface {
  readonly enqueueFailureComment: (
    sessionID: SessionID,
  ) => Effect.Effect<IssueMatch.WritebackOperation, NotFoundError | NotAvailableError>
  readonly reconcileSession: (sessionID: SessionID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/IssueWatcherWriteback") {}

type WritebackContext = {
  readonly provenance: typeof SessionProvenanceTable.$inferSelect
  readonly match: typeof IssueMatchTable.$inferSelect
  readonly watcher: typeof IssueWatcherTable.$inferSelect
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const providers = yield* IssueProvider.Service
    const credentials = yield* CredentialService.Service
    const owner = yield* IssueWatcherOwner.Service
    const scope = yield* Effect.scope
    const capacity = Semaphore.makeUnsafe(1)
    const decode = Schema.decodeUnknownSync(IssueMatch.WritebackOperation)

    const operationID = (sessionID: SessionID, kind: IssueMatch.WritebackOperation["kind"], triggerID: string) =>
      IssueMatch.WritebackOperationID.make(
        `iwo_${Hash.sha256(`${sessionID}\0${kind}\0${triggerID}`).slice(0, 28)}`,
      )

    const stored = (row: typeof IssueWritebackOperationTable.$inferSelect) => decode({
      id: row.id,
      sessionID: row.session_id,
      kind: row.kind,
      triggerID: row.trigger_id,
      request: row.request,
      state: row.state,
      ...(row.provider_result_id ? { providerResultID: row.provider_result_id } : {}),
      attempts: row.attempts,
      ...(row.error ? { error: row.error } : {}),
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    })

    const enqueue = Effect.fnUntraced(function* (input: {
      readonly sessionID: SessionID
      readonly kind: IssueMatch.WritebackOperation["kind"]
      readonly triggerID: string
      readonly request: IssueMatch.WritebackRequest
    }) {
      const id = operationID(input.sessionID, input.kind, input.triggerID)
      yield* db.insert(IssueWritebackOperationTable).values({
        id,
        session_id: input.sessionID,
        kind: input.kind,
        trigger_id: input.triggerID,
        request: input.request,
        state: "pending",
      }).onConflictDoNothing().run().pipe(Effect.orDie)
      const row = yield* db.select().from(IssueWritebackOperationTable)
        .where(eq(IssueWritebackOperationTable.id, id)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.die(`Write-back operation was not persisted: ${id}`)
      return stored(row)
    })

    const context = Effect.fnUntraced(function* (sessionID: SessionID) {
      const row = yield* db.select({
        provenance: SessionProvenanceTable,
        match: IssueMatchTable,
        watcher: IssueWatcherTable,
      }).from(SessionProvenanceTable)
        .innerJoin(IssueMatchTable, eq(IssueMatchTable.id, SessionProvenanceTable.match_id))
        .innerJoin(IssueWatcherTable, eq(IssueWatcherTable.id, IssueMatchTable.watcher_id))
        .where(eq(SessionProvenanceTable.session_id, sessionID)).get().pipe(Effect.orDie)
      return row
    })

    const commentRequest = (
      id: IssueMatch.WritebackOperationID,
      row: WritebackContext,
      text: string,
    ): IssueMatch.CommentWritebackRequest => ({
      type: "comment",
      integrationID: Integration.ID.make(row.match.integration_id),
      connectionID: Credential.ConnectionID.make(row.match.connection_id),
      externalKey: row.match.external_key,
      text,
      marker: `[opencode-writeback:${id}]`,
    })

    const projectMaterialized = Effect.fnUntraced(function* (
      event: typeof IssueWatcher.Event.SessionMaterialized.Type,
    ) {
      const row = yield* context(event.data.sessionID)
      if (!row || row.match.id !== event.data.matchID) {
        return yield* Effect.die(`Materialized write-back context mismatch: ${event.data.materializationID}`)
      }
      if (!row.provenance.writeback.comment) return
      const id = operationID(event.data.sessionID, "comment_created", event.data.materializationID)
      yield* enqueue({
        sessionID: event.data.sessionID,
        kind: "comment_created",
        triggerID: event.data.materializationID,
        request: commentRequest(
          id,
          row,
          row.provenance.writeback.comment,
        ),
      })
    })

    const projectStarted = Effect.fnUntraced(function* (event: typeof SessionEvent.Execution.Started.Type) {
      const row = yield* context(event.data.sessionID)
      if (!row?.provenance.writeback.transitionOnStart) return
      yield* enqueue({
        sessionID: event.data.sessionID,
        kind: "transition_started",
        triggerID: event.data.attemptID,
        request: {
          type: "transition",
          integrationID: Integration.ID.make(row.match.integration_id),
          connectionID: Credential.ConnectionID.make(row.match.connection_id),
          externalKey: row.match.external_key,
          targetStatus: row.provenance.writeback.transitionOnStart,
        },
      })
    })

    const providerContext = Effect.fnUntraced(function* (request: IssueMatch.WritebackRequest) {
      const adapter = yield* providers.get(request.integrationID)
      if (!adapter) return yield* Effect.fail(`Issue provider not found: ${request.integrationID}`)
      const credential = yield* credentials.getConnection(Credential.ConnectionID.make(request.connectionID))
      if (!credential || credential.integrationID !== request.integrationID || credential.value.type !== "key") {
        return yield* Effect.fail(`Issue source connection not found: ${request.connectionID}`)
      }
      return { adapter, credential: credential.value }
    })

    const apply = Effect.fnUntraced(function* (row: typeof IssueWritebackOperationTable.$inferSelect) {
      const request = Schema.decodeUnknownSync(IssueMatch.WritebackRequest)(row.request)
      const provider = yield* providerContext(request)
      if (request.type === "comment") {
        return yield* provider.adapter.comment(provider.credential, {
          issueKey: request.externalKey,
          text: request.text,
          operationKey: row.id,
          marker: request.marker,
        })
      }
      return yield* provider.adapter.transition(provider.credential, {
        issueKey: request.externalKey,
        targetStatus: request.targetStatus,
      })
    })

    const errorDetail = (error: unknown) => {
      if (typeof error === "string") return error
      if (error && typeof error === "object" && "detail" in error && typeof error.detail === "string") return error.detail
      return String(error)
    }

    const claim = Effect.fnUntraced(function* () {
      return yield* db.transaction((tx) => Effect.gen(function* () {
        const row = yield* tx.select().from(IssueWritebackOperationTable)
          .where(eq(IssueWritebackOperationTable.state, "pending"))
          .orderBy(asc(IssueWritebackOperationTable.time_created)).get()
        if (!row) return undefined
        const claimed = yield* tx.update(IssueWritebackOperationTable).set({
          state: "applying",
          attempts: row.attempts + 1,
          error: null,
        }).where(and(
          eq(IssueWritebackOperationTable.id, row.id),
          eq(IssueWritebackOperationTable.state, "pending"),
        )).returning().get()
        return claimed
      }), { behavior: "immediate" }).pipe(Effect.orDie)
    })

    const process = Effect.fnUntraced(function* (row: typeof IssueWritebackOperationTable.$inferSelect) {
      const result = yield* Effect.result(apply(row))
      if (result._tag === "Success") {
        const success = result.success ?? {}
        yield* db.update(IssueWritebackOperationTable).set({
          state: "applied",
          error: null,
          provider_result_id: success.providerResultID ?? null,
        })
          .where(and(eq(IssueWritebackOperationTable.id, row.id), eq(IssueWritebackOperationTable.state, "applying")))
          .run().pipe(Effect.orDie)
        return
      }
      const error = result.failure
      const state = error instanceof IssueProvider.AmbiguousRequestError ? "unknown" as const : "failed" as const
      yield* db.update(IssueWritebackOperationTable).set({ state, error: errorDetail(result.failure) })
        .where(and(eq(IssueWritebackOperationTable.id, row.id), eq(IssueWritebackOperationTable.state, "applying")))
        .run().pipe(Effect.orDie)
    })

    const drain = capacity.withPermit(Effect.gen(function* () {
      while (true) {
        const row = yield* claim()
        if (!row) return
        yield* process(row)
      }
    }))

    const wake = () => owner.status().status !== "active"
      ? Effect.void
      : drain.pipe(Effect.forkIn(scope), Effect.asVoid)

    const reconcile = Effect.fnUntraced(function* (row: typeof IssueWritebackOperationTable.$inferSelect) {
      const request = Schema.decodeUnknownSync(IssueMatch.WritebackRequest)(row.request)
      const result = yield* Effect.result(Effect.gen(function* () {
        const provider = yield* providerContext(request)
        if (request.type === "comment") {
          if (!provider.adapter.reconcileComment) return yield* Effect.fail("Provider cannot reconcile comments")
          return yield* provider.adapter.reconcileComment(provider.credential, {
            issueKey: request.externalKey,
            text: request.text,
            operationKey: row.id,
            marker: request.marker,
          })
        }
        if (!provider.adapter.reconcileTransition) return yield* Effect.fail("Provider cannot reconcile transitions")
        return yield* provider.adapter.reconcileTransition(provider.credential, {
          issueKey: request.externalKey,
          targetStatus: request.targetStatus,
        })
      }))
      if (result._tag === "Failure") {
        yield* db.update(IssueWritebackOperationTable).set({ error: errorDetail(result.failure) })
          .where(and(eq(IssueWritebackOperationTable.id, row.id), eq(IssueWritebackOperationTable.state, "unknown")))
          .run().pipe(Effect.orDie)
        return
      }
      if (result.success.applied) {
        yield* db.update(IssueWritebackOperationTable).set({
          state: "applied",
          error: null,
          provider_result_id: result.success.providerResultID ?? null,
        })
          .where(and(eq(IssueWritebackOperationTable.id, row.id), eq(IssueWritebackOperationTable.state, "unknown")))
          .run().pipe(Effect.orDie)
        return
      }
      if (request.type === "transition") {
        yield* db.update(IssueWritebackOperationTable).set({
          error: "Jira's current status does not prove whether this transition was previously applied.",
        }).where(and(
          eq(IssueWritebackOperationTable.id, row.id),
          eq(IssueWritebackOperationTable.state, "unknown"),
        )).run().pipe(Effect.orDie)
        return
      }
      yield* db.update(IssueWritebackOperationTable).set({
        state: "pending",
        error: null,
      })
        .where(and(eq(IssueWritebackOperationTable.id, row.id), eq(IssueWritebackOperationTable.state, "unknown")))
        .run().pipe(Effect.orDie)
      yield* wake()
    })

    const reconcileSession = Effect.fn("IssueWatcherWriteback.reconcileSession")(function* (sessionID: SessionID) {
      const rows = yield* db.select().from(IssueWritebackOperationTable).where(and(
        eq(IssueWritebackOperationTable.session_id, sessionID),
        eq(IssueWritebackOperationTable.state, "unknown"),
      )).all().pipe(Effect.orDie)
      yield* Effect.forEach(rows, reconcile, { concurrency: 1, discard: true })
    })

    const service = Service.of({
      enqueueFailureComment: Effect.fn("IssueWatcherWriteback.enqueueFailureComment")(function* (sessionID) {
        const row = yield* context(sessionID)
        if (!row) return yield* new NotFoundError({ sessionID })
        if (!row.provenance.writeback.commentOnFailure) {
          return yield* new NotAvailableError({ sessionID, detail: "Failure comments are not configured" })
        }
        const attempt = yield* db.select().from(SessionExecutionAttemptTable)
          .where(eq(SessionExecutionAttemptTable.session_id, sessionID))
          .orderBy(desc(SessionExecutionAttemptTable.scheduled_at), desc(sql<number>`rowid`)).get().pipe(Effect.orDie)
        if (attempt?.status !== "failed" || !attempt.failure) {
          return yield* new NotAvailableError({ sessionID, detail: "The latest execution attempt has not failed" })
        }
        const id = operationID(sessionID, "comment_failed", SessionExecutionAttempt.ID.make(attempt.id))
        const operation = yield* enqueue({
          sessionID,
          kind: "comment_failed",
          triggerID: attempt.id,
          request: commentRequest(
            id,
            row,
            `${row.provenance.writeback.commentOnFailure} ${attempt.failure.message}`,
          ),
        })
        if (operation.state === "failed") {
          yield* db.update(IssueWritebackOperationTable).set({ state: "pending", error: null })
            .where(and(
              eq(IssueWritebackOperationTable.id, operation.id),
              eq(IssueWritebackOperationTable.state, "failed"),
            )).run().pipe(Effect.orDie)
        }
        yield* wake()
        const updated = yield* db.select().from(IssueWritebackOperationTable)
          .where(eq(IssueWritebackOperationTable.id, operation.id)).get().pipe(Effect.orDie)
        return updated ? stored(updated) : operation
      }),
      reconcileSession,
    })

    yield* events.project(IssueWatcher.Event.SessionMaterialized, projectMaterialized)
    yield* events.project(SessionEvent.Execution.Started, projectStarted)
    yield* events.listen((event) => {
      if (
        event.type !== IssueWatcher.Event.SessionMaterialized.type &&
        event.type !== SessionEvent.Execution.Started.type
      ) return Effect.void
      return wake()
    })
    if (owner.status().status === "active") {
      yield* db.update(IssueWritebackOperationTable).set({
        state: "unknown",
        error: "OpenCode exited while the provider outcome was unresolved",
      }).where(eq(IssueWritebackOperationTable.state, "applying")).run().pipe(Effect.orDie)
      const unknown = yield* db.select().from(IssueWritebackOperationTable)
        .where(eq(IssueWritebackOperationTable.state, "unknown")).all().pipe(Effect.orDie)
      yield* Effect.forEach(unknown, reconcile, { concurrency: 1, discard: true })
      yield* wake()
    }
    return service
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, CredentialService.node, IssueProvider.node, IssueWatcherOwner.node],
})
