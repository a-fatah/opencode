import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729211734_workspace_provisioner_safety",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_workspace_provisioner_lease\` (
          \`id\` text PRIMARY KEY,
          \`owner_id\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`branch\` text,
          \`lease\` text NOT NULL,
          \`state\` text NOT NULL,
          \`setup_completed\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_workspace_provisioner_lease\`(\`id\`, \`owner_id\`, \`project_id\`, \`directory\`, \`branch\`, \`lease\`, \`state\`, \`setup_completed\`, \`time_created\`, \`time_updated\`) SELECT \`id\`, \`owner_id\`, \`project_id\`, \`directory\`, \`branch\`, \`lease\`, \`state\`, CASE WHEN \`setup_completed\` = 'running' THEN 'running' WHEN \`setup_completed\` IS NOT NULL THEN 'completed' ELSE NULL END, \`time_created\`, \`time_updated\` FROM \`workspace_provisioner_lease\`;`,
      )
      yield* tx.run(`DROP TABLE \`workspace_provisioner_lease\`;`)
      yield* tx.run(`ALTER TABLE \`__new_workspace_provisioner_lease\` RENAME TO \`workspace_provisioner_lease\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`workspace_provisioner_lease_directory_uidx\` ON \`workspace_provisioner_lease\` (\`directory\`) WHERE "workspace_provisioner_lease"."state" != 'cleaned';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`workspace_provisioner_lease_branch_uidx\` ON \`workspace_provisioner_lease\` (\`project_id\`,\`branch\`) WHERE "workspace_provisioner_lease"."state" != 'cleaned';`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
