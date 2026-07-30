import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730120529_issue_materialization_prompt",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`issue_materialization\` ADD \`prompt\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
