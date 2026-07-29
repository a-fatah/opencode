import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729181328_issue_connection",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`credential\` ADD \`connection_id\` text;`)
      yield* tx.run(`ALTER TABLE \`credential\` ADD \`tenant_identity\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
