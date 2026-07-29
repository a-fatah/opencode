export * as IssueWatcher from "./issue-watcher"

import { and, asc, eq, isNull } from "drizzle-orm"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { EventV2 } from "./event"
import { GlobalConfig } from "./global-config"
import { IssueProvider } from "./issue-watcher/provider"
import { IssueWatcherOwner } from "./issue-watcher/owner"
import { IssueWatcherTable } from "./issue-watcher/sql"
import { Credential } from "./credential"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { Repository } from "./repository"
import { ProjectRoutingCatalog } from "./project/routing-catalog"

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

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("IssueWatcher.NotFoundError", {
  id: ID,
}) {}

export class ArchivedError extends Schema.TaggedErrorClass<ArchivedError>()("IssueWatcher.ArchivedError", {
  id: ID,
}) {}

export class OwnerConflictError extends Schema.TaggedErrorClass<OwnerConflictError>()("IssueWatcher.OwnerConflictError", {
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

export type Error = NotFoundError | ArchivedError | OwnerConflictError

export interface Interface {
  readonly status: () => IssueWatcherOwner.Status
  readonly list: () => Effect.Effect<Info[]>
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
  }
  readonly summary: () => Effect.Effect<IssueWatcher.InboxSummary>
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

    const publish = (watcher: Info) => events.publish(Event.Updated, { watcher }).pipe(Effect.asVoid)

    const ownerStatus = () => owner.status()

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

    return Service.of({
      status: owner.status,
      list: Effect.fn("IssueWatcher.list")(function* () {
        return (yield* db
          .select()
          .from(IssueWatcherTable)
          .where(isNull(IssueWatcherTable.archived_at))
          .orderBy(asc(IssueWatcherTable.time_created))
          .all()
          .pipe(Effect.orDie)).map(stored)
      }),
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
          })
          .where(eq(IssueWatcherTable.id, id))
          .run()
          .pipe(Effect.orDie)
        const watcher = yield* get(id)
        yield* publish(watcher)
        return watcher
      }),
      archive: Effect.fn("IssueWatcher.archive")(function* (id) {
        yield* get(id)
        const archivedAt = Date.now()
        yield* db
          .update(IssueWatcherTable)
          .set({ enabled: false, archived_at: archivedAt })
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
          .set({ enabled })
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
      },
      summary: Effect.fn("IssueWatcher.summary")(function* () {
        return Schema.decodeUnknownSync(IssueWatcher.InboxSummary)({
          pending: 0,
          unrouted: 0,
          duplicate: 0,
          failedMaterializations: 0,
          sessionsOpenedThisWeek: 0,
          failedRuns: 0,
        })
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
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, GlobalConfig.node, Credential.node, IssueProvider.node, IssueWatcherOwner.node, ProjectRoutingCatalog.node],
})
