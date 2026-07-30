import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730113738_issue_watcher_writeback_snapshot",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_provenance\` ADD \`writeback\` text DEFAULT '{}' NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
