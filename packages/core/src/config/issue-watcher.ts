export * as ConfigIssueWatcher from "./issue-watcher"

import { Effect, Schema } from "effect"
import { PositiveInt } from "../schema"

export class Info extends Schema.Class<Info>("ConfigIssueWatcher.Info")({
  pollInterval: PositiveInt.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(120))),
  concurrentRuns: PositiveInt.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(3))),
  retryFailedRuns: Schema.Literals(["never", "once"]).pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed("once" as const)),
  ),
}) {}

export const defaults = new Info({ pollInterval: 120, concurrentRuns: 3, retryFailedRuns: "once" })
