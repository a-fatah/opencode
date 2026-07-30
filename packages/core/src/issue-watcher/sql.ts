import { sql } from "drizzle-orm"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Issue } from "@opencode-ai/schema/issue"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Timestamps } from "../database/schema.sql"
import { ProjectTable } from "../project/sql"
import { SessionTable } from "../session/sql"

export const IssueWatcherTable = sqliteTable("issue_watcher", {
  id: text().$type<IssueWatcher.ID>().primaryKey(),
  integration_id: text().notNull(),
  connection_id: text().notNull(),
  name: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  project_id: text().references(() => ProjectTable.id, { onDelete: "cascade" }),
  criteria: text({ mode: "json" }).$type<IssueWatcher.Criteria>().notNull(),
  routing: text({ mode: "json" }).$type<IssueWatcher.Routing>().notNull(),
  action: text({ mode: "json" }).$type<IssueWatcher.Action>().notNull(),
  cursor: text(),
  last_run_at: integer(),
  last_error: text(),
  archived_at: integer(),
  ...Timestamps,
})

export const IssueMetadataSnapshotTable = sqliteTable("issue_metadata_snapshot", {
  connection_id: text().$type<IssueWatcher.ConnectionID>().primaryKey(),
  snapshot: text({ mode: "json" }).$type<IssueWatcher.MetadataSnapshot>().notNull(),
  credential_generation: integer().notNull().default(0),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
})

export const IssueMetadataSyncTable = sqliteTable("issue_metadata_sync", {
  connection_id: text().$type<IssueWatcher.ConnectionID>().notNull(),
  scope: text().notNull(),
  requested_generation: integer().notNull().default(0),
  completed_generation: integer().notNull().default(0),
  credential_generation: integer().notNull().default(0),
  lease_token: text(),
  lease_until: integer(),
  last_attempt_at: integer(),
  last_error: text(),
  retry_after: integer(),
  next_due_at: integer().notNull(),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
}, (table) => [
  primaryKey({ columns: [table.connection_id, table.scope] }),
  index("issue_metadata_sync_due_idx").on(table.next_due_at),
])

export const IssueWatcherRunTable = sqliteTable(
  "issue_watcher_run",
  {
    id: text().$type<IssueWatcher.RunID>().primaryKey(),
    watcher_id: text().$type<IssueWatcher.ID>().notNull().references(() => IssueWatcherTable.id, { onDelete: "cascade" }),
    started_at: integer().notNull(),
    finished_at: integer(),
    outcome: text().$type<IssueWatcher.Run["outcome"]>().notNull(),
    scanned: integer().notNull().default(0),
    matched: integer().notNull().default(0),
    created: integer().notNull().default(0),
    queued: integer().notNull().default(0),
    unrouted: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    cursor: text(),
    error: text(),
  },
  (table) => [index("issue_watcher_run_watcher_started_idx").on(table.watcher_id, table.started_at)],
)

export const IssueMatchTable = sqliteTable(
  "issue_match",
  {
    id: text().$type<IssueMatch.ID>().primaryKey(),
    watcher_id: text().$type<IssueWatcher.ID>().notNull().references(() => IssueWatcherTable.id, { onDelete: "cascade" }),
    integration_id: text().notNull(),
    connection_id: text().notNull(),
    external_id: text().notNull(),
    external_key: text().notNull(),
    external_url: text().notNull(),
    fingerprint: text().notNull(),
    external_updated_at: integer().notNull(),
    state: text().$type<IssueMatch.Info["state"]>().notNull(),
    project_id: text(),
    route_reason: text(),
    payload: text({ mode: "json" }).$type<Issue.Info>().notNull(),
    error: text(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("issue_match_watcher_external_uidx").on(table.watcher_id, table.external_id),
    index("issue_match_state_created_idx").on(table.state, table.time_created),
    index("issue_match_connection_external_idx").on(table.connection_id, table.external_id),
  ],
)

export const IssueMatchObservationTable = sqliteTable(
  "issue_match_observation",
  {
    id: text().$type<IssueMatch.ObservationID>().primaryKey(),
    match_id: text().$type<IssueMatch.ID>().notNull().references(() => IssueMatchTable.id, { onDelete: "cascade" }),
    run_id: text().$type<IssueWatcher.RunID>().notNull().references(() => IssueWatcherRunTable.id, { onDelete: "cascade" }),
    fingerprint: text().notNull(),
    external_updated_at: integer().notNull(),
    payload: text({ mode: "json" }).$type<Issue.Info>().notNull(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("issue_match_observation_match_fingerprint_uidx").on(table.match_id, table.fingerprint),
    index("issue_match_observation_run_created_idx").on(table.run_id, table.time_created),
  ],
)

export const IssueWatcherIgnoreTable = sqliteTable(
  "issue_watcher_ignore",
  {
    watcher_id: text().$type<IssueWatcher.ID>().notNull().references(() => IssueWatcherTable.id, { onDelete: "cascade" }),
    external_id: text().notNull(),
    reason: text(),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.watcher_id, table.external_id] })],
)

