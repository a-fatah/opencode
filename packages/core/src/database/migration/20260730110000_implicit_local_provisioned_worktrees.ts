import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260730110000_implicit_local_provisioned_worktrees",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        UPDATE session
        SET workspace_id = NULL
        WHERE workspace_id IN (
          SELECT json_extract(lease, '$.location.workspaceID')
          FROM workspace_provisioner_lease
          WHERE json_extract(lease, '$.strategy.type') = 'worktree'
        );
      `)
      yield* tx.run(`
        UPDATE issue_materialization
        SET
          workspace_lease = json_remove(workspace_lease, '$.location.workspaceID'),
          resolved_location = CASE
            WHEN resolved_location IS NULL THEN NULL
            ELSE json_remove(resolved_location, '$.workspaceID')
          END
        WHERE json_extract(workspace_lease, '$.strategy.type') = 'worktree';
      `)
      yield* tx.run(`
        UPDATE workspace_provisioner_lease
        SET lease = json_remove(lease, '$.location.workspaceID')
        WHERE json_extract(lease, '$.strategy.type') = 'worktree';
      `)
    })
  },
} satisfies DatabaseMigration.Migration
