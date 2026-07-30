export * as IssueWatcherMaterialization from "./materialization"

import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { Agent as AgentV2 } from "@opencode-ai/schema/agent"
import { Project } from "@opencode-ai/schema/project"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Model as ModelV2 } from "@opencode-ai/schema/model"
import { Provider as ProviderV2 } from "@opencode-ai/schema/provider"
import { SessionID } from "@opencode-ai/schema/session-id"
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { Cause, DateTime, Deferred, Effect, Exit, Option, Semaphore } from "effect"
import type { Database } from "../database/database"
import { EventV2 } from "../event"
import type { ProjectRoutingCatalog } from "../project/routing-catalog"
import { SessionV2 } from "../session"
import { SessionEvent } from "../session/event"
import { SessionExecutionAttempt } from "../session/execution-attempt"
import { SessionMessage } from "../session/message"
import { SessionInputTable } from "../session/sql"
import type { WorkspaceProvisioner } from "../workspace-provisioner"
import { Hash } from "../util/hash"
import { renderPrompt } from "./prompt"
import {
  IssueMatchObservationTable,
  IssueMatchSessionTable,
  IssueMatchTable,
  IssueMaterializationTable,
  IssueSessionClaimTable,
  IssueWatcherIgnoreTable,
  IssueWatcherTable,
  SessionProvenanceTable,
} from "./sql"

type Db = Database.Interface["db"]
const defaultIssueModel = ModelV2.Ref.make({
  id: ModelV2.ID.make("gpt-5.6-terra"),
  providerID: ProviderV2.ID.githubCopilot,
})

export interface Provenance {
  readonly sessionID: SessionID
  readonly watcherID?: IssueWatcher.ID
  readonly matchID?: IssueMatch.ID
  readonly integrationID: string
  readonly connectionID: string
  readonly externalKey: string
  readonly externalUrl: string
  readonly watcherName: string
  readonly branch?: string
  readonly lastSyncedAt?: number
}

export interface MaterializeInput {
  readonly matchID: IssueMatch.ID
  readonly mode?: IssueMatch.Materialization["mode"]
  readonly projectID?: IssueMatch.Materialization["projectID"]
  readonly directory?: IssueMatch.Materialization["sourceDirectory"]
  readonly workspace?: IssueWatcher.Workspace
  readonly rematerialize?: boolean
  readonly secondary?: boolean
}

export interface BulkResult {
  readonly succeeded: ReadonlyArray<IssueMatch.ID>
  readonly failed: ReadonlyArray<{ readonly matchID: IssueMatch.ID; readonly error: string }>
}

export type DuplicateResult = IssueMatch.Materialization & { readonly _tag: "Duplicate" }

export type MaterializeResult = IssueMatch.Materialization | DuplicateResult | undefined

export interface Interface {
  readonly materialize: (input: MaterializeInput) => Effect.Effect<MaterializeResult>
  readonly route: (matchID: IssueMatch.ID, projectID: IssueMatch.Materialization["projectID"]) => Effect.Effect<void>
  readonly skip: (matchID: IssueMatch.ID) => Effect.Effect<void>
  readonly dismiss: (matchID: IssueMatch.ID) => Effect.Effect<void>
  readonly ignore: (matchID: IssueMatch.ID, reason?: string) => Effect.Effect<void>
  readonly bulk: (matchIDs: ReadonlyArray<IssueMatch.ID>, action: "approve" | "run" | "skip" | "dismiss") => Effect.Effect<BulkResult>
  readonly provenance: (sessionID: SessionID) => Effect.Effect<Provenance | undefined>
  readonly syncProvenance: (sessionID: SessionID) => Effect.Effect<Provenance | undefined>
  readonly reconcile: () => Effect.Effect<void>
}

