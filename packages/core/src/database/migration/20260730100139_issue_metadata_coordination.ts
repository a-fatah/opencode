import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730100139_issue_metadata_coordination",
  up(tx) {
    return Effect.gen(function* () {
      const now = Date.now()
      yield* tx.run(`
        CREATE TABLE \`issue_metadata_sync\` (
          \`connection_id\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`requested_generation\` integer DEFAULT 0 NOT NULL,
          \`completed_generation\` integer DEFAULT 0 NOT NULL,
          \`credential_generation\` integer DEFAULT 0 NOT NULL,
          \`lease_token\` text,
          \`lease_until\` integer,
          \`last_attempt_at\` integer,
          \`last_error\` text,
          \`retry_after\` integer,
          \`next_due_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`issue_metadata_sync_pk\` PRIMARY KEY(\`connection_id\`, \`scope\`)
        );
      `)
      yield* tx.run(`CREATE INDEX \`issue_metadata_sync_due_idx\` ON \`issue_metadata_sync\` (\`next_due_at\`);`)
      yield* tx.run(`
        INSERT INTO \`issue_metadata_snapshot\`
          (\`connection_id\`, \`snapshot\`, \`credential_generation\`, \`time_created\`, \`time_updated\`)
        SELECT
          \`connection_id\`,
          json_object(
            'connectionID', \`connection_id\`,
            'projects', json_object(),
            'updatedAt', ${now}
          ),
          0,
          ${now},
          ${now}
        FROM \`credential\`
        WHERE \`connection_id\` IS NOT NULL
        ON CONFLICT (\`connection_id\`) DO NOTHING;
      `)
      yield* tx.run(`
        INSERT INTO \`issue_metadata_sync\`
          (\`connection_id\`, \`scope\`, \`requested_generation\`, \`completed_generation\`, \`credential_generation\`, \`next_due_at\`, \`time_created\`, \`time_updated\`)
        SELECT
          \`connection_id\`,
          'global',
          1,
          0,
          0,
          ${now},
          ${now},
          ${now}
        FROM \`credential\`
        WHERE \`connection_id\` IS NOT NULL
        ON CONFLICT (\`connection_id\`, \`scope\`) DO NOTHING;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
