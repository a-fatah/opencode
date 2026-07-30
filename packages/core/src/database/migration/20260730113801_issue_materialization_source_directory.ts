import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730113801_issue_materialization_source_directory",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`issue_materialization\` ADD \`source_directory\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