export const make = Effect.fn("IssueWatcherMaterialization.make")(function* (input: {
  readonly db: Db
  readonly events: EventV2.Interface
  readonly projects: ProjectRoutingCatalog.Interface
  readonly workspaces: WorkspaceProvisioner.Interface
  readonly sessions: SessionV2.Interface
  readonly settings: () => Effect.Effect<{ readonly concurrentRuns: number; readonly retryFailedRuns: "never" | "once" }>
}) {
  const active = new Map<IssueMatch.MaterializationID, Deferred.Deferred<IssueMatch.Materialization>>()
  const capacity = Semaphore.makeUnsafe(1)
  const reservations = new Map<IssueMatch.ID, SessionID | undefined>()
  const decode = (row: typeof IssueMaterializationTable.$inferSelect) => IssueMatch.Materialization.make({
    id: row.id,
    matchID: row.match_id,
    mode: row.mode,
    projectID: Project.ID.make(row.project_id),
    ...(row.source_directory ? { sourceDirectory: row.source_directory } : {}),
    workspace: row.workspace,
    ...(row.resolved_location ? { resolvedLocation: row.resolved_location } : {}),
    ...(row.workspace_lease ? { workspaceLease: row.workspace_lease } : {}),
    baselineObservationID: row.baseline_observation_id,
    state: row.state,
    sessionID: SessionID.make(row.session_id),
    messageID: SessionMessage.ID.make(row.message_id),
    ...(row.execution_attempt_id
      ? { executionAttemptID: SessionExecutionAttempt.ID.make(row.execution_attempt_id) }
      : {}),
    providerStarted: row.provider_started,
    attempts: row.attempts,
    ...(row.error ? { error: row.error } : {}),
    timeCreated: DateTime.makeUnsafe(row.time_created),
    timeUpdated: DateTime.makeUnsafe(row.time_updated),
  })
  const get = Effect.fnUntraced(function* (id: IssueMatch.MaterializationID) {
    const row = yield* input.db.select().from(IssueMaterializationTable)
      .where(eq(IssueMaterializationTable.id, id)).get().pipe(Effect.orDie)
    if (!row) return yield* Effect.die(`Issue materialization not found: ${id}`)
    return row
  })
  const id = (prefix: string, value: string) => `${prefix}${Hash.sha256(value).slice(0, 28)}`
  const reserveRun = Effect.fnUntraced(function* (matchID: IssueMatch.ID) {
    return yield* capacity.withPermit(Effect.gen(function* () {
      const settings = yield* input.settings()
      const running = yield* input.sessions.active
      for (const [reservedMatchID, sessionID] of reservations) {
        if (sessionID && running.has(sessionID)) reservations.delete(reservedMatchID)
      }
      if (running.size + reservations.size >= settings.concurrentRuns) return false
      reservations.set(matchID, undefined)
      return true
    }))
  })

  const continueMaterialization = Effect.fnUntraced(function* (materializationID: IssueMatch.MaterializationID) {
    const initial = yield* get(materializationID)
    if (["completed", "failed", "cancelled", "handoff_unknown"].includes(initial.state)) return decode(initial)
    const match = yield* input.db.select().from(IssueMatchTable)
      .where(eq(IssueMatchTable.id, initial.match_id)).get().pipe(Effect.orDie)
    const watcher = match
      ? yield* input.db.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, match.watcher_id)).get().pipe(Effect.orDie)
      : undefined
    const observation = yield* input.db.select().from(IssueMatchObservationTable)
      .where(eq(IssueMatchObservationTable.id, initial.baseline_observation_id)).get().pipe(Effect.orDie)
    if (!match || !watcher || !observation) return yield* Effect.die(`Issue match not found: ${initial.match_id}`)

    const project = yield* input.projects.resolve(Project.ID.make(initial.project_id), initial.source_directory ?? undefined)
    const legacyProjectSnapshot = initial.prompt === null
      ? (yield* input.projects.list()).find((item) => item.projectID === initial.project_id)
      : undefined
    const secondary = !(yield* input.db.select({ id: IssueSessionClaimTable.materialization_id })
      .from(IssueSessionClaimTable).where(eq(IssueSessionClaimTable.materialization_id, initial.id)).get().pipe(Effect.orDie))
    const lease = initial.workspace_lease ?? (yield* input.workspaces.reserve({
      ownerID: initial.id,
      inputKey: match.external_key,
      project,
      strategy: initial.workspace,
    }))
    if (!initial.workspace_lease) {
      yield* input.db.update(IssueMaterializationTable).set({ workspace_lease: lease, state: "provisioning", error: null })
        .where(eq(IssueMaterializationTable.id, initial.id)).run().pipe(Effect.orDie)
    }
    const provisioned = yield* input.workspaces.provision(lease)
    yield* input.db.update(IssueMaterializationTable).set({ resolved_location: provisioned.location })
      .where(eq(IssueMaterializationTable.id, initial.id)).run().pipe(Effect.orDie)

    const session = yield* input.sessions.create({
      id: SessionID.make(initial.session_id),
      location: provisioned.location,
      agent: AgentV2.ID.make("build"),
      model: defaultIssueModel,
    })
    if (
      session.location.directory !== provisioned.location.directory ||
      (session.location.workspaceID ?? undefined) !== (provisioned.location.workspaceID ?? undefined)
    ) return yield* Effect.die(`Materialization Session identity conflicts with resolved Location: ${initial.id}`)
    yield* input.db.update(IssueMaterializationTable).set({ state: "session_created" })
      .where(eq(IssueMaterializationTable.id, initial.id)).run().pipe(Effect.orDie)
    const admitted = yield* input.sessions.prompt({
      id: SessionMessage.ID.make(initial.message_id),
      sessionID: SessionID.make(initial.session_id),
      prompt: { text: initial.prompt ?? renderPrompt(observation.payload, legacyProjectSnapshot, initial.action.promptTemplate) },
      resume: false,
    })
    if (admitted.sessionID !== initial.session_id || admitted.id !== initial.message_id)
      return yield* Effect.die(`Materialization prompt identity conflicts with deterministic input: ${initial.id}`)
    yield* input.db.transaction((tx) => Effect.gen(function* () {
      yield* tx.insert(IssueMatchSessionTable).values({
        id: IssueMatch.SessionLinkID.make(id("ims_", initial.id)),
        match_id: match.id,
        session_id: initial.session_id,
        is_primary: !secondary,
        reason: secondary ? "duplicate_override" : "materialized",
      }).onConflictDoNothing().run()
      yield* tx.insert(SessionProvenanceTable).values({
        session_id: initial.session_id,
        kind: "issue",
        watcher_id: watcher.id,
        match_id: match.id,
        integration_id: match.integration_id,
        connection_id: match.connection_id,
        external_key: match.external_key,
        external_url: match.external_url,
        watcher_name: watcher.name,
        branch: lease.branch,
        writeback: {
          ...(initial.action.writeback.comment
            ? { comment: `OpenCode started work on ${observation.payload.key}: ${observation.payload.title}` }
            : {}),
          ...(initial.action.writeback.transitionOnStart
            ? { transitionOnStart: initial.action.writeback.transitionOnStart }
            : {}),
          ...(initial.action.writeback.commentOnFailure
            ? { commentOnFailure: `OpenCode could not complete work on ${observation.payload.key}.` }
            : {}),
        },
      }).onConflictDoNothing().run()
      if (!secondary) {
        yield* tx.update(IssueSessionClaimTable).set({ primary_session_id: initial.session_id })
          .where(eq(IssueSessionClaimTable.materialization_id, initial.id)).run()
      }
      yield* tx.update(IssueMaterializationTable).set({ state: "prompt_admitted" })
        .where(eq(IssueMaterializationTable.id, initial.id)).run()
    })).pipe(Effect.orDie)
    const artifacts = yield* input.db.select({ link: IssueMatchSessionTable, provenance: SessionProvenanceTable })
      .from(IssueMatchSessionTable)
      .innerJoin(SessionProvenanceTable, eq(SessionProvenanceTable.session_id, IssueMatchSessionTable.session_id))
      .where(and(eq(IssueMatchSessionTable.match_id, match.id), eq(IssueMatchSessionTable.session_id, initial.session_id)))
      .get().pipe(Effect.orDie)
    if (
      !artifacts || artifacts.provenance.match_id !== match.id ||
      artifacts.provenance.connection_id !== match.connection_id ||
      artifacts.provenance.integration_id !== match.integration_id ||
      artifacts.link.is_primary === secondary
    ) return yield* Effect.die(`Materialization artifacts conflict with deterministic identity: ${initial.id}`)
    yield* publishMaterialized(input.events, input.db, initial.id, match.id, SessionID.make(initial.session_id))
    if (initial.mode === "awaiting_run") return decode(yield* get(initial.id))

    const attemptID = SessionExecutionAttempt.ID.make(id("sea_", initial.id))
    yield* input.db.update(IssueMaterializationTable).set({
      state: "scheduled",
      execution_attempt_id: attemptID,
      attempts: initial.attempts + 1,
    }).where(eq(IssueMaterializationTable.id, initial.id)).run().pipe(Effect.orDie)
    const resumed = yield* input.sessions.resume({
      sessionID: SessionID.make(initial.session_id),
      expectedMessageID: SessionMessage.ID.make(initial.message_id),
      attemptID,
    })
    if (!resumed || resumed.attemptID !== attemptID)
      return yield* Effect.die(`Session resume did not confirm deterministic attempt: ${attemptID}`)
    yield* input.db.update(IssueMaterializationTable).set({ provider_started: true })
      .where(eq(IssueMaterializationTable.id, initial.id)).run().pipe(Effect.orDie)
    return decode(yield* get(initial.id))
  })

  const gated = Effect.fnUntraced(function* (materializationID: IssueMatch.MaterializationID) {
    const running = active.get(materializationID)
    if (running) return yield* Deferred.await(running)
    const deferred = Deferred.makeUnsafe<IssueMatch.Materialization>()
    active.set(materializationID, deferred)
    return yield* continueMaterialization(materializationID).pipe(
      Effect.catchCause((cause) => Effect.gen(function* () {
        const error = Option.getOrUndefined(Cause.findErrorOption(cause))
        const failed = yield* get(materializationID)
        if (failed.workspace_lease && !failed.provider_started) {
          yield* input.workspaces.cleanup(failed.workspace_lease).pipe(Effect.ignore)
        }
        yield* input.db.update(IssueMaterializationTable).set({ state: "failed", error: failureDetail(error, cause) })
          .where(eq(IssueMaterializationTable.id, materializationID)).run().pipe(Effect.orDie)
        return decode(yield* get(materializationID))
      })),
      Effect.onExit((exit) => Effect.sync(() => {
        active.delete(materializationID)
        Deferred.doneUnsafe(deferred, exit)
      })),
    )
  })

  const materialize = Effect.fn("IssueWatcherMaterialization.materialize")(function* (request: MaterializeInput) {
    const existing = yield* input.db.select().from(IssueMaterializationTable)
      .where(and(eq(IssueMaterializationTable.match_id, request.matchID), inArray(IssueMaterializationTable.state, [
        "pending", "provisioning", "session_created", "prompt_admitted", "scheduled", "handoff_unknown",
      ]))).get().pipe(Effect.orDie)
    if (
      existing && !request.rematerialize && !request.secondary &&
      !(request.mode === "run" && existing.mode === "awaiting_run")
    ) {
      if (existing.mode === "run" && !existing.provider_started && !(yield* reserveRun(request.matchID))) return undefined
      if (existing.mode === "run") reservations.set(request.matchID, SessionID.make(existing.session_id))
      const result = yield* gated(existing.id)
      if (!result.providerStarted) reservations.delete(request.matchID)
      return result
    }
    const reserved = request.mode === "run"
      ? yield* reserveRun(request.matchID)
      : true
    if (!reserved) return undefined
    return yield* Effect.gen(function* () {
    if (request.rematerialize) {
      const previous = yield* input.db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.match_id, request.matchID))
        .orderBy(desc(IssueMaterializationTable.time_created)).get().pipe(Effect.orDie)
      if (
        previous?.workspace_lease && ["cancelled", "failed"].includes(previous.state) && !previous.provider_started &&
        (previous.state !== "failed" || previous.error?.startsWith("retryable:"))
      ) yield* input.workspaces.cleanup(previous.workspace_lease).pipe(Effect.orDie)
    }
    const projectSnapshots = yield* input.projects.list()
    const staged = yield* input.db.transaction((tx) => Effect.gen(function* () {
      const match = yield* tx.select().from(IssueMatchTable).where(eq(IssueMatchTable.id, request.matchID)).get()
      if (!match) return undefined
      const watcher = yield* tx.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, match.watcher_id)).get()
      const observation = yield* tx.select().from(IssueMatchObservationTable)
        .where(eq(IssueMatchObservationTable.match_id, match.id))
        .orderBy(desc(IssueMatchObservationTable.time_created), desc(IssueMatchObservationTable.id)).get()
      if (!watcher || !observation || !(request.projectID ?? match.project_id)) return undefined
      const existing = yield* tx.select().from(IssueMaterializationTable)
        .where(and(eq(IssueMaterializationTable.match_id, match.id), inArray(IssueMaterializationTable.state, [
          "pending", "provisioning", "session_created", "prompt_admitted", "scheduled", "handoff_unknown",
        ]))).get()
      if (existing && !request.rematerialize && !request.secondary) {
        if (request.mode === "run" && existing.mode === "awaiting_run") {
          yield* tx.update(IssueMaterializationTable).set({ mode: "run" })
            .where(eq(IssueMaterializationTable.id, existing.id)).run()
          return { ...existing, mode: "run" as const }
        }
        return existing
      }
      const terminal = request.rematerialize ? yield* tx.select().from(IssueMaterializationTable)
          .where(eq(IssueMaterializationTable.match_id, match.id)).orderBy(desc(IssueMaterializationTable.time_created)).get()
        : undefined
      if (request.rematerialize && (
        !terminal || !["cancelled", "failed"].includes(terminal.state) || terminal.provider_started ||
        (terminal.state === "failed" && !terminal.error?.startsWith("retryable:"))
      )) return undefined
      if (terminal) {
        yield* tx.update(IssueMaterializationTable).set({ attempts: terminal.attempts + 1 })
          .where(eq(IssueMaterializationTable.id, terminal.id)).run()
        yield* tx.update(IssueMatchSessionTable).set({ is_primary: false })
          .where(and(
            eq(IssueMatchSessionTable.match_id, match.id),
            eq(IssueMatchSessionTable.session_id, terminal.session_id),
          )).run()
      }
      const generations = yield* tx.select({ id: IssueMaterializationTable.id }).from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.match_id, match.id)).all()
      const generation = generations.length
      const materializationID = IssueMatch.MaterializationID.make(id("imz_", `${match.id}\0${generation}`))
      const sessionID = SessionID.make(id("ses_", materializationID))
      const messageID = SessionMessage.ID.make(id("msg_", materializationID))
      const claim = request.secondary ? undefined : yield* tx.select().from(IssueSessionClaimTable).where(and(
        eq(IssueSessionClaimTable.connection_id, match.connection_id),
        eq(IssueSessionClaimTable.external_id, match.external_id),
      )).get()
      const claimOwner = existing ?? terminal
      const claimed = request.secondary ? { materializationID } : claim && claimOwner && claim.materialization_id === claimOwner.id
        ? yield* tx.update(IssueSessionClaimTable).set({ materialization_id: materializationID, primary_session_id: null })
            .where(and(
              eq(IssueSessionClaimTable.connection_id, match.connection_id),
              eq(IssueSessionClaimTable.external_id, match.external_id),
              eq(IssueSessionClaimTable.materialization_id, claimOwner.id),
            )).returning({ materializationID: IssueSessionClaimTable.materialization_id }).get()
        : yield* tx.insert(IssueSessionClaimTable).values({
            connection_id: match.connection_id,
            external_id: match.external_id,
            materialization_id: materializationID,
          }).onConflictDoNothing().returning({ materializationID: IssueSessionClaimTable.materialization_id }).get()
      if (!claimed) {
        yield* tx.update(IssueMatchTable).set({ state: "duplicate", error: null }).where(eq(IssueMatchTable.id, match.id)).run()
        return yield* tx.select().from(IssueMaterializationTable)
          .innerJoin(IssueSessionClaimTable, eq(IssueMaterializationTable.id, IssueSessionClaimTable.materialization_id))
          .where(and(eq(IssueSessionClaimTable.connection_id, match.connection_id), eq(IssueSessionClaimTable.external_id, match.external_id)))
          .get().pipe(Effect.map((row) => row?.issue_materialization))
      }
      if (request.rematerialize && match.state === "duplicate") {
        yield* tx.update(IssueMatchTable).set({ state: "pending", error: null }).where(eq(IssueMatchTable.id, match.id)).run()
      }
      yield* tx.insert(IssueMaterializationTable).values({
        id: materializationID,
        match_id: match.id,
        mode: request.mode ?? (watcher.action.mode === "run" ? "run" : "awaiting_run"),
        project_id: request.projectID ?? match.project_id!,
        source_directory: request.directory ?? terminal?.source_directory,
        workspace: request.workspace ?? watcher.routing.workspace,
        action: watcher.action,
        prompt: renderPrompt(
          observation.payload,
          projectSnapshots.find((item) => item.projectID === (request.projectID ?? match.project_id)),
          watcher.action.promptTemplate,
        ),
        baseline_observation_id: observation.id,
        state: "pending",
        session_id: sessionID,
        message_id: messageID,
      }).run()
      return yield* tx.select().from(IssueMaterializationTable).where(eq(IssueMaterializationTable.id, materializationID)).get()
    })).pipe(Effect.orDie)
    if (!staged) return yield* Effect.die(`Issue match cannot be materialized: ${request.matchID}`)
    if (staged.match_id !== request.matchID) return { ...decode(staged), _tag: "Duplicate" as const }
    if (request.mode === "run") reservations.set(request.matchID, SessionID.make(staged.session_id))
    const result = yield* gated(staged.id)
    if (!result.providerStarted) reservations.delete(request.matchID)
    return result
    }).pipe(Effect.onError(() => Effect.sync(() => reservations.delete(request.matchID))))
  })

  const setState = (matchID: IssueMatch.ID, state: "pending" | "skipped" | "dismissed", projectID?: IssueMatch.Materialization["projectID"]) =>
    input.db.update(IssueMatchTable).set({ state, ...(projectID ? { project_id: projectID, route_reason: "Manually routed" } : {}) })
      .where(eq(IssueMatchTable.id, matchID)).run().pipe(Effect.orDie)
  const provenance = Effect.fn("IssueWatcherMaterialization.provenance")(function* (sessionID: SessionID) {
    const row = yield* input.db.select().from(SessionProvenanceTable)
      .where(eq(SessionProvenanceTable.session_id, sessionID)).get().pipe(Effect.orDie)
    return row ? fromProvenance(row) : undefined
  })

  const service: Interface = {
    materialize,
    route: (matchID, projectID) => setState(matchID, "pending", projectID),
    skip: (matchID) => setState(matchID, "skipped"),
    dismiss: (matchID) => setState(matchID, "dismissed"),
    ignore: Effect.fn("IssueWatcherMaterialization.ignore")(function* (matchID, reason) {
      const match = yield* input.db.select().from(IssueMatchTable).where(eq(IssueMatchTable.id, matchID)).get().pipe(Effect.orDie)
      if (!match) return yield* Effect.die(`Issue match not found: ${matchID}`)
      yield* input.db.transaction((tx) => Effect.gen(function* () {
        yield* tx.insert(IssueWatcherIgnoreTable).values({ watcher_id: match.watcher_id, external_id: match.external_id, reason })
          .onConflictDoUpdate({ target: [IssueWatcherIgnoreTable.watcher_id, IssueWatcherIgnoreTable.external_id], set: { reason } }).run()
        yield* tx.update(IssueMatchTable).set({ state: "skipped" }).where(eq(IssueMatchTable.id, matchID)).run()
      })).pipe(Effect.orDie)
    }),
    bulk: Effect.fn("IssueWatcherMaterialization.bulk")(function* (matchIDs, action) {
      const results = yield* Effect.forEach(matchIDs, (matchID) => Effect.exit(Effect.gen(function* () {
        if (action === "skip") return yield* setState(matchID, "skipped").pipe(Effect.asVoid)
        if (action === "dismiss") return yield* setState(matchID, "dismissed").pipe(Effect.asVoid)
        return yield* materialize({ matchID, mode: action === "run" ? "run" : "awaiting_run" }).pipe(Effect.asVoid)
      })))
      return results.reduce<BulkResult>((result, exit, index) => Exit.isSuccess(exit)
        ? { ...result, succeeded: [...result.succeeded, matchIDs[index]!] }
        : { ...result, failed: [...result.failed, { matchID: matchIDs[index]!, error: String(exit.cause) }] }, { succeeded: [], failed: [] })
    }),
    provenance,
    syncProvenance: Effect.fn("IssueWatcherMaterialization.syncProvenance")(function* (sessionID) {
      const current = yield* provenance(sessionID)
      if (!current) return undefined
      const now = Date.now()
      yield* input.db.update(SessionProvenanceTable).set({ last_synced_at: now })
        .where(eq(SessionProvenanceTable.session_id, sessionID)).run().pipe(Effect.orDie)
      return { ...current, lastSyncedAt: now }
    }),
    reconcile: Effect.fn("IssueWatcherMaterialization.reconcile")(function* () {
      const settings = yield* input.settings()
      const failed = settings.retryFailedRuns === "once"
        ? yield* input.db.select().from(IssueMaterializationTable).where(and(
            eq(IssueMaterializationTable.state, "failed"),
            eq(IssueMaterializationTable.provider_started, false),
            eq(IssueMaterializationTable.attempts, 0),
          )).all().pipe(Effect.orDie)
        : []
      const rows = yield* input.db.select().from(IssueMaterializationTable).where(inArray(IssueMaterializationTable.state, [
        "pending", "provisioning", "session_created", "prompt_admitted", "scheduled",
      ])).all().pipe(Effect.orDie)
      yield* Effect.forEach([...rows, ...failed], (row) => Effect.gen(function* () {
        const claim = yield* claimedAttempt(input.db, row)
        if (claim) {
          yield* input.db.update(IssueMaterializationTable).set({
            state: claim.state,
            provider_started: true,
            execution_attempt_id: claim.attemptID,
            ...(claim.error ? { error: claim.error } : {}),
          }).where(eq(IssueMaterializationTable.id, row.id)).run().pipe(Effect.orDie)
          return
        }
        if (row.state === "scheduled" && !(yield* reconcileScheduled(input.db, row))) return
        if (row.state === "failed") {
          yield* input.db.update(IssueMaterializationTable).set({
            state: recoverableState(row),
            error: null,
            attempts: row.attempts + 1,
          })
            .where(eq(IssueMaterializationTable.id, row.id)).run().pipe(Effect.orDie)
        }
        if (row.mode === "run" && !(yield* reserveRun(row.match_id))) return
        if (row.mode === "run") reservations.set(row.match_id, SessionID.make(row.session_id))
        const result = yield* gated(row.id)
        if (!result.providerStarted) reservations.delete(row.match_id)
      }), { concurrency: 1, discard: true })
    }),
  }

  yield* input.events.project(SessionEvent.PromptCancelled, (event) => Effect.gen(function* () {
    const row = yield* input.db.select().from(IssueMaterializationTable)
      .where(and(eq(IssueMaterializationTable.message_id, event.data.messageID), eq(IssueMaterializationTable.session_id, event.data.sessionID)))
      .get().pipe(Effect.orDie)
    if (!row || row.provider_started) return
    yield* input.db.update(IssueMaterializationTable).set({ state: "cancelled", error: "Prompt cancelled" })
      .where(eq(IssueMaterializationTable.id, row.id)).run().pipe(Effect.orDie)
    yield* input.db.delete(IssueSessionClaimTable).where(and(
      eq(IssueSessionClaimTable.materialization_id, row.id),
      eq(IssueSessionClaimTable.primary_session_id, row.session_id),
    )).run().pipe(Effect.orDie)
    yield* input.db.update(IssueMatchSessionTable).set({ is_primary: false })
      .where(and(
        eq(IssueMatchSessionTable.match_id, row.match_id),
        eq(IssueMatchSessionTable.session_id, row.session_id),
      )).run().pipe(Effect.orDie)
  }))
  yield* input.events.project(SessionEvent.Deleted, (event) => Effect.gen(function* () {
    yield* input.db.update(IssueMatchSessionTable).set({ deleted_at: Date.now(), is_primary: false })
      .where(eq(IssueMatchSessionTable.session_id, event.data.sessionID)).run().pipe(Effect.orDie)
    yield* input.db.update(IssueMaterializationTable).set({ state: "cancelled", error: "Session deleted" })
      .where(and(
        eq(IssueMaterializationTable.session_id, event.data.sessionID),
        eq(IssueMaterializationTable.provider_started, false),
      )).run().pipe(Effect.orDie)
  }))
  yield* input.events.listen((event) => {
    if (event.type === SessionEvent.PromptCancelled.type) {
      const data = event.data as typeof SessionEvent.PromptCancelled.Type["data"]
      return input.db.select().from(IssueMaterializationTable)
        .where(and(eq(IssueMaterializationTable.message_id, data.messageID), eq(IssueMaterializationTable.session_id, data.sessionID)))
        .get().pipe(
          Effect.orDie,
          Effect.flatMap((row) => row?.workspace_lease ? input.workspaces.cleanup(row.workspace_lease).pipe(Effect.ignore) : Effect.void),
        )
    }
    if (event.type === SessionEvent.Deleted.type) {
      const data = event.data as typeof SessionEvent.Deleted.Type["data"]
      return input.db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.session_id, data.sessionID)).get().pipe(
          Effect.orDie,
          Effect.flatMap((row) => row?.workspace_lease ? input.workspaces.cleanup(row.workspace_lease).pipe(Effect.ignore) : Effect.void),
        )
    }
    if (event.type === SessionEvent.Execution.Scheduled.type) {
      const data = event.data as typeof SessionEvent.Execution.Scheduled.Type["data"]
      return input.db.update(IssueMaterializationTable).set({
        state: "scheduled",
        execution_attempt_id: data.attemptID,
        provider_started: true,
        error: null,
      }).where(and(
        eq(IssueMaterializationTable.session_id, data.sessionID),
        eq(IssueMaterializationTable.message_id, data.messageID),
      )).run().pipe(Effect.orDie)
    }
    if (
      event.type !== SessionEvent.Execution.Started.type &&
      event.type !== SessionEvent.Execution.Completed.type &&
      event.type !== SessionEvent.Execution.Failed.type &&
      event.type !== SessionEvent.Execution.Interrupted.type &&
      event.type !== SessionEvent.Execution.Superseded.type
    ) return Effect.void
    if (event.type === SessionEvent.Execution.Superseded.type) {
      const data = event.data as typeof SessionEvent.Execution.Superseded.Type["data"]
      return input.db.update(IssueMaterializationTable).set({
        state: "scheduled",
        execution_attempt_id: data.supersededByAttemptID,
        provider_started: true,
        error: null,
      }).where(eq(IssueMaterializationTable.execution_attempt_id, data.attemptID)).run().pipe(Effect.orDie)
    }
    const data = event.data as typeof SessionEvent.Execution.Completed.Type["data"]
    const release = input.db.select({ matchID: IssueMaterializationTable.match_id }).from(IssueMaterializationTable)
      .where(eq(IssueMaterializationTable.execution_attempt_id, data.attemptID)).get().pipe(
        Effect.orDie,
        Effect.tap((row) => Effect.sync(() => { if (row) reservations.delete(row.matchID) })),
      )
    const state = event.type === SessionEvent.Execution.Completed.type
      ? "completed" as const
      : event.type === SessionEvent.Execution.Failed.type || event.type === SessionEvent.Execution.Interrupted.type
        ? "failed" as const
        : "scheduled" as const
    const failed = event.type === SessionEvent.Execution.Failed.type
      ? event.data as typeof SessionEvent.Execution.Failed.Type["data"]
      : undefined
    const error = failed
      ? `${failed.failure.type}: ${failed.failure.message}`
      : event.type === SessionEvent.Execution.Interrupted.type ? "Session execution interrupted" : undefined
    return release.pipe(Effect.andThen(input.db.update(IssueMaterializationTable).set({ state, provider_started: true, ...(error ? { error } : {}) })
      .where(eq(IssueMaterializationTable.execution_attempt_id, data.attemptID)).run().pipe(Effect.orDie)))
  })
  return service
})

