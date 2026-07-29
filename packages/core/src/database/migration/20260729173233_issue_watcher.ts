import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729173233_issue_watcher",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`issue_match_observation\` (
          \`id\` text PRIMARY KEY,
          \`match_id\` text NOT NULL,
          \`run_id\` text NOT NULL,
          \`fingerprint\` text NOT NULL,
          \`external_updated_at\` integer NOT NULL,
          \`payload\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_issue_match_observation_match_id_issue_match_id_fk\` FOREIGN KEY (\`match_id\`) REFERENCES \`issue_match\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_issue_match_observation_run_id_issue_watcher_run_id_fk\` FOREIGN KEY (\`run_id\`) REFERENCES \`issue_watcher_run\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_match_session\` (
          \`id\` text PRIMARY KEY,
          \`match_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`is_primary\` integer DEFAULT false NOT NULL,
          \`reason\` text NOT NULL,
          \`deleted_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_issue_match_session_match_id_issue_match_id_fk\` FOREIGN KEY (\`match_id\`) REFERENCES \`issue_match\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_match\` (
          \`id\` text PRIMARY KEY,
          \`watcher_id\` text NOT NULL,
          \`integration_id\` text NOT NULL,
          \`connection_id\` text NOT NULL,
          \`external_id\` text NOT NULL,
          \`external_key\` text NOT NULL,
          \`external_url\` text NOT NULL,
          \`fingerprint\` text NOT NULL,
          \`external_updated_at\` integer NOT NULL,
          \`state\` text NOT NULL,
          \`project_id\` text,
          \`route_reason\` text,
          \`payload\` text NOT NULL,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_issue_match_watcher_id_issue_watcher_id_fk\` FOREIGN KEY (\`watcher_id\`) REFERENCES \`issue_watcher\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_materialization\` (
          \`id\` text PRIMARY KEY,
          \`match_id\` text NOT NULL,
          \`mode\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`workspace\` text NOT NULL,
          \`resolved_location\` text,
          \`workspace_lease\` text,
          \`baseline_observation_id\` text NOT NULL,
          \`state\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL,
          \`execution_attempt_id\` text,
          \`provider_started\` integer DEFAULT false NOT NULL,
          \`attempts\` integer DEFAULT 0 NOT NULL,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_issue_materialization_match_id_issue_match_id_fk\` FOREIGN KEY (\`match_id\`) REFERENCES \`issue_match\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_issue_materialization_baseline_observation_id_issue_match_observation_id_fk\` FOREIGN KEY (\`baseline_observation_id\`) REFERENCES \`issue_match_observation\`(\`id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_session_claim\` (
          \`connection_id\` text NOT NULL,
          \`external_id\` text NOT NULL,
          \`primary_session_id\` text,
          \`materialization_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`issue_session_claim_pk\` PRIMARY KEY(\`connection_id\`, \`external_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_watcher_ignore\` (
          \`watcher_id\` text NOT NULL,
          \`external_id\` text NOT NULL,
          \`reason\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`issue_watcher_ignore_pk\` PRIMARY KEY(\`watcher_id\`, \`external_id\`),
          CONSTRAINT \`fk_issue_watcher_ignore_watcher_id_issue_watcher_id_fk\` FOREIGN KEY (\`watcher_id\`) REFERENCES \`issue_watcher\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_watcher_run\` (
          \`id\` text PRIMARY KEY,
          \`watcher_id\` text NOT NULL,
          \`started_at\` integer NOT NULL,
          \`finished_at\` integer,
          \`outcome\` text NOT NULL,
          \`scanned\` integer DEFAULT 0 NOT NULL,
          \`matched\` integer DEFAULT 0 NOT NULL,
          \`created\` integer DEFAULT 0 NOT NULL,
          \`queued\` integer DEFAULT 0 NOT NULL,
          \`unrouted\` integer DEFAULT 0 NOT NULL,
          \`skipped\` integer DEFAULT 0 NOT NULL,
          \`failed\` integer DEFAULT 0 NOT NULL,
          \`cursor\` text,
          \`error\` text,
          CONSTRAINT \`fk_issue_watcher_run_watcher_id_issue_watcher_id_fk\` FOREIGN KEY (\`watcher_id\`) REFERENCES \`issue_watcher\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_watcher\` (
          \`id\` text PRIMARY KEY,
          \`integration_id\` text NOT NULL,
          \`connection_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`enabled\` integer DEFAULT true NOT NULL,
          \`project_id\` text,
          \`criteria\` text NOT NULL,
          \`routing\` text NOT NULL,
          \`action\` text NOT NULL,
          \`cursor\` text,
          \`last_run_at\` integer,
          \`last_error\` text,
          \`archived_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_issue_watcher_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`issue_writeback_operation\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`trigger_id\` text NOT NULL,
          \`request\` text NOT NULL,
          \`state\` text NOT NULL,
          \`provider_result_id\` text,
          \`attempts\` integer DEFAULT 0 NOT NULL,
          \`error\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_provenance\` (
          \`session_id\` text PRIMARY KEY,
          \`kind\` text NOT NULL,
          \`watcher_id\` text,
          \`match_id\` text,
          \`integration_id\` text NOT NULL,
          \`connection_id\` text NOT NULL,
          \`external_key\` text NOT NULL,
          \`external_url\` text NOT NULL,
          \`watcher_name\` text NOT NULL,
          \`branch\` text,
          \`last_synced_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_provenance_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_provenance_watcher_id_issue_watcher_id_fk\` FOREIGN KEY (\`watcher_id\`) REFERENCES \`issue_watcher\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_session_provenance_match_id_issue_match_id_fk\` FOREIGN KEY (\`match_id\`) REFERENCES \`issue_match\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_match_observation_match_fingerprint_uidx\` ON \`issue_match_observation\` (\`match_id\`,\`fingerprint\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`issue_match_observation_run_created_idx\` ON \`issue_match_observation\` (\`run_id\`,\`time_created\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_match_session_match_session_uidx\` ON \`issue_match_session\` (\`match_id\`,\`session_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_match_session_primary_uidx\` ON \`issue_match_session\` (\`match_id\`) WHERE "issue_match_session"."is_primary" = 1;`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_match_watcher_external_uidx\` ON \`issue_match\` (\`watcher_id\`,\`external_id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`issue_match_state_created_idx\` ON \`issue_match\` (\`state\`,\`time_created\`);`)
      yield* tx.run(
        `CREATE INDEX \`issue_match_connection_external_idx\` ON \`issue_match\` (\`connection_id\`,\`external_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_materialization_match_message_uidx\` ON \`issue_materialization\` (\`match_id\`,\`message_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_materialization_match_active_uidx\` ON \`issue_materialization\` (\`match_id\`) WHERE "issue_materialization"."state" not in ('completed', 'failed', 'cancelled');`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_session_claim_materialization_uidx\` ON \`issue_session_claim\` (\`materialization_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`issue_watcher_run_watcher_started_idx\` ON \`issue_watcher_run\` (\`watcher_id\`,\`started_at\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`issue_writeback_operation_session_kind_trigger_uidx\` ON \`issue_writeback_operation\` (\`session_id\`,\`kind\`,\`trigger_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_provenance_connection_key_idx\` ON \`session_provenance\` (\`connection_id\`,\`external_key\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
