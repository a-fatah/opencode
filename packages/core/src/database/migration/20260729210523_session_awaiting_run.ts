import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729210523_session_awaiting_run",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_execution_attempt\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL,
          \`owner_epoch\` text NOT NULL,
          \`status\` text NOT NULL,
          \`superseded_by_attempt_id\` text,
          \`failure\` text,
          \`interruption\` text,
          \`scheduled_at\` integer NOT NULL,
          \`started_at\` integer,
          \`completed_at\` integer,
          CONSTRAINT \`fk_session_execution_attempt_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`time_updated\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`cancelled_at\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`claimed_attempt_id\` text;`)
      yield* tx.run(
        `CREATE INDEX \`session_execution_attempt_session_status_idx\` ON \`session_execution_attempt\` (\`session_id\`,\`status\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_execution_attempt_message_idx\` ON \`session_execution_attempt\` (\`message_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_input_claimed_attempt_uidx\` ON \`session_input\` (\`claimed_attempt_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