function fromProvenance(row: typeof SessionProvenanceTable.$inferSelect): Provenance {
  return {
    sessionID: SessionID.make(row.session_id),
    ...(row.watcher_id ? { watcherID: row.watcher_id } : {}),
    ...(row.match_id ? { matchID: row.match_id } : {}),
    integrationID: row.integration_id,
    connectionID: row.connection_id,
    externalKey: row.external_key,
    externalUrl: row.external_url,
    watcherName: row.watcher_name,
    ...(row.branch ? { branch: row.branch } : {}),
    ...(row.last_synced_at ? { lastSyncedAt: row.last_synced_at } : {}),
  }
}

const reconcileScheduled = Effect.fnUntraced(function* (db: Db, row: typeof IssueMaterializationTable.$inferSelect) {
  if (!row.execution_attempt_id) {
    yield* db.transaction((tx) => Effect.gen(function* () {
      yield* tx.update(SessionInputTable).set({ claimed_attempt_id: null })
        .where(and(eq(SessionInputTable.id, SessionMessage.ID.make(row.message_id)), eq(SessionInputTable.session_id, SessionID.make(row.session_id)))).run()
      yield* tx.update(IssueMaterializationTable).set({ state: "prompt_admitted", provider_started: false })
        .where(eq(IssueMaterializationTable.id, row.id)).run()
    })).pipe(Effect.orDie)
    return true
  }
  const attempt = yield* resolveAttempt(db, SessionExecutionAttempt.ID.make(row.execution_attempt_id))
  if (!attempt) {
    yield* db.transaction((tx) => Effect.gen(function* () {
      yield* tx.update(SessionInputTable).set({ claimed_attempt_id: null })
        .where(and(eq(SessionInputTable.id, SessionMessage.ID.make(row.message_id)), eq(SessionInputTable.claimed_attempt_id, SessionExecutionAttempt.ID.make(row.execution_attempt_id!)))).run()
      yield* tx.update(IssueMaterializationTable).set({ state: "prompt_admitted", execution_attempt_id: null, provider_started: false })
        .where(eq(IssueMaterializationTable.id, row.id)).run()
    })).pipe(Effect.orDie)
    return true
  }
  const state = attempt.status === "completed" ? "completed"
    : attempt.status === "handoff_unknown" ? "handoff_unknown"
    : ["failed", "interrupted"].includes(attempt.status) ? "failed"
    : "scheduled"
  yield* db.update(IssueMaterializationTable).set({
    state,
    provider_started: true,
    execution_attempt_id: attempt.id,
    ...(attempt.failure ? { error: `${attempt.failure.type}: ${attempt.failure.message}` } : {}),
    ...(attempt.interruption ? { error: `interrupted:${attempt.interruption.reason}` } : {}),
  })
    .where(eq(IssueMaterializationTable.id, row.id)).run().pipe(Effect.orDie)
  return false
})

