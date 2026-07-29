import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729181725_issue_connection_unique",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`CREATE UNIQUE INDEX \`credential_connection_uidx\` ON \`credential\` (\`connection_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
