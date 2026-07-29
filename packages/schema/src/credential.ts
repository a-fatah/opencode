export * as Credential from "./credential"

import { Effect, Schema } from "effect"
import { optional } from "./schema"
import { IntegrationMethodID } from "./integration-id"
import { IntegrationInputs } from "./integration-inputs"
import { ascending } from "./identifier"
import { NonNegativeInt, statics } from "./schema"

export const ID = Schema.String.pipe(
  Schema.brand("Credential.ID"),
  statics((schema) => ({ create: () => schema.make("cred_" + ascending()) })),
)
export type ID = typeof ID.Type

export const ConnectionID = Schema.String.check(Schema.isStartsWith("icn_")).pipe(
  Schema.brand("Credential.ConnectionID"),
  statics((schema) => ({ create: () => schema.make("icn_" + ascending()) })),
)
export type ConnectionID = typeof ConnectionID.Type

export interface Verification extends Schema.Schema.Type<typeof Verification> {}
export const Verification = Schema.Struct({
  status: Schema.Literals(["connected", "needs_auth", "not_connected"]),
  detail: Schema.String,
  checkedAt: NonNegativeInt,
}).annotate({ identifier: "Credential.Verification" })

export interface OAuth extends Schema.Schema.Type<typeof OAuth> {}
export const OAuth = Schema.Struct({
  type: Schema.Literal("oauth"),
  methodID: IntegrationMethodID,
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({ identifier: "Credential.OAuth" })

export interface Key extends Schema.Schema.Type<typeof Key> {}
export const Key = Schema.Struct({
  type: Schema.Literal("key"),
  key: Schema.String,
  inputs: IntegrationInputs.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed({})),
    Schema.withConstructorDefault(Effect.succeed({})),
  ),
  verification: optional(Verification),
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({ identifier: "Credential.Key" })

export const Value = Schema.Union([OAuth, Key])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Credential.Value" })
export type Value = Schema.Schema.Type<typeof Value>
