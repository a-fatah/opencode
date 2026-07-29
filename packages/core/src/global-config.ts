export * as GlobalConfig from "./global-config"

import { Context, Effect, Layer, Option, Schema } from "effect"
import { parse } from "jsonc-parser"
import path from "path"
import { Config } from "./config"
import { ConfigIssueWatcher } from "./config/issue-watcher"
import { makeGlobalNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Global } from "./global"

export interface Interface {
  readonly getIssueWatcher: () => Effect.Effect<ConfigIssueWatcher.Info>
  readonly updateIssueWatcher: (input: ConfigIssueWatcher.Info) => Effect.Effect<ConfigIssueWatcher.Info>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/GlobalConfig") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const filename = path.join(global.config, "opencode.json")
    const decode = Schema.decodeUnknownOption(Config.Info, {
      errors: "all",
      onExcessProperty: "ignore",
      propertyOrder: "original",
    })

    const read = Effect.fnUntraced(function* () {
      const content = yield* fs.readFileStringSafe(filename).pipe(Effect.orDie)
      if (!content) return { document: {}, info: new Config.Info({}) }
      const document: unknown = parse(content)
      const info = Option.getOrUndefined(decode(document))
      return { document, info: info ?? new Config.Info({}) }
    })

    return Service.of({
      getIssueWatcher: Effect.fn("GlobalConfig.getIssueWatcher")(function* () {
        return (yield* read()).info.issueWatcher ?? ConfigIssueWatcher.defaults
      }),
      updateIssueWatcher: Effect.fn("GlobalConfig.updateIssueWatcher")(function* (input) {
        const current = yield* read()
        const document =
          typeof current.document === "object" && current.document !== null && !Array.isArray(current.document)
            ? current.document
            : {}
        yield* fs
          .writeWithDirs(filename, `${JSON.stringify({ ...document, issueWatcher: input }, null, 2)}\n`)
          .pipe(Effect.orDie)
        return input
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [FSUtil.node, Global.node] })
