import { sql } from "drizzle-orm"
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { WorkspaceProvisioner } from "@opencode-ai/schema/workspace-provisioner"
import { Timestamps } from "./database/schema.sql"

export const WorkspaceProvisionerTable = sqliteTable(
  "workspace_provisioner_lease",
  {
    id: text().$type<WorkspaceProvisioner.LeaseID>().primaryKey(),
    owner_id: text().notNull(),
    project_id: text().notNull(),
    directory: text().notNull(),
    branch: text(),
    lease: text({ mode: "json" }).$type<WorkspaceProvisioner.Lease>().notNull(),
    state: text().$type<"reserved" | "provisioning" | "ready" | "cleaning" | "cleaned">().notNull(),
    setup_state: text("setup_completed").$type<"pending" | "running" | "completed" | "ambiguous">(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("workspace_provisioner_lease_directory_uidx")
      .on(table.directory)
      .where(sql`${table.state} != 'cleaned'`),
    uniqueIndex("workspace_provisioner_lease_branch_uidx")
      .on(table.project_id, table.branch)
      .where(sql`${table.state} != 'cleaned'`),
  ],
)
