import { describe, expect, test } from "bun:test"
import { ServerConnection } from "./server"
import { currentRoute } from "./layout-route"
import { serverHref } from "@/utils/session-route"

const server = ServerConnection.Key.make("local\nhttp://localhost:4096")

describe("utility routes", () => {
  test("recognizes inbox and watcher routes with their server", () => {
    expect(currentRoute(serverHref(server, "inbox"), "")).toEqual({ type: "inbox", server })
    expect(currentRoute(serverHref(server, "watchers"), "")).toEqual({ type: "watchers", server })
    expect(currentRoute(serverHref(server, "watchers/new%20rule"), "")).toEqual({
      type: "watcher",
      server,
      watcherID: "new rule",
    })
  })

  test("does not recognize extra utility route segments", () => {
    expect(currentRoute(serverHref(server, "inbox/extra"), "")).toEqual({ type: "home" })
    expect(currentRoute(serverHref(server, "watchers/id/extra"), "")).toEqual({ type: "home" })
  })
})
