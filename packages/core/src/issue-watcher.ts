export * as IssueWatcher from "./issue-watcher"

import { and, asc, desc, eq, exists, isNotNull, isNull, lt, lte, notExists, or, sql } from "drizzle-orm"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { Cause, Context, DateTime, Deferred, Effect, Exit, Layer, Option, Ref, Result, Schema, Semaphore } from "effect"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { EventV2 } from "./event"
import { GlobalConfig } from "./global-config"
import { IssueProvider } from "./issue-watcher/provider"
import { IssueWatcherOwner } from "./issue-watcher/owner"
import {
  IssueMatchObservationTable,
  IssueMatchTable,
  IssueMaterializationTable,
  IssueMatchSessionTable,
  IssueSessionClaimTable,
  IssueWatcherIgnoreTable,
  IssueWatcherRunTable,
  IssueWatcherTable,
  IssueMetadataSnapshotTable,
  IssueMetadataSyncTable,
} from "./issue-watcher/sql"
import { Credential } from "./credential"
import { CredentialTable } from "./credential/sql"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { Repository } from "./repository"
import { ProjectRoutingCatalog } from "./project/routing-catalog"
import { WorkspaceProvisioner } from "./workspace-provisioner"
import { Hash } from "./util/hash"
import { SessionV2 } from "./session"
import { IssueWatcherMaterialization } from "./issue-watcher/materialization"
import { renderPrompt } from "./issue-watcher/prompt"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SessionMessage } from "./session/message"
import { SessionExecutionAttempt } from "./session/execution-attempt"
import { SessionExecutionAttemptTable } from "./session/sql"
import { SessionProvenance } from "@opencode-ai/schema/session-provenance"
import { Project } from "@opencode-ai/schema/project"
import { IssueWritebackOperationTable, SessionProvenanceTable } from "./issue-watcher/sql"
import { IssueWatcherWriteback } from "./issue-watcher/writeback"

export const ID = IssueWatcher.ID
export type ID = IssueWatcher.ID
export const Info = IssueWatcher.Info
export type Info = IssueWatcher.Info
export const CreateInput = IssueWatcher.CreateInput
export type CreateInput = IssueWatcher.CreateInput
export const UpdateInput = IssueWatcher.UpdateInput
export type UpdateInput = IssueWatcher.UpdateInput
export const Event = IssueWatcher.Event
export const PreviewLimit = 100
export const PreviewPageLimit = 20
export const PollPageLimit = 100
export const ListLimit = 1000
export const MetadataFreshness = 12 * 60 * 60 * 1000
export const MetadataRetryCooldown = 60 * 1000
const MetadataLeaseDuration = 5 * 60 * 1000
const MetadataSchedulerInterval = 60 * 1000
const MetadataJitter = 30 * 60 * 1000

export function route(
  issue: Issue.Info,
  routing: IssueWatcher.Routing,
  projects: ReadonlyArray<IssueWatcher.ProjectRoutingSnapshot>,
): IssueWatcher.Route {
  if (routing.repoField && issue.repoField) {
    const repository = Repository.parse(issue.repoField)
    if (repository && Repository.isRemote(repository)) {
      const project = projects.find((item) =>
        item.remotes.some((remote) =>
          remote.host === repository.host &&
          (remote.host === "github.com" ? remote.path.toLowerCase() === repository.path.toLowerCase() : remote.path === repository.path),
        ),
      )
      if (project) return { projectID: project.projectID, reason: `Repository field matched ${repository.label}` }
    }
  }
  const mapping = routing.mappings.find((item) => {
    if (item.key.type === "label") return issue.labels.includes(item.key.value)
    if (item.key.type === "component") return issue.component === item.key.value
    return issue.issueProject === item.key.value
  })
  if (mapping) return { projectID: mapping.projectID, reason: `${mapping.key.type} matched ${mapping.key.value}` }
  const suggestion = projects.length === 1 ? projects[0]?.projectID : undefined
  return { unrouted: true, reason: "No repository or explicit mapping matched", ...(suggestion ? { suggestion } : {}) }
}

export { renderPrompt }

export function renderWriteback(issue: Issue.Info, action: IssueWatcher.Action): IssueWatcher.WritebackPlan {
  return {
    ...(action.writeback.comment ? { comment: `OpenCode started work on ${issue.key}: ${issue.title}` } : {}),
    ...(action.writeback.transitionOnStart ? { transitionOnStart: action.writeback.transitionOnStart } : {}),
    ...(action.writeback.commentOnFailure ? { commentOnFailure: `OpenCode could not complete work on ${issue.key}.` } : {}),
  }
}

export function fingerprint(issue: Issue.Info) {
  return Hash.sha256(canonicalJson(issue))
}

function canonicalJson(value: Schema.Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
}

function bulkError(cause: Cause.Cause<unknown>): IssueWatcher.BulkError {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause))
  if (error instanceof MatchNotFoundError) return { code: "not_found", message: `Issue match not found: ${error.id}` }
  if (error instanceof ProjectNotFoundError) return { code: "unrouted", message: `Project not found: ${error.id}` }
  if (error instanceof MatchConflictError) {
    const code = error.detail.includes("not routed") ? "unrouted"
      : error.detail.includes("duplicate") ? "duplicate"
      : "invalid_state"
    return { code, message: error.detail }
  }
  return { code: "materialization_failed", message: Cause.pretty(cause) }
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("IssueWatcher.NotFoundError", {
  id: ID,
}) {}

export class ArchivedError extends Schema.TaggedErrorClass<ArchivedError>()("IssueWatcher.ArchivedError", {
  id: ID,
}) {}

export class OwnerConflictError extends Schema.TaggedErrorClass<OwnerConflictError>()("IssueWatcher.OwnerConflictError", {
  detail: Schema.String,
}) {}

export class RunConflictError extends Schema.TaggedErrorClass<RunConflictError>()("IssueWatcher.RunConflictError", {
  id: ID,
  detail: Schema.String,
}) {}

export class SourceNotFoundError extends Schema.TaggedErrorClass<SourceNotFoundError>()("IssueWatcher.SourceNotFoundError", {
  integrationID: Integration.ID,
}) {}

export class ConnectionNotFoundError extends Schema.TaggedErrorClass<ConnectionNotFoundError>()(
  "IssueWatcher.ConnectionNotFoundError",
  { connectionID: Credential.ConnectionID },
) {}

export class TenantConflictError extends Schema.TaggedErrorClass<TenantConflictError>()(
  "IssueWatcher.TenantConflictError",
  { connectionID: Credential.ConnectionID },
) {}

