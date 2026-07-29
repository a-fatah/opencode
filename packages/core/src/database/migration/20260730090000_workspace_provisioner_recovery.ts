import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730090000_workspace_provisioner_recovery",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        UPDATE workspace_provisioner_lease
        SET setup_completed = 'ambiguous'
        WHERE setup_completed = 'running';
      `)
    })
  },
} satisfies DatabaseMigration.Migration