function recoverableState(row: typeof IssueMaterializationTable.$inferSelect) {
  if (row.execution_attempt_id) return "prompt_admitted" as const
  if (row.resolved_location) return "session_created" as const
  if (row.workspace_lease) return "provisioning" as const
  return "pending" as const
}

const claimedAttempt = Effect.fnUntraced(function* (db: Db, row: typeof IssueMaterializationTable.$inferSelect) {
  const input = yield* db.select({ attemptID: SessionInputTable.claimed_attempt_id })
    .from(SessionInputTable).where(and(
      eq(SessionInputTable.id, SessionMessage.ID.make(row.message_id)),
      eq(SessionInputTable.session_id, SessionID.make(row.session_id)),
      isNotNull(SessionInputTable.claimed_attempt_id),
    )).get().pipe(Effect.orDie)
  if (!input?.attemptID) return undefined
  const attempt = yield* resolveAttempt(db, input.attemptID)
  if (!attempt) return undefined
  const state = attempt?.status === "completed" ? "completed" as const
    : attempt?.status === "handoff_unknown" ? "handoff_unknown" as const
    : ["failed", "interrupted"].includes(attempt.status) ? "failed" as const
    : "scheduled" as const
  return {
    attemptID: attempt.id,
    state,
    error: attempt?.failure ? `${attempt.failure.type}: ${attempt.failure.message}`
      : attempt?.interruption ? `interrupted:${attempt.interruption.reason}` : undefined,
  }
})

