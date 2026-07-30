export * as Credential from "./credential"

import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Credential } from "@opencode-ai/schema/credential"
import { Integration } from "@opencode-ai/schema/integration"
import { optional } from "@opencode-ai/schema"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { CredentialTable } from "./credential/sql"
import { IssueMetadataSnapshotTable, IssueMetadataSyncTable } from "./issue-watcher/sql"

export const ID = Credential.ID
export type ID = Credential.ID
export const ConnectionID = Credential.ConnectionID
export type ConnectionID = Credential.ConnectionID

export const OAuth = Credential.OAuth
export type OAuth = Credential.OAuth

export const Key = Credential.Key
export type Key = Credential.Key

export const Value = Credential.Value
export type Value = Credential.Value

export class Info extends Schema.Class<Info>("Credential.Info")({
  id: ID,
  integrationID: Integration.ID,
  label: Schema.String,
  value: Value,
  connectionID: optional(ConnectionID),
  tenantIdentity: optional(Schema.String),
}) {}

export class ConnectionNotFoundError extends Schema.TaggedErrorClass<ConnectionNotFoundError>()(
  "Credential.ConnectionNotFoundError",
  { connectionID: ConnectionID },
) {}

export interface Interface {
  /** Returns every stored credential. */
  readonly all: () => Effect.Effect<Info[]>
  /** Returns stored credentials belonging to one integration. */
  readonly list: (integrationID: Integration.ID) => Effect.Effect<Info[]>
  /** Returns one stored credential by ID. */
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  readonly getConnection: (connectionID: ConnectionID) => Effect.Effect<Info | undefined>
  /** Replaces any credential for an integration and returns the new record. */
  readonly create: (input: {
    readonly integrationID: Integration.ID
    readonly value: Value
    readonly label?: string
    readonly connectionID?: ConnectionID
    readonly tenantIdentity?: string
  }) => Effect.Effect<Info>
  /** Inserts a stable provider connection without replacing its tenant identity. */
  readonly createConnection: (input: {
    readonly integrationID: Integration.ID
    readonly connectionID: ConnectionID
    readonly tenantIdentity: string
    readonly value: Key
    readonly label?: string
  }) => Effect.Effect<Info>
  /** Rotates credential material while preserving the stable connection. */
  readonly rotateConnection: (
    connectionID: ConnectionID,
    updates: { readonly value: Key; readonly label?: string },
  ) => Effect.Effect<Info, ConnectionNotFoundError>
  /** Updates verification health without rotating unchanged credential material. */
  readonly updateConnectionHealth: (
    connectionID: ConnectionID,
    verification: Credential.Verification,
  ) => Effect.Effect<Info, ConnectionNotFoundError>
  /** Updates the label or secret value of a stored credential. */
  readonly update: (id: ID, updates: Partial<Pick<Info, "label" | "value">>) => Effect.Effect<void>
  /** Removes a stored credential. */
  readonly remove: (id: ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Credential") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decode = Schema.decodeUnknownSync(Value)
    const stored = (row: typeof CredentialTable.$inferSelect) => {
      if (!row.integration_id) return
      return new Info({
        id: row.id,
        integrationID: row.integration_id,
        label: row.label,
        value: decode(row.value),
        ...(row.connection_id ? { connectionID: row.connection_id } : {}),
        ...(row.tenant_identity ? { tenantIdentity: row.tenant_identity } : {}),
      })
    }

    return Service.of({
      all: Effect.fn("Credential.all")(function* () {
        return (yield* db
          .select()
          .from(CredentialTable)
          .orderBy(asc(CredentialTable.time_created))
          .all()
          .pipe(Effect.orDie)).flatMap((row) => {
          const credential = stored(row)
          return credential ? [credential] : []
        })
      }),
      list: Effect.fn("Credential.list")(function* (integrationID) {
        return (yield* db
          .select()
          .from(CredentialTable)
          .where(eq(CredentialTable.integration_id, integrationID))
          .orderBy(asc(CredentialTable.time_created))
          .all()
          .pipe(Effect.orDie)).flatMap((row) => {
          const credential = stored(row)
          return credential ? [credential] : []
        })
      }),
      get: Effect.fn("Credential.get")(function* (id) {
        const row = yield* db.select().from(CredentialTable).where(eq(CredentialTable.id, id)).get().pipe(Effect.orDie)
        return row ? stored(row) : undefined
      }),
      getConnection: Effect.fn("Credential.getConnection")(function* (connectionID) {
        const row = yield* db
          .select()
          .from(CredentialTable)
          .where(eq(CredentialTable.connection_id, connectionID))
          .get()
          .pipe(Effect.orDie)
        return row ? stored(row) : undefined
      }),
      create: Effect.fn("Credential.create")(function* (input) {
        const credential = new Info({
          id: ID.create(),
          integrationID: input.integrationID,
          label: input.label ?? "default",
          value: input.value,
        })
        yield* db
          .transaction((tx) =>
            Effect.gen(function* () {
              yield* tx
                .delete(CredentialTable)
                .where(
                  and(
                    eq(CredentialTable.integration_id, credential.integrationID),
                    isNull(CredentialTable.connection_id),
                  ),
                )
                .run()
              yield* tx
                .insert(CredentialTable)
                .values({
                  id: credential.id,
                  integration_id: credential.integrationID,
                  label: credential.label,
                  value: credential.value,
                  connection_id: credential.connectionID,
                  tenant_identity: credential.tenantIdentity,
                })
                .run()
            }),
          )
          .pipe(Effect.orDie)
        return credential
      }),
      createConnection: Effect.fn("Credential.createConnection")(function* (input) {
        const credential = new Info({
          id: ID.create(),
          integrationID: input.integrationID,
          connectionID: input.connectionID,
          tenantIdentity: input.tenantIdentity,
          label: input.label ?? "default",
          value: input.value,
        })
        const now = Date.now()
        yield* db.transaction((tx) => Effect.gen(function* () {
          yield* tx.insert(CredentialTable).values({
            id: credential.id,
            integration_id: credential.integrationID,
            connection_id: credential.connectionID,
            tenant_identity: credential.tenantIdentity,
            label: credential.label,
            value: credential.value,
          }).run()
          yield* tx.insert(IssueMetadataSnapshotTable).values({
            connection_id: input.connectionID,
            snapshot: { connectionID: input.connectionID, projects: {}, updatedAt: now },
            credential_generation: 0,
            time_created: now,
            time_updated: now,
          }).run()
          yield* tx.insert(IssueMetadataSyncTable).values({
            connection_id: input.connectionID,
            scope: "global",
            requested_generation: 1,
            completed_generation: 0,
            credential_generation: 0,
            next_due_at: now,
            time_created: now,
            time_updated: now,
          }).run()
        }), { behavior: "immediate" }).pipe(Effect.orDie)
        return credential
      }),
      rotateConnection: Effect.fn("Credential.rotateConnection")(function* (connectionID, updates) {
        const found = yield* db.transaction((tx) => Effect.gen(function* () {
          const row = yield* tx.select().from(CredentialTable)
            .where(eq(CredentialTable.connection_id, connectionID)).get()
          if (!row) return false
          const now = Date.now()
          yield* tx.update(CredentialTable).set({ value: updates.value, label: updates.label })
            .where(eq(CredentialTable.connection_id, connectionID)).run()
          yield* tx.insert(IssueMetadataSnapshotTable).values({
            connection_id: connectionID,
            snapshot: { connectionID, projects: {}, updatedAt: now },
            credential_generation: 0,
            time_created: now,
            time_updated: now,
          }).onConflictDoNothing().run()
          yield* tx.insert(IssueMetadataSyncTable).values({
            connection_id: connectionID,
            scope: "global",
            requested_generation: 0,
            completed_generation: 0,
            credential_generation: 0,
            next_due_at: now,
            time_created: now,
            time_updated: now,
          }).onConflictDoNothing().run()
          yield* tx.update(IssueMetadataSnapshotTable).set({
            credential_generation: sql`${IssueMetadataSnapshotTable.credential_generation} + 1`,
            time_updated: now,
          }).where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).run()
          yield* tx.update(IssueMetadataSyncTable).set({
            credential_generation: sql`${IssueMetadataSyncTable.credential_generation} + 1`,
            requested_generation: sql`${IssueMetadataSyncTable.requested_generation} + 1`,
            lease_token: null,
            lease_until: null,
            retry_after: null,
            next_due_at: now,
            time_updated: now,
          }).where(eq(IssueMetadataSyncTable.connection_id, connectionID)).run()
          return true
        }), { behavior: "immediate" }).pipe(Effect.orDie)
        if (!found) return yield* new ConnectionNotFoundError({ connectionID })
        const updated = yield* db
          .select()
          .from(CredentialTable)
          .where(eq(CredentialTable.connection_id, connectionID))
          .get()
          .pipe(Effect.orDie)
        if (!updated) return yield* Effect.die("Rotated credential was not found")
        return stored(updated) ?? (yield* Effect.die("Rotated credential is invalid"))
      }),
      updateConnectionHealth: Effect.fn("Credential.updateConnectionHealth")(function* (connectionID, verification) {
        const updated = yield* db.transaction((tx) => Effect.gen(function* () {
          const row = yield* tx.select().from(CredentialTable)
            .where(eq(CredentialTable.connection_id, connectionID)).get()
          if (!row) return
          const value = decode(row.value)
          if (value.type !== "key") return
          yield* tx.update(CredentialTable).set({
            value: Credential.Key.make({ ...value, verification }),
          }).where(eq(CredentialTable.connection_id, connectionID)).run()
          return yield* tx.select().from(CredentialTable)
            .where(eq(CredentialTable.connection_id, connectionID)).get()
        }), { behavior: "immediate" }).pipe(Effect.orDie)
        if (!updated) return yield* new ConnectionNotFoundError({ connectionID })
        return stored(updated) ?? (yield* Effect.die("Updated credential is invalid"))
      }),
      update: Effect.fn("Credential.update")(function* (id, updates) {
        if (!updates.label && !updates.value) return
        yield* db
          .update(CredentialTable)
          .set({ label: updates.label, value: updates.value })
          .where(eq(CredentialTable.id, id))
          .run()
          .pipe(Effect.orDie)
      }),
      remove: Effect.fn("Credential.remove")(function* (id) {
        yield* db.transaction((tx) => Effect.gen(function* () {
          const credential = yield* tx.select({ connection_id: CredentialTable.connection_id })
            .from(CredentialTable).where(eq(CredentialTable.id, id)).get()
          if (credential?.connection_id) {
            yield* tx.delete(IssueMetadataSnapshotTable)
              .where(eq(IssueMetadataSnapshotTable.connection_id, credential.connection_id)).run()
            yield* tx.delete(IssueMetadataSyncTable)
              .where(eq(IssueMetadataSyncTable.connection_id, credential.connection_id)).run()
          }
          yield* tx.delete(CredentialTable).where(eq(CredentialTable.id, id)).run()
        }), { behavior: "immediate" }).pipe(Effect.orDie)
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
