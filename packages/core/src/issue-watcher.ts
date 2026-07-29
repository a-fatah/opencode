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

export const ID = IssueWatcher.ID
export type ID = IssueWatcher.ID
export const Info = IssueWatcher.Info
export type Info = IssueWatcher.Info
export const CreateInput = IssueWatcher.CreateInput
export type CreateInput = IssueWatcher.CreateInput
export const UpdateInput = IssueWatcher.UpdateInput
export type UpdateInput = IssueWatcher.UpdateInput
export const Event = IssueWatcher.Event

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("IssueWatcher.NotFoundError", {
  id: ID,
}) {}

export class ArchivedError extends Schema.TaggedErrorClass<ArchivedError>()("IssueWatcher.ArchivedError", {
  id: ID,
}) {}

export class OwnerConflictError extends Schema.TaggedErrorClass<OwnerConflictError>()("IssueWatcher.OwnerConflictError", {
  detail: Schema.String,
}) {}

export type Error = NotFoundError | ArchivedError | OwnerConflictError

export interface Interface {
  readonly status: () => IssueWatcherOwner.Status
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: ID) => Effect.Effect<Info, NotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<Info, OwnerConflictError>
  readonly update: (id: ID, input: UpdateInput) => Effect.Effect<Info, NotFoundError | ArchivedError>
  readonly archive: (id: ID) => Effect.Effect<void, NotFoundError>
  readonly enable: (id: ID, enabled: boolean) => Effect.Effect<Info, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/IssueWatcher") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const owner = yield* IssueWatcherOwner.Service
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
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, GlobalConfig.node, IssueProvider.node, IssueWatcherOwner.node],
})