const resolveAttempt = Effect.fnUntraced(function* (db: Db, attemptID: SessionExecutionAttempt.ID): Effect.fn.Return<SessionExecutionAttempt.Info | undefined> {
  const attempt = yield* SessionExecutionAttempt.find(db, attemptID)
  if (!attempt || attempt.status !== "superseded" || !attempt.supersededByAttemptID) return attempt
  return yield* resolveAttempt(db, attempt.supersededByAttemptID)
})

const publishMaterialized = Effect.fnUntraced(function* (
  events: EventV2.Interface,
  db: Db,
  materializationID: IssueMatch.MaterializationID,
  matchID: IssueMatch.ID,
  sessionID: SessionID,
) {
  if ((yield* EventV2.latestSequence(db, materializationID)) >= 0) return
  yield* events.publish(IssueWatcher.Event.SessionMaterialized, { materializationID, matchID, sessionID }, {
    id: EventV2.ID.make(`evt_${Hash.sha256(`materialized\0${materializationID}`).slice(0, 28)}`),
  })
})

function failureDetail(error: unknown, cause: Cause.Cause<unknown>) {
  const detail = error && typeof error === "object" && "_tag" in error
    ? `${String(error._tag)}${"detail" in error && typeof error.detail === "string" ? `: ${error.detail}` : ""}`
    : error instanceof Error ? error.message
    : Cause.pretty(cause)
  return `${retryable(error) ? "retryable" : "terminal"}:${detail}`
}

function retryable(error: unknown) {
  if (!error || typeof error !== "object" || !("_tag" in error)) return false
  return [
    "WorkspaceProvisioner.CollisionError",
    "WorkspaceProvisioner.NotReadyError",
    "WorkspaceProvisioner.SetupAmbiguousError",
    "ProjectRoutingCatalog.ResolutionError",
  ].includes(String(error._tag))
}
