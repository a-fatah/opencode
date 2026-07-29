import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { Credential } from "../credential"

export const CredentialTable = sqliteTable(
  "credential",
  {
    id: text().$type<Credential.ID>().primaryKey(),
    integration_id: text().$type<Credential.Info["integrationID"]>(),
    connection_id: text().$type<Credential.ConnectionID>(),
    tenant_identity: text(),
    label: text().notNull(),
    value: text({ mode: "json" }).$type<Credential.Value>().notNull(),
    connector_id: text(),
    method_id: text(),
    active: integer({ mode: "boolean" }),
    ...Timestamps,
  },
  (table) => [uniqueIndex("credential_connection_uidx").on(table.connection_id)],
)
