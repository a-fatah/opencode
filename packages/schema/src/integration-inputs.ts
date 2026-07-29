import { Schema } from "effect"

export const IntegrationInputs = Schema.Record(Schema.String, Schema.String).annotate({
  identifier: "Integration.Inputs",
})
export type IntegrationInputs = typeof IntegrationInputs.Type
