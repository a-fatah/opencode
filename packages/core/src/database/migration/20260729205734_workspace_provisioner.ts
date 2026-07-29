import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260729205734_workspace_provisioner",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`workspace_provisioner_lease\` (
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
        `CREATE UNIQUE INDEX \`workspace_provisioner_lease_directory_uidx\` ON \`workspace_provisioner_lease\` (\`directory\`) WHERE "workspace_provisioner_lease"."state" != 'cleaned';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`workspace_provisioner_lease_branch_uidx\` ON \`workspace_provisioner_lease\` (\`project_id\`,\`branch\`) WHERE "workspace_provisioner_lease"."state" != 'cleaned';`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
