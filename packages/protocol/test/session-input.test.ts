import { describe, expect, test } from "bun:test"
import { HttpApi, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { makeSessionGroup } from "../src/groups/session"

class TestSessionLocation extends HttpApiMiddleware.Service<TestSessionLocation>()("TestSessionLocation") {}

const group = makeSessionGroup(TestSessionLocation)
const spec = OpenApi.fromApi(HttpApi.make("test").add(group))

describe("session input contracts", () => {
  test("orders static routes before colliding dynamic routes", () => {
    expect(Object.values(group.endpoints).map((endpoint) => [endpoint.method, endpoint.path])).toEqual(
      expect.arrayContaining([
        ["GET", "/api/session/:sessionID/input/pending"],
        ["PUT", "/api/session/:sessionID/input/:messageID"],
        ["DELETE", "/api/session/:sessionID/input/:messageID"],
        ["POST", "/api/session/:sessionID/resume/confirm"],
        ["POST", "/api/session/:sessionID/resume"],
      ]),
    )

    const identifiers = Object.keys(group.endpoints)
    expect(identifiers.indexOf("session.input.pending")).toBeLessThan(identifiers.indexOf("session.input.replace"))
    expect(identifiers.indexOf("session.resume.confirm")).toBeLessThan(identifiers.indexOf("session.resume"))
  })

  test("uses canonical input schemas and accepted resume results", () => {
    expect(spec.paths["/api/session/{sessionID}/input/pending"]?.get?.responses["200"]).toBeDefined()
    expect(spec.paths["/api/session/{sessionID}/input/{messageID}"]?.put?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SessionInput.Admitted" } } },
    })
    expect(spec.components.schemas["SessionInput.Pending"]).toBeDefined()
    expect(spec.components.schemas["SessionInput.Admitted"]).toBeDefined()
    expect(spec.components.schemas["SessionInput.ReplaceInput"]).toBeDefined()
    expect(spec.components.schemas["SessionInput.ResumeInput"]).toBeDefined()
    expect(spec.components.schemas["SessionInput.ConfirmHandoffInput"]).toBeDefined()
    expect(spec.paths["/api/session/{sessionID}/resume"]?.post?.responses["202"]).toBeDefined()
    expect(spec.paths["/api/session/{sessionID}/resume/confirm"]?.post?.responses["202"]).toBeDefined()
    expect(spec.components.schemas.SessionInputNotFoundError).toBeDefined()
    expect(spec.components.schemas.SessionInputLifecycleConflictError).toBeDefined()
    expect(spec.components.schemas.SessionInputPendingConflictError).toBeDefined()
    expect(spec.components.schemas.SessionInputAttemptConflictError).toBeDefined()
    expect(spec.components.schemas["SessionInput.NotFoundError"]).toBeUndefined()
    expect(
      [
        group.endpoints["session.input.pending"],
        group.endpoints["session.input.replace"],
        group.endpoints["session.input.cancel"],
        group.endpoints["session.resume.confirm"],
        group.endpoints["session.resume"],
      ].every((endpoint) => endpoint.middlewares.size === 1),
    ).toBeTrue()
  })
})
