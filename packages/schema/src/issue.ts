export * as Issue from "./issue"

import { Schema } from "effect"
import { optional } from "./schema"

export interface Person extends Schema.Schema.Type<typeof Person> {}
export const Person = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
}).annotate({ identifier: "Issue.Person" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  title: Schema.String,
  description: Schema.String,
  url: Schema.String,
  status: Schema.String,
  assignee: optional(Person),
  labels: Schema.Array(Schema.String),
  issueProject: Schema.String,
  component: optional(Schema.String),
  acceptanceCriteria: optional(Schema.String),
  repoField: optional(Schema.String),
  updatedAt: Schema.Finite,
  raw: Schema.Json,
}).annotate({ identifier: "Issue.Info" })
