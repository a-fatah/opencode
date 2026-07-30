import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730094236_issue_metadata_snapshot",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`issue_metadata_snapshot\` (
          \`connection_id\` text PRIMARY KEY,
          \`snapshot\` text NOT NULL,
          \`credential_generation\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