export const IssueMatchSessionTable = sqliteTable(
  "issue_match_session",
  {
    id: text().$type<IssueMatch.SessionLinkID>().primaryKey(),
    match_id: text().$type<IssueMatch.ID>().notNull().references(() => IssueMatchTable.id, { onDelete: "cascade" }),
    session_id: text().notNull(),
    is_primary: integer({ mode: "boolean" }).notNull().default(false),
    reason: text().$type<IssueMatch.SessionLink["reason"]>().notNull(),
    deleted_at: integer(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("issue_match_session_match_session_uidx").on(table.match_id, table.session_id),
    uniqueIndex("issue_match_session_primary_uidx").on(table.match_id).where(sql`${table.is_primary} = 1`),
  ],
)

export const IssueSessionClaimTable = sqliteTable(
  "issue_session_claim",
  {
    connection_id: text().notNull(),
    external_id: text().notNull(),
    primary_session_id: text(),
    materialization_id: text().$type<IssueMatch.MaterializationID>().notNull(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.connection_id, table.external_id] }),
    uniqueIndex("issue_session_claim_materialization_uidx").on(table.materialization_id),
  ],
)

export const IssueMaterializationTable = sqliteTable(
  "issue_materialization",
  {
    id: text().$type<IssueMatch.MaterializationID>().primaryKey(),
    match_id: text().$type<IssueMatch.ID>().notNull().references(() => IssueMatchTable.id, { onDelete: "cascade" }),
    mode: text().$type<IssueMatch.Materialization["mode"]>().notNull(),
    project_id: text().notNull(),
    workspace: text({ mode: "json" }).$type<IssueWatcher.Workspace>().notNull(),
    resolved_location: text({ mode: "json" }).$type<NonNullable<IssueMatch.Materialization["resolvedLocation"]>>(),
    workspace_lease: text({ mode: "json" }).$type<NonNullable<IssueMatch.Materialization["workspaceLease"]>>(),
    baseline_observation_id: text().$type<IssueMatch.ObservationID>().notNull().references(() => IssueMatchObservationTable.id),
    state: text().$type<IssueMatch.Materialization["state"]>().notNull(),
    session_id: text().notNull(),
    message_id: text().notNull(),
    execution_attempt_id: text(),
    provider_started: integer({ mode: "boolean" }).notNull().default(false),
    attempts: integer().notNull().default(0),
    error: text(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("issue_materialization_match_message_uidx").on(table.match_id, table.message_id),
    uniqueIndex("issue_materialization_match_active_uidx")
      .on(table.match_id)
      .where(sql`${table.state} not in ('completed', 'failed', 'cancelled')`),
  ],
)

export const SessionProvenanceTable = sqliteTable(
  "session_provenance",
  {
    session_id: text().primaryKey().references(() => SessionTable.id, { onDelete: "cascade" }),
    kind: text().$type<"issue">().notNull(),
    watcher_id: text().$type<IssueWatcher.ID>().references(() => IssueWatcherTable.id, { onDelete: "set null" }),
    match_id: text().$type<IssueMatch.ID>().references(() => IssueMatchTable.id, { onDelete: "set null" }),
    integration_id: text().notNull(),
    connection_id: text().notNull(),
    external_key: text().notNull(),
    external_url: text().notNull(),
    watcher_name: text().notNull(),
    branch: text(),
    last_synced_at: integer(),
    ...Timestamps,
  },
  (table) => [index("session_provenance_connection_key_idx").on(table.connection_id, table.external_key)],
)

export const IssueWritebackOperationTable = sqliteTable(
  "issue_writeback_operation",
  {
    id: text().$type<IssueMatch.WritebackOperationID>().primaryKey(),
    session_id: text().notNull(),
    kind: text().$type<IssueMatch.WritebackOperation["kind"]>().notNull(),
    trigger_id: text().notNull(),
    request: text({ mode: "json" }).$type<IssueMatch.WritebackOperation["request"]>().notNull(),
    state: text().$type<IssueMatch.WritebackOperation["state"]>().notNull(),
    provider_result_id: text(),
    attempts: integer().notNull().default(0),
    error: text(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("issue_writeback_operation_session_kind_trigger_uidx").on(
      table.session_id,
      table.kind,
      table.trigger_id,
    ),
  ],
)
