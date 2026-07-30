import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730120204_issue_materialization_action",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `ALTER TABLE \`issue_materialization\` ADD \`action\` text DEFAULT '{"mode":"inbox","promptTemplate":"{{issue.key}} {{issue.title}}","writeback":{"comment":false,"commentOnFailure":false}}' NOT NULL;`,
      )
      yield* tx.run(`
        UPDATE issue_materialization
        SET action = COALESCE((
          SELECT issue_watcher.action
          FROM issue_match
          JOIN issue_watcher ON issue_watcher.id = issue_match.watcher_id
          WHERE issue_match.id = issue_materialization.match_id
        ), action);
      `)
    })
  },
} satisfies DatabaseMigration.Migration
