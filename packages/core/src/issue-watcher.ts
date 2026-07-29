export * as IssueWatcher from "./issue-watcher"

import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { Context, Deferred, Effect, Layer, Ref, Result, Schema } from "effect"
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
  IssueWatcherIgnoreTable,
  IssueWatcherRunTable,
  IssueWatcherTable,
} from "./issue-watcher/sql"
import { Credential } from "./credential"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { Repository } from "./repository"
import { ProjectRoutingCatalog } from "./project/routing-catalog"
import { WorkspaceProvisioner } from "./workspace-provisioner"
import { Hash } from "./util/hash"

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

export function renderPrompt(
  issue: Issue.Info,
  project: IssueWatcher.ProjectRoutingSnapshot | undefined,
  template: string,
) {
  const values = {
    "issue.id": issue.id,
    "issue.key": issue.key,
    "issue.title": issue.title,
    "issue.description": issue.description,
    "issue.url": issue.url,
    "issue.status": issue.status,
    "issue.assignee": issue.assignee?.name ?? "",
    "issue.labels": issue.labels.join(", "),
    "issue.issueProject": issue.issueProject,
    "issue.component": issue.component ?? "",
    "issue.acceptanceCriteria": issue.acceptanceCriteria ?? "",
    "issue.repoField": issue.repoField ?? "",
    "project.id": project?.projectID ?? "",
    "project.name": project?.name ?? "",
    "project.directory": project?.directories[0] ?? "",
  }
  return template.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (token, key: keyof typeof values) => values[key] ?? token)
}

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
    ) => Effect.Effect<IssueWatcher.IntegrationSummary, SourceNotFoundError | IssueProvider.Error>
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
    ) => Effect.Effect<IssueWatcher.Metadata, SourceNotFoundError | ConnectionNotFoundError | IssueProvider.Error>
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
    const decode = Schema.decodeUnknownSync(Info)
    const decodeRun = Schema.decodeUnknownSync(IssueWatcher.Run)
    const decodeMatch = Schema.decodeUnknownSync(IssueMatch.Info)
    const decodeObservation = Schema.decodeUnknownSync(IssueMatch.Observation)
    const decodeIgnore = Schema.decodeUnknownSync(IssueWatcher.Ignore)
    const active = new Map<ID, Deferred.Deferred<IssueWatcher.Run, NotFoundError | RunConflictError>>()

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
        ...(watchers.flatMap((watcher) => (watcher.lastRunAt ? [watcher.lastRunAt] : [])).toSorted().at(-1)
          ? { lastPollAt: watchers.flatMap((watcher) => (watcher.lastRunAt ? [watcher.lastRunAt] : [])).toSorted().at(-1) }
          : {}),
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
      const matches = yield* db.select({ state: IssueMatchTable.state }).from(IssueMatchTable).all().pipe(Effect.orDie)
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
        pending: matches.filter((item) => item.state === "pending").length,
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
      const row = yield* db.select().from(IssueWatcherRunTable).where(eq(IssueWatcherRunTable.id, runID)).get().pipe(Effect.orDie)
      if (!row) return yield* Effect.die("Completed issue watcher run was not found")
      const run = storedRun(row)
      const changedRows = yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.watcher_id, watcher.id)).all().pipe(Effect.orDie)
      yield* Effect.forEach(changes.filter((change) => !change.current || change.updatesMatch), (change) => {
        const match = changedRows.find((row) => row.external_id === change.issue.id)
        if (!match) return Effect.void
        return events.publish(change.current ? Event.MatchUpdated : Event.MatchCreated, { match: storedMatch(match) })
      }, { discard: true })
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
          yield* credentials.rotateConnection(saved.connectionID, {
            value: Credential.Key.make({
              ...saved.value,
              verification: { status: result.status, detail: result.result.detail, checkedAt },
            }),
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
          yield* credentials.createConnection({
            integrationID,
            connectionID: Credential.ConnectionID.create(),
            tenantIdentity,
            value: verified.value,
            label: input.label,
          })
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
          return yield* projectSource(adapter)
        }),
        metadata: Effect.fn("IssueWatcher.source.metadata")(function* (integrationID, connectionID, input) {
          const adapter = yield* provider(integrationID)
          return yield* adapter.metadata(yield* ownedConnection(integrationID, connectionID), input)
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
          items: page.map((row) => {
            const project = projects.find((item) => item.projectID === row.match.project_id)
            const suggestion = !project && projects.length === 1 ? projects[0] : undefined
            return {
              match: storedMatch(row.match),
              sourceName: adapters.find((adapter) => adapter.integrationID === row.match.integration_id)?.name ?? row.match.integration_id,
              sourceGlyph: row.match.integration_id,
              watcherName: row.watcher.name,
              ...(project ? { project: { id: project.projectID, name: project.name } } : {}),
              ...(suggestion ? { suggestion: { id: suggestion.projectID, name: suggestion.name } } : {}),
            }
          }),
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
    })

    yield* Effect.gen(function* () {
      if (owner.status().status !== "active") return
      const lastPoll = yield* Ref.make(0)
      yield* Effect.gen(function* () {
        const now = Date.now()
        const interval = (yield* config.getIssueWatcher()).pollInterval ?? 120
        if (now - (yield* Ref.get(lastPoll)) >= interval * 1000) {
          yield* service.runAll()
          yield* Ref.set(lastPoll, Date.now())
        }
        yield* Effect.sleep("1 second")
      }).pipe(Effect.forever, Effect.ignore, Effect.forkScoped)
    })

    return service
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, GlobalConfig.node, Credential.node, IssueProvider.node, IssueWatcherOwner.node, ProjectRoutingCatalog.node, WorkspaceProvisioner.node],
})