export class VerificationModeError extends Schema.TaggedErrorClass<VerificationModeError>()(
  "IssueWatcher.VerificationModeError",
  { detail: Schema.String },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()("IssueWatcher.InvalidCursorError", {
  detail: Schema.String,
}) {}

export class MatchNotFoundError extends Schema.TaggedErrorClass<MatchNotFoundError>()("IssueWatcher.MatchNotFoundError", {
  id: IssueMatch.ID,
}) {}

export class MatchConflictError extends Schema.TaggedErrorClass<MatchConflictError>()("IssueWatcher.MatchConflictError", {
  id: IssueMatch.ID,
  detail: Schema.String,
}) {}

export class ProjectNotFoundError extends Schema.TaggedErrorClass<ProjectNotFoundError>()("IssueWatcher.ProjectNotFoundError", {
  id: Project.ID,
}) {}

export class ProvenanceNotFoundError extends Schema.TaggedErrorClass<ProvenanceNotFoundError>()(
  "IssueWatcher.ProvenanceNotFoundError",
  { sessionID: SessionID },
) {}

export class WritebackNotAvailableError extends Schema.TaggedErrorClass<WritebackNotAvailableError>()(
  "IssueWatcher.WritebackNotAvailableError",
  { sessionID: SessionID, detail: Schema.String },
) {}

export type Error = NotFoundError | ArchivedError | OwnerConflictError

export interface Interface {
  readonly status: () => IssueWatcherOwner.Status
  readonly list: () => Effect.Effect<IssueWatcher.Summary[]>
  readonly get: (id: ID) => Effect.Effect<Info, NotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<Info, OwnerConflictError>
  readonly update: (id: ID, input: UpdateInput) => Effect.Effect<Info, NotFoundError | ArchivedError>
  readonly archive: (id: ID) => Effect.Effect<void, NotFoundError>
  readonly enable: (id: ID, enabled: boolean) => Effect.Effect<Info, Error>
  readonly source: {
    readonly list: () => Effect.Effect<IssueWatcher.IntegrationSummary[]>
    readonly verify: (
      integrationID: Integration.ID,
      input: IssueWatcher.VerificationInput,
    ) => Effect.Effect<
      IssueWatcher.VerificationResult,
      SourceNotFoundError | ConnectionNotFoundError | VerificationModeError
    >
    readonly create: (
      integrationID: Integration.ID,
      input: IssueWatcher.ConnectionCreateInput,
    ) => Effect.Effect<IssueWatcher.IntegrationSummary, SourceNotFoundError | ConnectionNotFoundError | IssueProvider.Error>
    readonly rotate: (
      integrationID: Integration.ID,
      connectionID: Credential.ConnectionID,
      input: IssueWatcher.ConnectionRotateInput,
    ) => Effect.Effect<
      IssueWatcher.IntegrationSummary,
      SourceNotFoundError | ConnectionNotFoundError | TenantConflictError | IssueProvider.Error
    >
    readonly metadata: (
      integrationID: Integration.ID,
      connectionID: Credential.ConnectionID,
      input: IssueWatcher.MetadataInput,
    ) => Effect.Effect<IssueWatcher.MetadataResult, SourceNotFoundError | ConnectionNotFoundError>
    readonly syncMetadata: (
      integrationID: Integration.ID,
      connectionID: Credential.ConnectionID,
    ) => Effect.Effect<IssueWatcher.MetadataSyncStatus, SourceNotFoundError | ConnectionNotFoundError>
  }
  readonly summary: () => Effect.Effect<IssueWatcher.InboxSummary>
  readonly run: (id: ID) => Effect.Effect<IssueWatcher.Run, NotFoundError | OwnerConflictError | RunConflictError>
  readonly runAll: () => Effect.Effect<IssueWatcher.Run[], OwnerConflictError | RunConflictError>
  readonly history: (
    id: ID,
    input: { readonly cursor?: IssueWatcher.PageCursor; readonly limit?: number },
  ) => Effect.Effect<IssueWatcher.HistoryPage, NotFoundError | InvalidCursorError>
  readonly ignores: (id: ID) => Effect.Effect<IssueWatcher.Ignore[], NotFoundError>
  readonly inbox: (input: {
    readonly state?: IssueMatch.Info["state"]
    readonly integrationID?: Integration.ID
    readonly filter?: IssueWatcher.InboxFilter
    readonly cursor?: IssueWatcher.PageCursor
    readonly limit?: number
  }) => Effect.Effect<IssueWatcher.InboxPage, InvalidCursorError>
  readonly settings: {
    readonly get: () => Effect.Effect<IssueWatcher.Settings>
    readonly update: (input: IssueWatcher.SettingsInput) => Effect.Effect<IssueWatcher.Settings>
  }
  readonly preview: (
    input: IssueWatcher.PreviewInput,
  ) => Effect.Effect<IssueWatcher.Preview, SourceNotFoundError | ConnectionNotFoundError | IssueProvider.Error>
  readonly matches: IssueWatcherMaterialization.Interface
  readonly approve: (id: IssueMatch.ID, input: IssueWatcher.MaterializeInput) => Effect.Effect<IssueWatcher.MaterializeResult, MatchNotFoundError | MatchConflictError | ProjectNotFoundError>
  readonly routeMatch: (id: IssueMatch.ID, input: IssueWatcher.RouteInput) => Effect.Effect<void, MatchNotFoundError | MatchConflictError | ProjectNotFoundError>
  readonly skip: (id: IssueMatch.ID) => Effect.Effect<void, MatchNotFoundError | MatchConflictError>
  readonly dismiss: (id: IssueMatch.ID) => Effect.Effect<void, MatchNotFoundError | MatchConflictError>
  readonly rematerialize: (id: IssueMatch.ID, input: IssueWatcher.MaterializeInput) => Effect.Effect<IssueWatcher.MaterializeResult, MatchNotFoundError | MatchConflictError | ProjectNotFoundError>
  readonly duplicateDetail: (id: IssueMatch.ID) => Effect.Effect<IssueWatcher.DuplicateDetail, MatchNotFoundError | MatchConflictError>
  readonly resolveDuplicate: (id: IssueMatch.ID, input: IssueWatcher.DuplicateResolutionInput) => Effect.Effect<IssueWatcher.DuplicateResolutionResult, MatchNotFoundError | MatchConflictError | ProjectNotFoundError>
  readonly bulk: (input: IssueWatcher.BulkInput) => Effect.Effect<IssueWatcher.BulkResult>
  readonly addIgnore: (id: ID, input: IssueWatcher.IgnoreInput) => Effect.Effect<IssueWatcher.Ignore, NotFoundError>
  readonly removeIgnore: (id: ID, externalID: string) => Effect.Effect<void, NotFoundError>
  readonly provenanceDetail: (sessionID: SessionID) => Effect.Effect<SessionProvenance.Detail, ProvenanceNotFoundError>
  readonly syncProvenance: (sessionID: SessionID) => Effect.Effect<SessionProvenance.Detail, ProvenanceNotFoundError | SourceNotFoundError | ConnectionNotFoundError | IssueProvider.Error>
  readonly enqueueFailureComment: (sessionID: SessionID) => Effect.Effect<IssueMatch.WritebackOperation, ProvenanceNotFoundError | WritebackNotAvailableError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/IssueWatcher") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const owner = yield* IssueWatcherOwner.Service
    const providers = yield* IssueProvider.Service
    const credentials = yield* Credential.Service
    const config = yield* GlobalConfig.Service
    const projectCatalog = yield* ProjectRoutingCatalog.Service
    const workspaces = yield* WorkspaceProvisioner.Service
    const sessions = yield* SessionV2.Service
    const writeback = yield* IssueWatcherWriteback.Service
    const decode = Schema.decodeUnknownSync(Info)
    const decodeRun = Schema.decodeUnknownSync(IssueWatcher.Run)
    const decodeMatch = Schema.decodeUnknownSync(IssueMatch.Info)
    const decodeObservation = Schema.decodeUnknownSync(IssueMatch.Observation)
    const decodeIgnore = Schema.decodeUnknownSync(IssueWatcher.Ignore)
    const decodeLink = Schema.decodeUnknownSync(IssueMatch.SessionLink)
    const decodeMaterialization = Schema.decodeUnknownSync(IssueMatch.Materialization)
    const decodeWriteback = Schema.decodeUnknownSync(IssueMatch.WritebackOperation)
    const decodeMetadataSnapshot = Schema.decodeUnknownSync(IssueWatcher.MetadataSnapshot)
    const active = new Map<ID, Deferred.Deferred<IssueWatcher.Run, NotFoundError | RunConflictError>>()
    const metadataProviderCapacity = Semaphore.makeUnsafe(8)
    const metadataConnectionCapacity = new Map<string, Semaphore.Semaphore>()
    const serviceScope = yield* Effect.scope
    const materialization = yield* IssueWatcherMaterialization.make({
      db,
      events,
      projects: projectCatalog,
      workspaces,
      sessions,
      settings: () => config.getIssueWatcher().pipe(Effect.map((settings) => ({
        concurrentRuns: settings.concurrentRuns ?? 3,
        retryFailedRuns: settings.retryFailedRuns ?? "once",
      }))),
    })

    const stored = (row: typeof IssueWatcherTable.$inferSelect) => decode({
      id: row.id,
      integrationID: row.integration_id,
      connectionID: row.connection_id,
      name: row.name,
      enabled: row.enabled,
      ...(row.project_id ? { projectID: row.project_id } : {}),
      criteria: row.criteria,
      routing: row.routing,
      action: row.action,
      ...(row.cursor ? { cursor: row.cursor } : {}),
      ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
      ...(row.last_error ? { lastError: row.last_error } : {}),
      ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    })

    const get = Effect.fn("IssueWatcher.get")(function* (id: ID) {
      const row = yield* db.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, id)).get().pipe(Effect.orDie)
      if (!row) return yield* new NotFoundError({ id })
      return stored(row)
    })

    const metadataSnapshotRow = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID) {
      const row = yield* db.select().from(IssueMetadataSnapshotTable)
        .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get().pipe(Effect.orDie)
      return row
    })

    const metadataSnapshot = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID) {
      const row = yield* metadataSnapshotRow(connectionID)
      return row ? decodeMetadataSnapshot(row.snapshot) : undefined
    })

    const emptyMetadataSnapshot = (connectionID: Credential.ConnectionID, now: number): IssueWatcher.MetadataSnapshot => ({
      connectionID,
      projects: {},
      updatedAt: now,
    })

    const metadataError = (error: IssueProvider.Error) =>
      error._tag === "IssueProvider.NotImplementedError" ? `${error.operation} is not implemented` : error.detail

    const scopeJitter = (connectionID: string, scope: string) => {
      let hash = 2166136261
      for (const char of `${connectionID}:${scope}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
      return (hash >>> 0) % MetadataJitter
    }

    const nextDue = (connectionID: string, scope: string, now: number) =>
      now + MetadataFreshness + scopeJitter(connectionID, scope)

    const requestMetadataScope = Effect.fnUntraced(function* (
      connectionID: Credential.ConnectionID,
      scope: string,
      force: boolean,
    ) {
      const startedAt = Date.now()
      const outcome = yield* db.transaction((tx) => Effect.gen(function* () {
        const connection = yield* tx.select({ id: CredentialTable.id }).from(CredentialTable)
          .where(eq(CredentialTable.connection_id, connectionID)).get()
        if (!connection) return "rejected_missing_connection" as const
        const now = Date.now()
        const snapshotRow = yield* tx.select().from(IssueMetadataSnapshotTable)
          .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get()
        if (!snapshotRow) {
          yield* tx.insert(IssueMetadataSnapshotTable).values({
            connection_id: connectionID,
            snapshot: emptyMetadataSnapshot(connectionID, now),
            credential_generation: 0,
            time_created: now,
            time_updated: now,
          }).run()
        }
        const credentialGeneration = snapshotRow?.credential_generation ?? 0
        const row = yield* tx.select().from(IssueMetadataSyncTable).where(and(
          eq(IssueMetadataSyncTable.connection_id, connectionID),
          eq(IssueMetadataSyncTable.scope, scope),
        )).get()
        if (!row) {
          yield* tx.insert(IssueMetadataSyncTable).values({
            connection_id: connectionID,
            scope,
            requested_generation: 1,
            completed_generation: 0,
            credential_generation: credentialGeneration,
            next_due_at: now,
            time_created: now,
            time_updated: now,
          }).run()
          return "requested" as const
        }
        if (row.requested_generation > row.completed_generation) return "deduplicated_pending" as const
        if (!force && (row.retry_after ?? 0) > now) return "rejected_cooldown" as const
        yield* tx.update(IssueMetadataSyncTable).set({
          requested_generation: sql`${IssueMetadataSyncTable.requested_generation} + 1`,
          retry_after: force ? null : row.retry_after,
          next_due_at: now,
          time_updated: now,
        }).where(and(
          eq(IssueMetadataSyncTable.connection_id, connectionID),
          eq(IssueMetadataSyncTable.scope, scope),
        )).run()
        return "requested" as const
      }), { behavior: "immediate" }).pipe(Effect.orDie)
      yield* Effect.logInfo("issue metadata request", {
        connectionID,
        scope,
        force,
        outcome,
        durationMs: Date.now() - startedAt,
      })
      return outcome === "requested"
    })

    const claimMetadataScope = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID, scope: string) {
      const startedAt = Date.now()
      const result = yield* db.transaction((tx) => Effect.gen(function* () {
        const now = Date.now()
        const row = yield* tx.select().from(IssueMetadataSyncTable).where(and(
          eq(IssueMetadataSyncTable.connection_id, connectionID),
          eq(IssueMetadataSyncTable.scope, scope),
        )).get()
        if (!row) return { outcome: "rejected_missing_request" as const }
        if (row.requested_generation <= row.completed_generation) return { outcome: "deduplicated_complete" as const }
        if ((row.retry_after ?? 0) > now) return { outcome: "rejected_cooldown" as const }
        if ((row.lease_until ?? 0) > now) return { outcome: "deduplicated_leased" as const }
        const token = crypto.randomUUID()
        const claimed = yield* tx.update(IssueMetadataSyncTable).set({
          lease_token: token,
          lease_until: now + MetadataLeaseDuration,
          last_attempt_at: now,
          time_updated: now,
        }).where(and(
          eq(IssueMetadataSyncTable.connection_id, connectionID),
          eq(IssueMetadataSyncTable.scope, scope),
          eq(IssueMetadataSyncTable.requested_generation, row.requested_generation),
          eq(IssueMetadataSyncTable.credential_generation, row.credential_generation),
          or(isNull(IssueMetadataSyncTable.lease_until), lte(IssueMetadataSyncTable.lease_until, now)),
        )).returning({ token: IssueMetadataSyncTable.lease_token }).get()
        return claimed
          ? { outcome: "claimed" as const, claim: { token, generation: row.requested_generation, credentialGeneration: row.credential_generation } }
          : { outcome: "deduplicated_race" as const }
      }), { behavior: "immediate" }).pipe(Effect.orDie)
      yield* Effect.logInfo("issue metadata claim", {
        connectionID,
        scope,
        outcome: result.outcome,
        durationMs: Date.now() - startedAt,
      })
      return result.outcome === "claimed" ? result.claim : undefined
    })

    const metadataStatus = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID) {
      const rows = yield* db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).all().pipe(Effect.orDie)
      const now = Date.now()
      const latest = rows.toSorted((a, b) => (b.last_attempt_at ?? 0) - (a.last_attempt_at ?? 0))[0]
      const errors = rows.filter((row) => row.last_error !== null)
        .map((row) => `${row.scope}: ${row.last_error}`)
        .toSorted()
      return IssueWatcher.MetadataSyncStatus.make({
        syncing: rows.some((row) => row.requested_generation > row.completed_generation || (row.lease_until ?? 0) > now),
        refreshingProjectKeys: rows.filter((row) => row.scope.startsWith("project:") && (
          row.requested_generation > row.completed_generation || (row.lease_until ?? 0) > now
        )).map((row) => row.scope.slice("project:".length)).toSorted(),
        ...(latest?.last_attempt_at === null || latest?.last_attempt_at === undefined ? {} : { lastAttemptAt: latest.last_attempt_at }),
        ...(errors.length === 0 ? {} : { syncError: errors.join("; ") }),
      })
    })

    const metadataView = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID) {
      return yield* db.transaction((tx) => Effect.gen(function* () {
        const snapshotRow = yield* tx.select().from(IssueMetadataSnapshotTable)
          .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get()
        const rows = yield* tx.select().from(IssueMetadataSyncTable)
          .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).all()
        const now = Date.now()
        const latest = rows.toSorted((a, b) => (b.last_attempt_at ?? 0) - (a.last_attempt_at ?? 0))[0]
        const errors = rows.filter((row) => row.last_error !== null)
          .map((row) => `${row.scope}: ${row.last_error}`)
          .toSorted()
        return {
          snapshot: snapshotRow ? decodeMetadataSnapshot(snapshotRow.snapshot) : undefined,
          status: IssueWatcher.MetadataSyncStatus.make({
            syncing: rows.some((row) => row.requested_generation > row.completed_generation || (row.lease_until ?? 0) > now),
            refreshingProjectKeys: rows.filter((row) => row.scope.startsWith("project:") && (
              row.requested_generation > row.completed_generation || (row.lease_until ?? 0) > now
            )).map((row) => row.scope.slice("project:".length)).toSorted(),
            ...(latest?.last_attempt_at === null || latest?.last_attempt_at === undefined ? {} : { lastAttemptAt: latest.last_attempt_at }),
            ...(errors.length === 0 ? {} : { syncError: errors.join("; ") }),
          }),
        }
      })).pipe(Effect.orDie)
    })

    const runMetadataScope = Effect.fnUntraced(function* (
      adapter: IssueProvider.Adapter,
      connectionID: Credential.ConnectionID,
      scope: string,
      reason: string,
    ) {
      const claim = yield* claimMetadataScope(connectionID, scope)
      if (!claim) return false
      const startedAt = Date.now()
      const credential = yield* ownedConnection(adapter.integrationID, connectionID)
      const projectKey = scope.startsWith("project:") ? scope.slice("project:".length) : undefined
      const connectionCapacity = metadataConnectionCapacity.get(connectionID) ?? Semaphore.makeUnsafe(4)
      metadataConnectionCapacity.set(connectionID, connectionCapacity)
      const providerEffect: Effect.Effect<IssueWatcher.MetadataGlobal | IssueWatcher.MetadataProjectScope, IssueProvider.Error> = projectKey
        ? adapter.metadataProject(credential, projectKey).pipe(Effect.map((value) => value as IssueWatcher.MetadataGlobal | IssueWatcher.MetadataProjectScope))
        : adapter.metadataGlobal(credential).pipe(Effect.map((value) => value as IssueWatcher.MetadataGlobal | IssueWatcher.MetadataProjectScope))
      const renewLease = Effect.suspend(() => {
        const now = Date.now()
        return db.update(IssueMetadataSyncTable).set({
          lease_until: now + MetadataLeaseDuration,
          time_updated: now,
        }).where(and(
          eq(IssueMetadataSyncTable.connection_id, connectionID),
          eq(IssueMetadataSyncTable.scope, scope),
          eq(IssueMetadataSyncTable.lease_token, claim.token),
          eq(IssueMetadataSyncTable.requested_generation, claim.generation),
          eq(IssueMetadataSyncTable.credential_generation, claim.credentialGeneration),
        )).run().pipe(Effect.orDie)
      })
      const activeProviderEffect = Effect.scoped(Effect.gen(function* () {
        yield* renewLease
        yield* renewLease.pipe(
          Effect.delay(MetadataLeaseDuration / 3),
          Effect.forever,
          Effect.forkScoped,
        )
        return yield* metadataProviderCapacity.withPermit(connectionCapacity.withPermit(providerEffect))
      }))
      yield* activeProviderEffect.pipe(
        Effect.result,
        Effect.flatMap((result) => db.transaction((tx) => Effect.gen(function* () {
          const row = yield* tx.select().from(IssueMetadataSyncTable).where(and(
            eq(IssueMetadataSyncTable.connection_id, connectionID),
            eq(IssueMetadataSyncTable.scope, scope),
            eq(IssueMetadataSyncTable.lease_token, claim.token),
            eq(IssueMetadataSyncTable.requested_generation, claim.generation),
            eq(IssueMetadataSyncTable.credential_generation, claim.credentialGeneration),
          )).get()
          if (!row) return "superseded" as const
          const now = Date.now()
          if (result._tag === "Success") {
            const snapshotRow = yield* tx.select().from(IssueMetadataSnapshotTable)
              .where(and(
                eq(IssueMetadataSnapshotTable.connection_id, connectionID),
                eq(IssueMetadataSnapshotTable.credential_generation, claim.credentialGeneration),
              )).get()
            if (!snapshotRow) return "superseded" as const
            const snapshot = decodeMetadataSnapshot(snapshotRow.snapshot)
            const next: IssueWatcher.MetadataSnapshot = projectKey
              ? {
                ...snapshot,
                projects: {
                  ...snapshot.projects,
                  [projectKey]: { ...(result.success as IssueWatcher.MetadataProjectScope), syncedAt: now },
                },
                updatedAt: now,
              }
              : {
                ...snapshot,
                global: { ...(result.success as IssueWatcher.MetadataGlobal), syncedAt: now },
                updatedAt: now,
              }
            yield* tx.update(IssueMetadataSnapshotTable).set({ snapshot: next, time_updated: now }).where(and(
              eq(IssueMetadataSnapshotTable.connection_id, connectionID),
              eq(IssueMetadataSnapshotTable.credential_generation, claim.credentialGeneration),
            )).run()
            yield* tx.update(IssueMetadataSyncTable).set({
              completed_generation: claim.generation,
              lease_token: null,
              lease_until: null,
              last_error: null,
              retry_after: null,
              next_due_at: nextDue(connectionID, scope, now),
              time_updated: now,
            }).where(and(
              eq(IssueMetadataSyncTable.connection_id, connectionID),
              eq(IssueMetadataSyncTable.scope, scope),
              eq(IssueMetadataSyncTable.lease_token, claim.token),
            )).run()
            return "succeeded" as const
          }
          const error = result.failure
          yield* tx.update(IssueMetadataSyncTable).set({
            completed_generation: claim.generation,
            lease_token: null,
            lease_until: null,
            last_error: metadataError(error),
            retry_after: now + MetadataRetryCooldown,
            next_due_at: now + MetadataRetryCooldown,
            time_updated: now,
          }).where(and(
            eq(IssueMetadataSyncTable.connection_id, connectionID),
            eq(IssueMetadataSyncTable.scope, scope),
            eq(IssueMetadataSyncTable.lease_token, claim.token),
          )).run()
          return error._tag === "IssueProvider.AuthenticationError"
            ? "authentication_failed" as const
            : "provider_failed" as const
        }), { behavior: "immediate" }).pipe(Effect.orDie)),
        Effect.tap((outcome) => Effect.logInfo("issue metadata sync completed", {
          integrationID: adapter.integrationID,
          connectionID,
          scope,
          reason,
          outcome,
          durationMs: Date.now() - startedAt,
          generation: claim.generation,
          credentialGeneration: claim.credentialGeneration,
        })),
        Effect.withSpan("IssueWatcher.metadata.sync", { attributes: {
          integrationID: adapter.integrationID,
          connectionID,
          scope,
          reason,
          generation: claim.generation,
          credentialGeneration: claim.credentialGeneration,
        } }),
        Effect.forkIn(serviceScope),
      )
      return true
    })

    const scheduleMetadata = Effect.fnUntraced(function* (
      integrationID: Integration.ID,
      connectionID: Credential.ConnectionID,
      reason: string,
      projects: "cached" | ReadonlyArray<string>,
      force = true,
    ) {
      const adapter = yield* provider(integrationID)
      yield* ownedConnection(integrationID, connectionID)
      yield* requestMetadataScope(connectionID, "global", force)
      yield* runMetadataScope(adapter, connectionID, "global", reason)
      const keys = projects === "cached" ? Object.keys((yield* metadataSnapshot(connectionID))?.projects ?? {}) : projects
      yield* Effect.forEach([...new Set(keys)], (key) => Effect.gen(function* () {
        const scope = `project:${key}`
        yield* requestMetadataScope(connectionID, scope, force)
        yield* runMetadataScope(adapter, connectionID, scope, reason)
      }), { concurrency: 4 })
    })

    const storedRun = (row: typeof IssueWatcherRunTable.$inferSelect) => decodeRun({
      id: row.id,
      watcherID: row.watcher_id,
      startedAt: row.started_at,
      ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
      outcome: row.outcome,
      scanned: row.scanned,
      matched: row.matched,
      created: row.created,
      queued: row.queued,
      unrouted: row.unrouted,
      skipped: row.skipped,
      failed: row.failed,
      ...(row.cursor ? { cursor: row.cursor } : {}),
      ...(row.error ? { error: row.error } : {}),
    })

    const sameSnapshot = (row: typeof IssueWatcherTable.$inferSelect, watcher: Info) =>
      row.enabled === watcher.enabled &&
      row.archived_at === null &&
      row.time_updated === watcher.timeUpdated.epochMilliseconds &&
      row.cursor === (watcher.cursor ?? null) &&
      row.name === watcher.name &&
      row.project_id === (watcher.projectID ?? null) &&
      canonicalJson(row.criteria) === canonicalJson(watcher.criteria) &&
      canonicalJson(row.routing) === canonicalJson(watcher.routing) &&
      canonicalJson(row.action) === canonicalJson(watcher.action)

    const storedMatch = (row: typeof IssueMatchTable.$inferSelect) => decodeMatch({
      id: row.id,
      watcherID: row.watcher_id,
      integrationID: row.integration_id,
      connectionID: row.connection_id,
      externalID: row.external_id,
      externalKey: row.external_key,
      externalUrl: row.external_url,
      fingerprint: row.fingerprint,
      externalUpdatedAt: row.external_updated_at,
      state: row.state,
      ...(row.project_id ? { projectID: row.project_id } : {}),
      ...(row.route_reason ? { routeReason: row.route_reason } : {}),
      payload: row.payload,
      ...(row.error ? { error: row.error } : {}),
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    })

    const storedObservation = (row: typeof IssueMatchObservationTable.$inferSelect) => decodeObservation({
      id: row.id,
      matchID: row.match_id,
      runID: row.run_id,
      fingerprint: row.fingerprint,
      externalUpdatedAt: row.external_updated_at,
      payload: row.payload,
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    })

    const storedIgnore = (row: typeof IssueWatcherIgnoreTable.$inferSelect) => decodeIgnore({
      watcherID: row.watcher_id,
      externalID: row.external_id,
      ...(row.reason ? { reason: row.reason } : {}),
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    })

    const requireMatch = Effect.fnUntraced(function* (id: IssueMatch.ID) {
      const row = yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.id, id)).get().pipe(Effect.orDie)
      if (!row) return yield* new MatchNotFoundError({ id })
      return row
    })

    const materializeResult = Effect.fnUntraced(function* (id: IssueMatch.ID, request: IssueWatcher.MaterializeInput, rematerialize = false) {
      const match = yield* requireMatch(id)
      if (match.state === "unrouted" && !request.projectID)
        return yield* new MatchConflictError({ id, detail: "Issue match is not routed" })
      if (match.state === "skipped" || match.state === "dismissed")
        return yield* new MatchConflictError({ id, detail: `Issue match is ${match.state}` })
      if (match.state === "duplicate" && !rematerialize)
        return yield* new MatchConflictError({ id, detail: "Issue match is duplicate" })
      const projectID = request.projectID ?? (match.project_id ? Project.ID.make(match.project_id) : undefined)
      if (!projectID) return yield* new MatchConflictError({ id, detail: "Issue match is not routed" })
      if (rematerialize) {
        const previous = yield* db.select().from(IssueMaterializationTable)
          .where(eq(IssueMaterializationTable.match_id, id))
          .orderBy(desc(IssueMaterializationTable.time_created)).get().pipe(Effect.orDie)
        if (
          !previous || !["cancelled", "failed"].includes(previous.state) || previous.provider_started ||
          (previous.state === "failed" && !previous.error?.startsWith("retryable:"))
        ) return yield* new MatchConflictError({ id, detail: "Issue materialization is not retryable" })
      }
      const project = yield* projectCatalog.resolve(projectID, request.directory).pipe(
        Effect.mapError(() => new ProjectNotFoundError({ id: projectID })),
      )
      const value = yield* materialization.materialize({
        matchID: id,
        mode: request.mode,
        projectID: project.id,
        directory: project.directory,
        ...(request.workspace ? { workspace: request.workspace } : {}),
        rematerialize,
      })
      if (!value) return IssueWatcher.MaterializeResult.make({ status: "queued", reason: "concurrency_limit" })
      if ("_tag" in value)
        return yield* new MatchConflictError({ id, detail: "Issue match is duplicate" })
      if (value.state === "failed") return yield* new MatchConflictError({
        id,
        detail: value.error ?? "Issue materialization failed",
      })
      return IssueWatcher.MaterializeResult.make({
        status: "created",
        materializationID: value.id,
        sessionID: value.sessionID,
      })
    })

    const provenanceDetail = Effect.fn("IssueWatcher.provenanceDetail")(function* (sessionID: SessionID) {
      const provenance = yield* db.select().from(SessionProvenanceTable)
        .where(eq(SessionProvenanceTable.session_id, sessionID)).get().pipe(Effect.orDie)
      if (!provenance) return yield* new ProvenanceNotFoundError({ sessionID })
      const match = provenance.match_id
        ? yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.id, provenance.match_id)).get().pipe(Effect.orDie)
        : undefined
      if (!match) return yield* new ProvenanceNotFoundError({ sessionID })
      const integrationID = Integration.ID.make(provenance.integration_id)
      const connectionID = Credential.ConnectionID.make(provenance.connection_id)
      const adapter = yield* providers.get(integrationID)
      const links = yield* db.select().from(IssueMatchSessionTable)
        .where(eq(IssueMatchSessionTable.match_id, match.id)).all().pipe(Effect.orDie)
      const materialized = yield* db.select().from(IssueMaterializationTable)
        .where(and(
          eq(IssueMaterializationTable.match_id, match.id),
          eq(IssueMaterializationTable.session_id, sessionID),
        )).orderBy(desc(IssueMaterializationTable.time_created)).get().pipe(Effect.orDie)
      const latestExecution = yield* db.select().from(SessionExecutionAttemptTable)
        .where(eq(SessionExecutionAttemptTable.session_id, sessionID))
        .orderBy(desc(SessionExecutionAttemptTable.scheduled_at), desc(sql<number>`rowid`)).get().pipe(Effect.orDie)
      const writebacks = yield* db.select().from(IssueWritebackOperationTable)
        .where(eq(IssueWritebackOperationTable.session_id, sessionID)).all().pipe(Effect.orDie)
      return SessionProvenance.Detail.make({
        provenance: {
          sessionID,
          kind: "issue",
          ...(provenance.watcher_id ? { watcherID: provenance.watcher_id } : {}),
          ...(provenance.match_id ? { matchID: provenance.match_id } : {}),
          integrationID,
          connectionID,
          externalKey: provenance.external_key,
          externalUrl: provenance.external_url,
          watcherName: provenance.watcher_name,
          ...(provenance.branch ? { branch: provenance.branch } : {}),
          writeback: provenance.writeback,
          ...(provenance.last_synced_at ? { lastSyncedAt: DateTime.makeUnsafe(provenance.last_synced_at) } : {}),
          timeCreated: DateTime.makeUnsafe(provenance.time_created),
          timeUpdated: DateTime.makeUnsafe(provenance.time_updated),
        },
        issue: match.payload,
        source: { integrationID, name: adapter?.name ?? integrationID, glyph: integrationID },
        watcher: { ...(provenance.watcher_id ? { id: provenance.watcher_id } : {}), name: provenance.watcher_name },
        ...(provenance.branch ? { branch: provenance.branch } : {}),
        ...(materialized?.resolved_location ? { workspace: materialized.resolved_location } : {}),
        sessions: links.map((row) => decodeLink({
          id: row.id,
          matchID: row.match_id,
          sessionID: row.session_id,
          isPrimary: row.is_primary,
          reason: row.reason,
          ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
          timeCreated: row.time_created,
          timeUpdated: row.time_updated,
        })),
        ...(materialized ? { materialization: decodeMaterialization({
          id: materialized.id,
          matchID: materialized.match_id,
          mode: materialized.mode,
          projectID: materialized.project_id,
          workspace: materialized.workspace,
          ...(materialized.resolved_location ? { resolvedLocation: materialized.resolved_location } : {}),
          ...(materialized.workspace_lease ? { workspaceLease: materialized.workspace_lease } : {}),
          baselineObservationID: materialized.baseline_observation_id,
          state: materialized.state,
          sessionID: materialized.session_id,
          messageID: materialized.message_id,
          ...(materialized.execution_attempt_id ? { executionAttemptID: materialized.execution_attempt_id } : {}),
          providerStarted: materialized.provider_started,
          attempts: materialized.attempts,
          ...(materialized.error ? { error: materialized.error } : {}),
          timeCreated: materialized.time_created,
          timeUpdated: materialized.time_updated,
        }) } : {}),
        ...(latestExecution ? { latestExecution: SessionExecutionAttempt.fromRow(latestExecution) } : {}),
        writebacks: writebacks.map((row) => decodeWriteback({
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
        })),
        ...(provenance.last_synced_at ? { lastSyncedAt: DateTime.makeUnsafe(provenance.last_synced_at) } : {}),
      })
    })

    const publish = (watcher: Info) => events.publish(Event.Updated, { watcher }).pipe(Effect.asVoid)

    const ownerStatus = () => owner.status()

    const requireOwner = () => {
      const status = owner.status()
      return status.status === "active"
        ? Effect.void
        : new OwnerConflictError({ detail: status.detail ?? "Issue watching is disabled" })
    }

    const provider = Effect.fnUntraced(function* (integrationID: Integration.ID) {
      const adapter = yield* providers.get(integrationID)
      if (!adapter) return yield* new SourceNotFoundError({ integrationID })
      return adapter
    })

    const connection = Effect.fnUntraced(function* (connectionID: Credential.ConnectionID) {
      const credential = yield* credentials.getConnection(connectionID)
      if (!credential || credential.value.type !== "key") return yield* new ConnectionNotFoundError({ connectionID })
      return credential
    })

    const ownedConnection = Effect.fnUntraced(function* (
      integrationID: Integration.ID,
      connectionID: Credential.ConnectionID,
    ) {
      yield* provider(integrationID)
      const credential = yield* connection(connectionID)
      if (credential.integrationID !== integrationID || credential.value.type !== "key") {
        return yield* new ConnectionNotFoundError({ connectionID })
      }
      return credential.value
    })

    const projectSource = Effect.fnUntraced(function* (adapter: IssueProvider.Adapter) {
      const saved = (yield* credentials.list(adapter.integrationID)).toReversed().find(
        (credential) => credential.connectionID && credential.value.type === "key",
      )
      const watchers = (yield* db
        .select()
        .from(IssueWatcherTable)
        .where(and(eq(IssueWatcherTable.integration_id, adapter.integrationID), isNull(IssueWatcherTable.archived_at)))
        .all()
        .pipe(Effect.orDie)).map(stored)
      const lastPollAt = watchers.flatMap((watcher) => (watcher.lastRunAt ? [watcher.lastRunAt] : [])).toSorted().at(-1)
      return Schema.decodeUnknownSync(IssueWatcher.IntegrationSummary)({
        integration: {
          id: adapter.integrationID,
          name: adapter.name,
          methods: [adapter.method],
          connections: saved ? [{ type: "credential", id: saved.id, label: saved.label }] : [],
        },
        ...(saved?.connectionID && saved.tenantIdentity && saved.value.type === "key" && saved.value.verification
          ? {
              connection: {
                id: saved.connectionID,
                label: saved.label,
                tenantIdentity: saved.tenantIdentity,
                inputs: saved.value.inputs,
                verification: saved.value.verification,
              },
            }
          : {}),
        watcherCount: watchers.length,
        ...(lastPollAt ? { lastPollAt: lastPollAt.epochMilliseconds } : {}),
        owner: ownerStatus(),
      })
    })

    const previewIssues = Effect.fnUntraced(function* (
      adapter: IssueProvider.Adapter,
      credential: Credential.Key,
      criteria: IssueWatcher.Criteria,
      page?: string,
      remaining = PreviewLimit + 1,
      pages = 0,
      seen: ReadonlySet<string> = new Set(),
    ): Effect.fn.Return<ReadonlyArray<Issue.Info>, IssueProvider.Error> {
      if (pages >= PreviewPageLimit) {
        return yield* new IssueProvider.PaginationError({ detail: `Preview exceeded ${PreviewPageLimit} provider pages` })
      }
      if (page && seen.has(page)) {
        return yield* new IssueProvider.PaginationError({ detail: "Preview provider repeated a page token" })
      }
      const result = yield* adapter.search({ credential, criteria, ...(page ? { page } : {}) })
      if (result.issues.length >= remaining) return result.issues.slice(0, remaining)
      if (!result.nextPage) return result.issues
      const next = yield* previewIssues(
        adapter,
        credential,
        criteria,
        result.nextPage,
        remaining - result.issues.length,
        pages + 1,
        new Set(page ? [...seen, page] : seen),
      )
      return [...result.issues, ...next]
    })

    const verifyCredential = Effect.fnUntraced(function* (adapter: IssueProvider.Adapter, value: Credential.Key) {
      const result = yield* adapter.verify(value)
      return {
        result,
        value: Credential.Key.make({
          ...value,
          verification: { status: "connected", detail: result.detail, checkedAt: Date.now() },
        }),
      }
    })

    const inboxSummary = Effect.fn("IssueWatcher.summary")(function* () {
      const matches = yield* db.select({ id: IssueMatchTable.id, state: IssueMatchTable.state }).from(IssueMatchTable).all().pipe(Effect.orDie)
      const materialized = new Set((yield* db.select({ matchID: IssueMaterializationTable.match_id })
        .from(IssueMaterializationTable).all().pipe(Effect.orDie)).map((item) => item.matchID))
      const failedMaterializations = yield* db
        .select({ count: sql<number>`count(*)` })
        .from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.state, "failed"))
        .get()
        .pipe(Effect.orDie)
      const sessionsOpenedThisWeek = yield* db
        .select({ count: sql<number>`count(*)` })
        .from(IssueMatchSessionTable)
        .where(sql`${IssueMatchSessionTable.time_created} >= ${Date.now() - 7 * 24 * 60 * 60 * 1000}`)
        .get()
        .pipe(Effect.orDie)
      const failedRuns = yield* db
        .select({ count: sql<number>`count(*)` })
        .from(IssueWatcherRunTable)
        .where(sql`${IssueWatcherRunTable.outcome} in ('auth_failed', 'error')`)
        .get()
        .pipe(Effect.orDie)
      return Schema.decodeUnknownSync(IssueWatcher.InboxSummary)({
        pending: matches.filter((item) => item.state === "pending" && !materialized.has(item.id)).length,
        unrouted: matches.filter((item) => item.state === "unrouted").length,
        duplicate: matches.filter((item) => item.state === "duplicate").length,
        failedMaterializations: failedMaterializations?.count ?? 0,
        sessionsOpenedThisWeek: sessionsOpenedThisWeek?.count ?? 0,
        failedRuns: failedRuns?.count ?? 0,
      })
    })

    const collectPages = Effect.fnUntraced(function* (
      adapter: IssueProvider.Adapter,
      credential: Credential.Key,
      watcher: Info,
      page?: string,
      pages = 0,
      seen: ReadonlySet<string> = new Set(),
      watermark = watcher.cursor,
    ): Effect.fn.Return<{ issues: ReadonlyArray<Issue.Info>; cursor: string }, IssueProvider.Error> {
      if (pages >= PollPageLimit) {
        return yield* new IssueProvider.PaginationError({ detail: `Poll exceeded ${PollPageLimit} provider pages` })
      }
      if (page && seen.has(page)) {
        return yield* new IssueProvider.PaginationError({ detail: "Poll provider repeated a page token" })
      }
      const result = yield* adapter.search({
        credential,
        criteria: watcher.criteria,
        ...(watcher.cursor ? { cursor: watcher.cursor } : {}),
        ...(page ? { page } : {}),
      })
      const cursor = result.issues.length ? result.cursor : watermark ?? result.cursor
      if (!result.nextPage) return { issues: result.issues, cursor }
      const next = yield* collectPages(
        adapter,
        credential,
        watcher,
        result.nextPage,
        pages + 1,
        new Set(page ? [...seen, page] : seen),
        cursor,
      )
      return { issues: [...result.issues, ...next.issues], cursor: next.cursor }
    })

    const failedPoll = Effect.fnUntraced(function* (
      watcher: Info,
      startedAt: number,
      error: SourceNotFoundError | ConnectionNotFoundError | IssueProvider.Error,
    ) {
      const runID = IssueWatcher.RunID.create()
      const finishedAt = Date.now()
      const auth = error._tag === "IssueProvider.AuthenticationError" || error._tag === "IssueWatcher.ConnectionNotFoundError"
      const detail = error._tag === "IssueProvider.NotImplementedError"
        ? `${error.operation} is not implemented`
        : error._tag === "IssueWatcher.SourceNotFoundError"
          ? `Issue provider not found: ${error.integrationID}`
          : error._tag === "IssueWatcher.ConnectionNotFoundError"
            ? `Issue connection not found: ${error.connectionID}`
            : error.detail
      const committed = yield* db.transaction((tx) => Effect.gen(function* () {
        const current = yield* tx.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, watcher.id)).get()
        if (!current || !sameSnapshot(current, watcher)) return false
        yield* tx.insert(IssueWatcherRunTable).values({
          id: runID,
          watcher_id: watcher.id,
          started_at: startedAt,
          finished_at: finishedAt,
          outcome: auth ? "auth_failed" : "error",
          error: detail,
          cursor: watcher.cursor,
        }).run()
        yield* tx.update(IssueWatcherTable).set({
          last_run_at: finishedAt,
          ...(auth ? { enabled: false, last_error: detail } : {}),
        }).where(eq(IssueWatcherTable.id, watcher.id)).run()
        return true
      })).pipe(Effect.orDie)
      if (!committed) {
        return yield* new RunConflictError({
          id: watcher.id,
          detail: "Issue watcher changed while polling; the result was discarded",
        })
      }
      const row = yield* db.select().from(IssueWatcherRunTable).where(eq(IssueWatcherRunTable.id, runID)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.die("Failed issue watcher run was not found")
      const run = storedRun(row)
      yield* events.publish(Event.RunCompleted, { run })
      yield* publish(yield* get(watcher.id))
      yield* events.publish(Event.InboxChanged, yield* inboxSummary())
      return run
    })

    const poll = Effect.fnUntraced(function* (id: ID) {
      const watcher = yield* get(id)
      if (watcher.archivedAt) return yield* new NotFoundError({ id })
      const startedAt = Date.now()
      const result = yield* Effect.result(Effect.gen(function* () {
        const adapter = yield* provider(watcher.integrationID)
        const credential = yield* ownedConnection(watcher.integrationID, watcher.connectionID)
        return yield* collectPages(adapter, credential, watcher)
      }))
      if (Result.isFailure(result)) return yield* failedPoll(watcher, startedAt, result.failure)

      const projects = yield* projectCatalog.list()
      const issues = [...new Map(result.success.issues.map((issue) => [issue.id, issue])).values()]
      const runID = IssueWatcher.RunID.create()
      const finishedAt = Date.now()
      const changes = yield* db.transaction((tx) => Effect.gen(function* () {
        const currentWatcher = yield* tx.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, watcher.id)).get()
        if (!currentWatcher || !sameSnapshot(currentWatcher, watcher)) return undefined
        const ignores = new Set((yield* tx.select({ externalID: IssueWatcherIgnoreTable.external_id })
          .from(IssueWatcherIgnoreTable)
          .where(eq(IssueWatcherIgnoreTable.watcher_id, watcher.id))
          .all()).map((item) => item.externalID))
        const existing = new Map((yield* tx.select().from(IssueMatchTable)
          .where(eq(IssueMatchTable.watcher_id, watcher.id)).all()).map((row) => [row.external_id, row]))
        const changes = issues.map((issue) => {
          const current = existing.get(issue.id)
          const hash = fingerprint(issue)
          const routed = route(issue, watcher.routing, projects)
          const ignored = ignores.has(issue.id)
          const state = ignored ? "skipped" as const : "projectID" in routed ? "pending" as const : "unrouted" as const
          const changed = current?.fingerprint !== hash
          return { issue, current, hash, routed, state, ignored, changed, updatesMatch: changed || (ignored && current?.state !== "skipped") }
        })
        yield* tx.insert(IssueWatcherRunTable).values({
          id: runID,
          watcher_id: watcher.id,
          started_at: startedAt,
          finished_at: finishedAt,
          outcome: "ok",
          scanned: result.success.issues.length,
          matched: issues.length,
          created: 0,
          queued: 0,
          unrouted: changes.filter((change) => change.state === "unrouted").length,
          skipped: changes.filter((change) => change.state === "skipped").length,
          failed: 0,
          cursor: watcher.cursor,
        }).run()
        yield* Effect.forEach(changes, (change) => Effect.gen(function* () {
          if (!change.current) {
            const matchID = IssueMatch.ID.create()
            yield* tx.insert(IssueMatchTable).values({
              id: matchID,
              watcher_id: watcher.id,
              integration_id: watcher.integrationID,
              connection_id: watcher.connectionID,
              external_id: change.issue.id,
              external_key: change.issue.key,
              external_url: change.issue.url,
              fingerprint: change.hash,
              external_updated_at: change.issue.updatedAt,
              state: change.state,
              project_id: "projectID" in change.routed ? change.routed.projectID : null,
              route_reason: change.routed.reason,
              payload: change.issue,
            }).run()
            yield* tx.insert(IssueMatchObservationTable).values({
              id: IssueMatch.ObservationID.create(),
              match_id: matchID,
              run_id: runID,
              fingerprint: change.hash,
              external_updated_at: change.issue.updatedAt,
              payload: change.issue,
            }).run()
            return
          }
          if (!change.updatesMatch) return
          const preserveTriage = !change.ignored && !watcher.criteria.watchUpdates
          yield* tx.update(IssueMatchTable).set({
            external_key: change.issue.key,
            external_url: change.issue.url,
            fingerprint: change.hash,
            external_updated_at: change.issue.updatedAt,
            state: preserveTriage ? change.current.state : change.state,
            project_id: preserveTriage
              ? change.current.project_id
              : "projectID" in change.routed ? change.routed.projectID : null,
            route_reason: preserveTriage ? change.current.route_reason : change.routed.reason,
            payload: change.issue,
          }).where(eq(IssueMatchTable.id, change.current.id)).run()
          yield* tx.insert(IssueMatchObservationTable).values({
            id: IssueMatch.ObservationID.create(),
            match_id: change.current.id,
            run_id: runID,
            fingerprint: change.hash,
            external_updated_at: change.issue.updatedAt,
            payload: change.issue,
          }).onConflictDoNothing().run()
        }), { discard: true })
        yield* tx.update(IssueWatcherTable).set({
          cursor: result.success.cursor,
          last_run_at: finishedAt,
          last_error: null,
        }).where(eq(IssueWatcherTable.id, watcher.id)).run()
        return changes
      })).pipe(Effect.orDie)
      if (!changes) {
        return yield* new RunConflictError({
          id: watcher.id,
          detail: "Issue watcher changed while polling; the result was discarded",
        })
      }
      const changedRows = yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.watcher_id, watcher.id)).all().pipe(Effect.orDie)
      yield* Effect.forEach(changes.filter((change) => !change.current || change.updatesMatch), (change) => {
        const match = changedRows.find((row) => row.external_id === change.issue.id)
        if (!match) return Effect.void
        return events.publish(change.current ? Event.MatchUpdated : Event.MatchCreated, { match: storedMatch(match) })
      }, { discard: true })
      const automatic = watcher.action.mode === "inbox"
        ? []
        : yield* Effect.forEach(
            changes.filter((change) => !change.current && change.state === "pending"),
            (change) => {
              const match = changedRows.find((row) => row.external_id === change.issue.id)
              return match
                ? materialization.materialize({
                    matchID: match.id,
                    mode: watcher.action.mode === "run" ? "run" : "awaiting_run",
                  }).pipe(Effect.map((value) => [value]))
                : Effect.succeed([])
            },
            { concurrency: "unbounded" },
          ).pipe(Effect.map((items) => items.flat()))
      if (automatic.length) {
        yield* db.update(IssueWatcherRunTable).set({
          created: automatic.filter((item) => item && !("_tag" in item) && item.state !== "failed").length,
          queued: automatic.filter((item) => !item || (!("_tag" in item) && item.mode === "awaiting_run" && item.state !== "failed")).length,
          failed: automatic.filter((item) => item && !("_tag" in item) && item.state === "failed").length,
        }).where(eq(IssueWatcherRunTable.id, runID)).run().pipe(Effect.orDie)
      }
      const row = yield* db.select().from(IssueWatcherRunTable).where(eq(IssueWatcherRunTable.id, runID)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.die("Completed issue watcher run was not found")
      const run = storedRun(row)
      yield* events.publish(Event.RunCompleted, { run })
      yield* publish(yield* get(watcher.id))
      yield* events.publish(Event.InboxChanged, yield* inboxSummary())
      return run
    })

    const run = Effect.fn("IssueWatcher.run")(function* (id: ID) {
      yield* requireOwner()
      const running = active.get(id)
      if (running) return yield* Deferred.await(running)
      const deferred = Deferred.makeUnsafe<IssueWatcher.Run, NotFoundError | RunConflictError>()
      active.set(id, deferred)
      return yield* poll(id).pipe(
        Effect.onExit((exit) => Effect.sync(() => {
          active.delete(id)
          Deferred.doneUnsafe(deferred, exit)
        })),
      )
    })

    const reconcileAutomatic = Effect.fn("IssueWatcher.reconcileAutomatic")(function* () {
      const rows = yield* db.select({ match: IssueMatchTable, watcher: IssueWatcherTable })
        .from(IssueMatchTable)
        .innerJoin(IssueWatcherTable, eq(IssueWatcherTable.id, IssueMatchTable.watcher_id))
        .where(and(
          eq(IssueMatchTable.state, "pending"),
          isNull(IssueWatcherTable.archived_at),
          sql`${IssueWatcherTable.action} ->> '$.mode' <> 'inbox'`,
          notExists(db.select({ id: IssueMaterializationTable.id }).from(IssueMaterializationTable)
            .where(eq(IssueMaterializationTable.match_id, IssueMatchTable.id))),
        )).all().pipe(Effect.orDie)
      yield* Effect.forEach(rows, (row) => materialization.materialize({
        matchID: row.match.id,
        mode: row.watcher.action.mode === "run" ? "run" : "awaiting_run",
      }), { concurrency: 1, discard: true })
    })

    const listWatchers = Effect.fnUntraced(function* () {
      return (yield* db
        .select()
        .from(IssueWatcherTable)
        .where(isNull(IssueWatcherTable.archived_at))
        .orderBy(asc(IssueWatcherTable.time_created))
        .limit(ListLimit)
        .all()
        .pipe(Effect.orDie)).map(stored)
    })

    const summaries = Effect.fn("IssueWatcher.list")(function* () {
      return yield* Effect.forEach(yield* listWatchers(), (watcher) => Effect.gen(function* () {
        const adapter = yield* providers.get(watcher.integrationID)
        const credential = yield* credentials.getConnection(watcher.connectionID)
        const assigneeID = typeof watcher.criteria.assignee === "object" ? watcher.criteria.assignee.id : undefined
        const snapshot = assigneeID
          ? yield* metadataSnapshot(watcher.connectionID)
          : undefined
        const projectMetadata = watcher.criteria.issueProjects.length
          ? watcher.criteria.issueProjects.flatMap((key) => snapshot?.projects[key] ? [snapshot.projects[key]] : [])
          : Object.values(snapshot?.projects ?? {})
        const assignee = assigneeID
          ? uniqueMetadataOptions(projectMetadata.flatMap((project) => project.users))
            .find((user) => user.id === assigneeID)
          : undefined
        const lastRun = yield* db.select().from(IssueWatcherRunTable)
          .where(eq(IssueWatcherRunTable.watcher_id, watcher.id))
          .orderBy(desc(IssueWatcherRunTable.started_at), desc(IssueWatcherRunTable.id))
          .get().pipe(Effect.orDie)
        const recent = yield* db.select({ count: sql<number>`count(*)` }).from(IssueMatchTable)
          .where(and(eq(IssueMatchTable.watcher_id, watcher.id), sql`${IssueMatchTable.time_created} >= ${Date.now() - 7 * 24 * 60 * 60 * 1000}`))
          .get().pipe(Effect.orDie)
        return IssueWatcher.Summary.make({
          watcher,
          sourceName: adapter?.name ?? watcher.integrationID,
          sourceGlyph: watcher.integrationID,
          ...(assignee ? { assignee } : {}),
          ...(credential?.tenantIdentity && credential.value.type === "key" && credential.value.verification
            ? {
                connection: {
                  id: watcher.connectionID,
                  label: credential.label,
                  tenantIdentity: credential.tenantIdentity,
                  inputs: credential.value.inputs ?? {},
                  verification: credential.value.verification,
                },
              }
            : {}),
          ...(lastRun ? { lastRun: storedRun(lastRun) } : {}),
          recentMatchCount: recent?.count ?? 0,
        })
      }))
    })

    const decodeCursor = (cursor: IssueWatcher.PageCursor | undefined) => {
      if (!cursor) return Effect.succeed(undefined)
      return Effect.try({
        try: () => Schema.decodeUnknownSync(Schema.Struct({ time: Schema.Number, id: Schema.String }))(
          JSON.parse(Buffer.from(cursor, "base64url").toString()),
        ),
        catch: () => new InvalidCursorError({ detail: "Invalid issue watcher cursor" }),
      })
    }
    const encodeCursor = (time: number, id: string) =>
      IssueWatcher.PageCursor.make(Buffer.from(JSON.stringify({ time, id })).toString("base64url"))
    const binaryDescending = (left: string, right: string) => left < right ? 1 : left > right ? -1 : 0

    const service = Service.of({
      status: owner.status,
      list: summaries,
      get,
      create: Effect.fn("IssueWatcher.create")(function* (input) {
        const status = owner.status()
        if (input.enabled !== false && status.status !== "active") {
          return yield* new OwnerConflictError({ detail: status.detail ?? "Issue watching is disabled" })
        }
        const id = ID.create()
        yield* db
          .insert(IssueWatcherTable)
          .values({
            id,
            integration_id: input.integrationID,
            connection_id: input.connectionID,
            name: input.name,
            enabled: input.enabled ?? true,
            project_id: input.projectID,
            criteria: input.criteria,
            routing: input.routing,
            action: input.action,
          })
          .run()
          .pipe(Effect.orDie)
        const row = yield* db.select().from(IssueWatcherTable).where(eq(IssueWatcherTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return yield* Effect.die("Inserted issue watcher was not found")
        const watcher = stored(row)
        yield* publish(watcher)
        return watcher
      }),
      update: Effect.fn("IssueWatcher.update")(function* (id, input) {
        const current = yield* get(id)
        if (current.archivedAt) return yield* new ArchivedError({ id })
        yield* db
          .update(IssueWatcherTable)
          .set({
            name: input.name,
            project_id: input.projectID,
            criteria: input.criteria,
            routing: input.routing,
            action: input.action,
            cursor: input.criteria ? null : undefined,
            time_updated: Math.max(Date.now(), current.timeUpdated.epochMilliseconds + 1),
          })
          .where(eq(IssueWatcherTable.id, id))
          .run()
          .pipe(Effect.orDie)
        const watcher = yield* get(id)
        yield* publish(watcher)
        return watcher
      }),
      archive: Effect.fn("IssueWatcher.archive")(function* (id) {
        const current = yield* get(id)
        const archivedAt = Date.now()
        yield* db
          .update(IssueWatcherTable)
          .set({ enabled: false, archived_at: archivedAt, time_updated: Math.max(archivedAt, current.timeUpdated.epochMilliseconds + 1) })
          .where(and(eq(IssueWatcherTable.id, id), isNull(IssueWatcherTable.archived_at)))
          .run()
          .pipe(Effect.orDie)
        yield* publish(yield* get(id))
      }),
      enable: Effect.fn("IssueWatcher.enable")(function* (id, enabled) {
        const current = yield* get(id)
        if (current.archivedAt) return yield* new ArchivedError({ id })
        const status = owner.status()
        if (enabled && status.status !== "active") {
          return yield* new OwnerConflictError({ detail: status.detail ?? "Issue watching is disabled" })
        }
        yield* db
          .update(IssueWatcherTable)
          .set({ enabled, time_updated: Math.max(Date.now(), current.timeUpdated.epochMilliseconds + 1) })
          .where(eq(IssueWatcherTable.id, id))
          .run()
          .pipe(Effect.orDie)
        const watcher = yield* get(id)
        yield* publish(watcher)
        return watcher
      }),
      source: {
        list: Effect.fn("IssueWatcher.source.list")(function* () {
          return yield* Effect.forEach(yield* providers.list(), projectSource)
        }),
        verify: Effect.fn("IssueWatcher.source.verify")(function* (integrationID, input) {
          const adapter = yield* provider(integrationID)
          const savedMode = input.useSavedConnection === true
          if (savedMode === (input.key !== undefined)) {
            return yield* new VerificationModeError({ detail: "Supply either a key or useSavedConnection" })
          }
          if (!savedMode) {
            return yield* adapter
              .verify(Credential.Key.make({ type: "key", key: input.key ?? "", inputs: input.inputs }))
              .pipe(Effect.catch(() => Effect.succeed({ ok: false, detail: "Verification failed" })))
          }
          const saved = (yield* credentials.list(integrationID)).toReversed().find(
            (credential) => credential.connectionID && credential.value.type === "key",
          )
          if (!saved?.connectionID || saved.value.type !== "key") {
            return yield* new ConnectionNotFoundError({ connectionID: Credential.ConnectionID.make("icn_missing") })
          }
          const checkedAt = Date.now()
          const result = yield* adapter.verify(saved.value).pipe(
            Effect.map((value) => ({ result: value, status: "connected" as const })),
            Effect.catch(() =>
              Effect.succeed({ result: { ok: false, detail: "Verification failed" }, status: "needs_auth" as const }),
            ),
          )
          yield* credentials.updateConnectionHealth(saved.connectionID, {
            status: result.status,
            detail: result.result.detail,
            checkedAt,
          }).pipe(Effect.mapError(() => new ConnectionNotFoundError({ connectionID: saved.connectionID! })))
          return result.result
        }),
        create: Effect.fn("IssueWatcher.source.create")(function* (integrationID, input) {
          const adapter = yield* provider(integrationID)
          const tenantIdentity = yield* adapter.tenantIdentity(input.inputs)
          const verified = yield* verifyCredential(
            adapter,
            Credential.Key.make({ type: "key", key: input.key, inputs: input.inputs }),
          )
          const connectionID = Credential.ConnectionID.create()
          yield* credentials.createConnection({
            integrationID,
            connectionID,
            tenantIdentity,
            value: verified.value,
            label: input.label,
          })
          yield* scheduleMetadata(integrationID, connectionID, "initial", []).pipe(
            Effect.ignore,
            Effect.forkIn(serviceScope),
          )
          return yield* projectSource(adapter)
        }),
        rotate: Effect.fn("IssueWatcher.source.rotate")(function* (integrationID, connectionID, input) {
          const adapter = yield* provider(integrationID)
          const saved = yield* connection(connectionID)
          if (saved.integrationID !== integrationID) return yield* new ConnectionNotFoundError({ connectionID })
          if (saved.value.type !== "key") return yield* new ConnectionNotFoundError({ connectionID })
          if ((yield* adapter.tenantIdentity(input.inputs)) !== saved.tenantIdentity) {
            return yield* new TenantConflictError({ connectionID })
          }
          const verified = yield* verifyCredential(
            adapter,
            Credential.Key.make({ type: "key", key: input.key ?? saved.value.key, inputs: input.inputs }),
          )
          yield* credentials
            .rotateConnection(connectionID, { value: verified.value, label: input.label })
            .pipe(Effect.mapError(() => new ConnectionNotFoundError({ connectionID })))
          yield* scheduleMetadata(integrationID, connectionID, "rotation", "cached").pipe(
            Effect.ignore,
            Effect.forkIn(serviceScope),
          )
          return yield* projectSource(adapter)
        }),
        metadata: Effect.fn("IssueWatcher.source.metadata")(function* (integrationID, connectionID, input) {
          const adapter = yield* provider(integrationID)
          yield* ownedConnection(integrationID, connectionID)
          const snapshot = yield* metadataSnapshot(connectionID)
          const now = Date.now()
          const projectKeys = [...new Set(input.issueProjects)]
          const staleGlobal = !snapshot?.global || now - snapshot.global.syncedAt >= MetadataFreshness
          const staleProjects = projectKeys.filter((key) => !snapshot?.projects[key] || now - snapshot.projects[key].syncedAt >= MetadataFreshness)
          if (staleGlobal) {
            yield* requestMetadataScope(connectionID, "global", false)
            yield* runMetadataScope(adapter, connectionID, "global", "stale_read")
          }
          yield* Effect.forEach(staleProjects, (key) => Effect.gen(function* () {
            const scope = `project:${key}`
            yield* requestMetadataScope(connectionID, scope, false)
            yield* runMetadataScope(adapter, connectionID, scope, "project_selection")
          }), { concurrency: 4 })
          yield* Effect.yieldNow
          const view = yield* metadataView(connectionID)
          const finalSnapshot = view.snapshot
          const finalNow = Date.now()
          const finalStaleGlobal = !finalSnapshot?.global || finalNow - finalSnapshot.global.syncedAt >= MetadataFreshness
          const finalStaleProjects = projectKeys.filter((key) =>
            !finalSnapshot?.projects[key] || finalNow - finalSnapshot.projects[key].syncedAt >= MetadataFreshness)
          const projects = projectKeys.length === 0
            ? Object.values(finalSnapshot?.projects ?? {})
            : projectKeys.flatMap((key) => finalSnapshot?.projects[key] ? [finalSnapshot.projects[key]] : [])
          return IssueWatcher.MetadataResult.make({
            metadata: {
              projects: finalSnapshot?.global?.projects ?? [],
              users: uniqueMetadataOptions(projects.flatMap((project) => project.users)),
              labels: finalSnapshot?.global?.labels ?? [],
              statuses: uniqueMetadataOptions([
                ...(finalSnapshot?.global?.statuses ?? []),
                ...projects.flatMap((project) => project.statuses),
              ]),
              components: uniqueMetadataOptions(projects.flatMap((project) => project.components)),
              issueTypes: uniqueMetadataOptions(projects.flatMap((project) => project.issueTypes)),
              fields: finalSnapshot?.global?.fields ?? [],
            },
            ...(finalSnapshot?.global ? { syncedAt: finalSnapshot.global.syncedAt } : {}),
            stale: finalStaleGlobal || finalStaleProjects.length > 0,
            syncing: view.status.syncing,
            refreshingProjectKeys: view.status.refreshingProjectKeys,
            missingProjectKeys: projectKeys.filter((key) => !finalSnapshot?.projects[key]),
            ...(view.status.lastAttemptAt === undefined ? {} : { lastAttemptAt: view.status.lastAttemptAt }),
            ...(view.status.syncError === undefined ? {} : { syncError: view.status.syncError }),
          })
        }),
        syncMetadata: Effect.fn("IssueWatcher.source.syncMetadata")(function* (integrationID, connectionID) {
          yield* scheduleMetadata(integrationID, connectionID, "manual", "cached")
          return yield* metadataStatus(connectionID)
        }),
      },
      summary: inboxSummary,
      run,
      runAll: Effect.fn("IssueWatcher.runAll")(function* () {
        yield* requireOwner()
        const watchers = (yield* listWatchers()).filter((watcher) => watcher.enabled)
        return (yield* Effect.forEach(
          watchers,
          (watcher) => run(watcher.id).pipe(Effect.map((value) => [value]), Effect.catchTag("IssueWatcher.NotFoundError", () => Effect.succeed([]))),
          { concurrency: "unbounded" },
        )).flat()
      }),
      history: Effect.fn("IssueWatcher.history")(function* (id, input) {
        yield* get(id)
        const cursor = yield* decodeCursor(input.cursor)
        const limit = input.limit ?? 50
        const runs = yield* db.select().from(IssueWatcherRunTable).where(and(
          eq(IssueWatcherRunTable.watcher_id, id),
          cursor ? or(
            lt(IssueWatcherRunTable.started_at, cursor.time),
            and(eq(IssueWatcherRunTable.started_at, cursor.time), sql`${IssueWatcherRunTable.id} < ${cursor.id}`),
          ) : undefined,
        )).orderBy(desc(IssueWatcherRunTable.started_at), desc(IssueWatcherRunTable.id)).limit(limit + 1).all().pipe(Effect.orDie)
        const observations = yield* db.select({ observation: IssueMatchObservationTable })
          .from(IssueMatchObservationTable)
          .innerJoin(IssueMatchTable, eq(IssueMatchObservationTable.match_id, IssueMatchTable.id))
          .where(and(
            eq(IssueMatchTable.watcher_id, id),
            cursor ? or(
              lt(IssueMatchObservationTable.time_created, cursor.time),
              and(eq(IssueMatchObservationTable.time_created, cursor.time), sql`${IssueMatchObservationTable.id} < ${cursor.id}`),
            ) : undefined,
          )).orderBy(desc(IssueMatchObservationTable.time_created), desc(IssueMatchObservationTable.id)).limit(limit + 1).all().pipe(Effect.orDie)
        const items = [
          ...runs.map((row) => ({ type: "run" as const, run: storedRun(row), time: row.started_at, id: row.id })),
          ...observations.map((row) => ({ type: "observation" as const, observation: storedObservation(row.observation), time: row.observation.time_created, id: row.observation.id })),
        ].toSorted((left, right) => right.time - left.time || binaryDescending(left.id, right.id))
        const page = items.slice(0, limit)
        const last = page.at(-1)
        return {
          items: page.map(({ time: _, id: __, ...item }) => item),
          ...(items.length > limit && last ? { nextCursor: encodeCursor(last.time, last.id) } : {}),
        }
      }),
      ignores: Effect.fn("IssueWatcher.ignores")(function* (id) {
        yield* get(id)
        return (yield* db.select().from(IssueWatcherIgnoreTable)
          .where(eq(IssueWatcherIgnoreTable.watcher_id, id))
          .orderBy(desc(IssueWatcherIgnoreTable.time_created))
          .limit(ListLimit).all().pipe(Effect.orDie)).map(storedIgnore)
      }),
      inbox: Effect.fn("IssueWatcher.inbox")(function* (input) {
        const cursor = yield* decodeCursor(input.cursor)
        const limit = input.limit ?? 50
        const rows = yield* db.select({ match: IssueMatchTable, watcher: IssueWatcherTable })
          .from(IssueMatchTable)
          .innerJoin(IssueWatcherTable, eq(IssueMatchTable.watcher_id, IssueWatcherTable.id))
          .where(and(
            input.state ? eq(IssueMatchTable.state, input.state) : undefined,
            input.integrationID ? eq(IssueMatchTable.integration_id, input.integrationID) : undefined,
            or(
              sql`${IssueMatchTable.state} <> 'pending'`,
              notExists(db.select({ id: IssueMaterializationTable.id }).from(IssueMaterializationTable)
                .where(eq(IssueMaterializationTable.match_id, IssueMatchTable.id))),
              exists(db.select({ id: IssueMaterializationTable.id }).from(IssueMaterializationTable).where(and(
                eq(IssueMaterializationTable.match_id, IssueMatchTable.id),
                eq(IssueMaterializationTable.state, "failed"),
                eq(IssueMaterializationTable.provider_started, false),
              ))),
            ),
            input.filter === "attention"
              ? or(
                  eq(IssueMatchTable.state, "unrouted"),
                  eq(IssueMatchTable.state, "duplicate"),
                  isNotNull(IssueMatchTable.error),
                )
              : undefined,
            cursor ? or(
              lt(IssueMatchTable.time_created, cursor.time),
              and(eq(IssueMatchTable.time_created, cursor.time), sql`${IssueMatchTable.id} < ${cursor.id}`),
            ) : undefined,
          )).orderBy(desc(IssueMatchTable.time_created), desc(IssueMatchTable.id)).limit(limit + 1).all().pipe(Effect.orDie)
        const projects = yield* projectCatalog.list()
        const adapters = yield* providers.list()
        const page = rows.slice(0, limit)
        const last = page.at(-1)?.match
        return {
          items: yield* Effect.forEach(page, (row) => Effect.gen(function* () {
            const project = projects.find((item) => item.projectID === row.match.project_id)
            const suggestion = !project && projects.length === 1 ? projects[0] : undefined
            const latest = yield* db.select().from(IssueMaterializationTable)
              .where(eq(IssueMaterializationTable.match_id, row.match.id))
              .orderBy(desc(IssueMaterializationTable.time_created), desc(IssueMaterializationTable.id)).get().pipe(Effect.orDie)
            return {
              match: storedMatch(row.match),
              sourceName: adapters.find((adapter) => adapter.integrationID === row.match.integration_id)?.name ?? row.match.integration_id,
              sourceGlyph: row.match.integration_id,
              watcherName: row.watcher.name,
              ...(project ? { project: { id: project.projectID, name: project.name } } : {}),
              ...(suggestion ? { suggestion: { id: suggestion.projectID, name: suggestion.name } } : {}),
              ...(latest ? { materialization: decodeMaterialization({
                id: latest.id,
                matchID: latest.match_id,
                mode: latest.mode,
                projectID: latest.project_id,
                workspace: latest.workspace,
                ...(latest.resolved_location ? { resolvedLocation: latest.resolved_location } : {}),
                ...(latest.workspace_lease ? { workspaceLease: latest.workspace_lease } : {}),
                baselineObservationID: latest.baseline_observation_id,
                state: latest.state,
                sessionID: latest.session_id,
                messageID: latest.message_id,
                ...(latest.execution_attempt_id ? { executionAttemptID: latest.execution_attempt_id } : {}),
                providerStarted: latest.provider_started,
                attempts: latest.attempts,
                ...(latest.error ? { error: latest.error } : {}),
                timeCreated: latest.time_created,
                timeUpdated: latest.time_updated,
              }) } : {}),
            }
          })),
          ...(rows.length > limit && last ? { nextCursor: encodeCursor(last.time_created, last.id) } : {}),
        }
      }),
      settings: {
        get: Effect.fn("IssueWatcher.settings.get")(function* () {
          return Schema.decodeUnknownSync(IssueWatcher.Settings)({ ...(yield* config.getIssueWatcher()), owner: ownerStatus() })
        }),
        update: Effect.fn("IssueWatcher.settings.update")(function* (input) {
          return Schema.decodeUnknownSync(IssueWatcher.Settings)({
            ...(yield* config.updateIssueWatcher(input)),
            owner: ownerStatus(),
          })
        }),
      },
      preview: Effect.fn("IssueWatcher.preview")(function* (input) {
        const adapter = yield* provider(input.integrationID)
        const credential = yield* ownedConnection(input.integrationID, input.connectionID)
        const issues = yield* previewIssues(adapter, credential, input.criteria)
        const projects = yield* projectCatalog.list()
        return {
          matches: issues.slice(0, PreviewLimit).map((issue) => {
            const routed = route(issue, input.routing, projects)
            const project = "projectID" in routed
              ? projects.find((item) => item.projectID === routed.projectID)
              : undefined
            return {
              issue,
              route: routed,
              prompt: renderPrompt(issue, project, input.action.promptTemplate),
              writeback: renderWriteback(issue, input.action),
            }
          }),
          truncated: issues.length > PreviewLimit,
        }
      }),
      matches: materialization,
      approve: (id, input) => materializeResult(id, input),
      routeMatch: Effect.fn("IssueWatcher.routeMatch")(function* (id, input) {
        const match = yield* requireMatch(id)
        yield* projectCatalog.resolve(input.projectID, input.directory).pipe(
          Effect.mapError(() => new ProjectNotFoundError({ id: input.projectID })),
        )
        if (!input.persistMapping) {
          yield* materialization.route(id, input.projectID)
          return
        }
        const watcher = yield* get(match.watcher_id).pipe(
          Effect.mapError(() => new MatchConflictError({ id, detail: "Issue watcher no longer exists" })),
        )
        const key = match.payload.component
          ? { type: "component" as const, value: match.payload.component }
          : match.payload.issueProject
            ? { type: "issueProject" as const, value: match.payload.issueProject }
            : match.payload.labels[0]
              ? { type: "label" as const, value: match.payload.labels[0] }
              : undefined
        if (!key) return yield* new MatchConflictError({ id, detail: "Issue match has no routable mapping value" })
        const mappings = watcher.routing.mappings.some((item) => item.key.type === key.type && item.key.value === key.value)
          ? watcher.routing.mappings.map((item) => item.key.type === key.type && item.key.value === key.value
              ? { ...item, projectID: input.projectID }
              : item)
          : [...watcher.routing.mappings, { key, projectID: input.projectID }]
        yield* db.transaction((tx) => Effect.gen(function* () {
          yield* tx.update(IssueMatchTable).set({ state: "pending", project_id: input.projectID, route_reason: "Manually routed" })
            .where(eq(IssueMatchTable.id, id)).run()
          yield* tx.update(IssueWatcherTable).set({ routing: { ...watcher.routing, mappings } })
            .where(eq(IssueWatcherTable.id, watcher.id)).run()
        })).pipe(Effect.orDie)
        yield* get(watcher.id).pipe(Effect.flatMap(publish), Effect.orDie)
      }),
      skip: Effect.fn("IssueWatcher.skip")(function* (id) {
        const match = yield* requireMatch(id)
        if (match.state === "dismissed") return yield* new MatchConflictError({ id, detail: "Issue match is dismissed" })
        yield* materialization.skip(id)
      }),
      dismiss: Effect.fn("IssueWatcher.dismiss")(function* (id) {
        yield* requireMatch(id)
        yield* materialization.dismiss(id)
      }),
      rematerialize: (id, input) => materializeResult(id, input, true),
      duplicateDetail: Effect.fn("IssueWatcher.duplicateDetail")(function* (id) {
        const match = yield* requireMatch(id)
        if (match.state !== "duplicate") return yield* new MatchConflictError({ id, detail: "Issue match is not a duplicate" })
        const current = yield* db.select().from(IssueMatchObservationTable)
          .where(eq(IssueMatchObservationTable.match_id, id))
          .orderBy(desc(IssueMatchObservationTable.time_created), desc(IssueMatchObservationTable.id)).get().pipe(Effect.orDie)
        const claim = yield* db.select().from(IssueSessionClaimTable).where(and(
          eq(IssueSessionClaimTable.connection_id, match.connection_id),
          eq(IssueSessionClaimTable.external_id, match.external_id),
        )).get().pipe(Effect.orDie)
        const materialized = claim
          ? yield* db.select().from(IssueMaterializationTable).where(eq(IssueMaterializationTable.id, claim.materialization_id)).get().pipe(Effect.orDie)
          : undefined
        const baseline = materialized
          ? yield* db.select().from(IssueMatchObservationTable).where(eq(IssueMatchObservationTable.id, materialized.baseline_observation_id)).get().pipe(Effect.orDie)
          : undefined
        if (!current || !baseline || !materialized) return yield* new MatchConflictError({ id, detail: "Duplicate history is incomplete" })
        const links = yield* db.select().from(IssueMatchSessionTable)
          .where(eq(IssueMatchSessionTable.match_id, materialized.match_id)).all().pipe(Effect.orDie)
        const storedLinks = links.map((row) => decodeLink({
          id: row.id,
          matchID: row.match_id,
          sessionID: row.session_id,
          isPrimary: row.is_primary,
          reason: row.reason,
          ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
          timeCreated: row.time_created,
          timeUpdated: row.time_updated,
        }))
        return IssueWatcher.DuplicateDetail.make({
          match: storedMatch(match),
          baseline: storedObservation(baseline),
          current: storedObservation(current),
          sessions: storedLinks,
          ...(storedLinks.find((link) => link.isPrimary) ? { primary: storedLinks.find((link) => link.isPrimary) } : {}),
          diff: Object.keys(current.payload).flatMap((field) => {
            const before = baseline.payload[field as keyof Issue.Info]
            const after = current.payload[field as keyof Issue.Info]
            return canonicalJson(before as Schema.Json) === canonicalJson(after as Schema.Json)
              ? []
              : [{ field, before: before as Schema.Json, after: after as Schema.Json }]
          }),
        })
      }),
      resolveDuplicate: Effect.fn("IssueWatcher.resolveDuplicate")(function* (id, input) {
        const detail = yield* service.duplicateDetail(id)
        if (input.action === "ignore") {
          yield* materialization.ignore(id, "Duplicate ignored")
          return IssueWatcher.DuplicateResolutionResult.make({ status: "ignored" })
        }
        if (input.action === "continue") {
          if (!detail.primary) return yield* new MatchConflictError({ id, detail: "Duplicate has no primary Session" })
          yield* sessions.get(detail.primary.sessionID).pipe(
            Effect.mapError(() => new MatchConflictError({ id, detail: "Primary Session no longer exists" })),
          )
          const watcher = yield* get(detail.match.watcherID).pipe(
            Effect.mapError(() => new MatchConflictError({ id, detail: "Issue watcher no longer exists" })),
          )
          const project = detail.match.projectID
            ? (yield* projectCatalog.list()).find((item) => item.projectID === detail.match.projectID)
            : undefined
          yield* sessions.prompt({
            id: SessionMessage.ID.make(`msg_${Hash.sha256(`continue\0${id}\0${detail.current.fingerprint}`).slice(0, 28)}`),
            sessionID: detail.primary.sessionID,
            prompt: { text: renderPrompt(detail.current.payload, project, watcher.action.promptTemplate) },
          }).pipe(Effect.mapError(() => new MatchConflictError({ id, detail: "Current issue update conflicts with existing Session input" })))
          yield* db.insert(IssueMatchSessionTable).values({
            id: IssueMatch.SessionLinkID.create(),
            match_id: id,
            session_id: detail.primary.sessionID,
            is_primary: false,
            reason: "continued",
          }).onConflictDoNothing().run().pipe(Effect.orDie)
          return IssueWatcher.DuplicateResolutionResult.make({ status: "continued", sessionID: detail.primary.sessionID })
        }
        const match = yield* requireMatch(id)
        const projectID = input.projectID ?? (match.project_id ? Project.ID.make(match.project_id) : undefined)
        if (!projectID) return yield* new MatchConflictError({ id, detail: "Issue match is not routed" })
        yield* projectCatalog.resolve(projectID).pipe(Effect.mapError(() => new ProjectNotFoundError({ id: projectID })))
        const value = yield* materialization.materialize({
          matchID: id,
          mode: input.mode ?? "awaiting_run",
          projectID,
          ...(input.workspace ? { workspace: input.workspace } : {}),
          secondary: true,
        })
        if (!value) return IssueWatcher.DuplicateResolutionResult.make({ status: "queued", reason: "concurrency_limit" })
        if ("_tag" in value) return yield* new MatchConflictError({ id, detail: "Issue match is duplicate" })
        if (value.state === "failed") return yield* new MatchConflictError({
          id,
          detail: value.error ?? "Issue materialization failed",
        })
        return IssueWatcher.DuplicateResolutionResult.make({
          status: "created",
          materializationID: value.id,
          sessionID: value.sessionID,
        })
      }),
      bulk: Effect.fn("IssueWatcher.bulk")(function* (input) {
        const items = yield* Effect.forEach(input.matchIDs, (id) => Effect.exit(
          input.action === "skip" ? service.skip(id).pipe(Effect.as(undefined))
            : input.action === "dismiss" ? service.dismiss(id).pipe(Effect.as(undefined))
            : materializeResult(id, { mode: input.mode ?? "awaiting_run" }),
        ))
        return IssueWatcher.BulkResult.make({
          items: items.map((exit, index) => Exit.isSuccess(exit)
            ? { status: "succeeded", matchID: input.matchIDs[index]!, ...(exit.value ? { materialization: exit.value } : {}) }
            : { status: "failed", matchID: input.matchIDs[index]!, error: bulkError(exit.cause) }),
        })
      }),
      addIgnore: Effect.fn("IssueWatcher.addIgnore")(function* (id, input) {
        yield* get(id)
        yield* db.insert(IssueWatcherIgnoreTable).values({ watcher_id: id, external_id: input.externalID, reason: input.reason })
          .onConflictDoUpdate({ target: [IssueWatcherIgnoreTable.watcher_id, IssueWatcherIgnoreTable.external_id], set: { reason: input.reason } }).run().pipe(Effect.orDie)
        const row = yield* db.select().from(IssueWatcherIgnoreTable).where(and(
          eq(IssueWatcherIgnoreTable.watcher_id, id),
          eq(IssueWatcherIgnoreTable.external_id, input.externalID),
        )).get().pipe(Effect.orDie)
        if (!row) return yield* Effect.die("Inserted issue watcher ignore was not found")
        return storedIgnore(row)
      }),
      removeIgnore: Effect.fn("IssueWatcher.removeIgnore")(function* (id, externalID) {
        yield* get(id)
        yield* db.delete(IssueWatcherIgnoreTable).where(and(
          eq(IssueWatcherIgnoreTable.watcher_id, id),
          eq(IssueWatcherIgnoreTable.external_id, externalID),
        )).run().pipe(Effect.orDie)
      }),
      provenanceDetail,
      syncProvenance: Effect.fn("IssueWatcher.syncProvenance")(function* (sessionID) {
        const detail = yield* provenanceDetail(sessionID)
        const adapter = yield* provider(detail.provenance.integrationID)
        const credential = yield* ownedConnection(detail.provenance.integrationID, detail.provenance.connectionID)
        const issue = yield* adapter.get(credential, detail.provenance.externalKey)
        const now = Date.now()
        yield* db.transaction((tx) => Effect.gen(function* () {
          if (detail.provenance.matchID) {
            yield* tx.update(IssueMatchTable).set({
              external_key: issue.key,
              external_url: issue.url,
              external_updated_at: issue.updatedAt,
              fingerprint: fingerprint(issue),
              payload: issue,
            }).where(eq(IssueMatchTable.id, detail.provenance.matchID)).run()
          }
          yield* tx.update(SessionProvenanceTable).set({
            external_key: issue.key,
            external_url: issue.url,
            last_synced_at: now,
          }).where(eq(SessionProvenanceTable.session_id, sessionID)).run()
        })).pipe(Effect.orDie)
        yield* writeback.reconcileSession(sessionID)
        return yield* provenanceDetail(sessionID)
      }),
      enqueueFailureComment: Effect.fn("IssueWatcher.enqueueFailureComment")(function* (sessionID) {
        return yield* writeback.enqueueFailureComment(sessionID).pipe(
          Effect.mapError((error) => error._tag === "IssueWatcherWriteback.NotFoundError"
            ? new ProvenanceNotFoundError({ sessionID })
            : new WritebackNotAvailableError({ sessionID, detail: error.detail })),
        )
      }),
    })

    yield* Effect.gen(function* () {
      if (owner.status().status !== "active") return
      yield* materialization.reconcile()
      yield* reconcileAutomatic()
      const lastPoll = yield* Ref.make(0)
      yield* Effect.gen(function* () {
        const now = Date.now()
        const interval = (yield* config.getIssueWatcher()).pollInterval ?? 120
        yield* reconcileAutomatic()
        if (now - (yield* Ref.get(lastPoll)) >= interval * 1000) {
          yield* service.runAll()
          yield* Ref.set(lastPoll, Date.now())
        }
        yield* Effect.sleep("1 second")
      }).pipe(Effect.forever, Effect.ignore, Effect.forkScoped)
      yield* Effect.gen(function* () {
        const now = Date.now()
        const due = yield* db.select({
          connectionID: IssueMetadataSyncTable.connection_id,
          scope: IssueMetadataSyncTable.scope,
          integrationID: CredentialTable.integration_id,
        }).from(IssueMetadataSyncTable).innerJoin(
          CredentialTable,
          eq(IssueMetadataSyncTable.connection_id, CredentialTable.connection_id),
        ).where(and(
          lte(IssueMetadataSyncTable.next_due_at, now),
          or(isNull(IssueMetadataSyncTable.retry_after), lte(IssueMetadataSyncTable.retry_after, now)),
          or(isNull(IssueMetadataSyncTable.lease_until), lte(IssueMetadataSyncTable.lease_until, now)),
        )).all().pipe(Effect.orDie)
        yield* Effect.forEach(due, (item) => Effect.gen(function* () {
          if (!item.integrationID) return
          const adapter = yield* provider(item.integrationID)
          yield* requestMetadataScope(item.connectionID, item.scope, false)
          yield* runMetadataScope(adapter, item.connectionID, item.scope, "scheduled")
        }).pipe(Effect.catch(() => Effect.void)), { concurrency: 4 })
        yield* Effect.sleep(MetadataSchedulerInterval)
      }).pipe(Effect.forever, Effect.ignore, Effect.forkScoped)
    })

    return service
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, GlobalConfig.node, Credential.node, IssueProvider.node, IssueWatcherOwner.node, ProjectRoutingCatalog.node, WorkspaceProvisioner.node, SessionV2.node, IssueWatcherWriteback.node],
})

function uniqueMetadataOptions(options: ReadonlyArray<IssueWatcher.MetadataOption>) {
  return [...new Map(options.map((option) => [option.id, option])).values()].toSorted((left, right) => left.name.localeCompare(right.name))
}
