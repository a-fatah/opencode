import { describe, expect, test } from "bun:test"
import { Credential } from "@opencode-ai/schema/credential"
import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { makeJira } from "@opencode-ai/core/issue-watcher/provider-jira"
import { IssueProvider } from "@opencode-ai/core/issue-watcher/provider"

const credential = (
  inputs = { site: " https://Example.ATLASSIAN.net///?ignored=yes#fragment ", email: " user@example.com " },
) => Credential.Key.make({ type: "key", key: "api-token", inputs })

const connectionInputs = {
  site: " https://Example.ATLASSIAN.net///?ignored=yes#fragment ",
  email: " user@example.com ",
}

const criteria = {
  issueProjects: ["ENG"],
  assignee: "me" as const,
  labels: ["backend"],
  statuses: ["Open"],
  watchUpdates: true,
}

const jiraIssue = (id: string, updated = "2026-07-29T12:34:56.789Z") => ({
  id,
  key: `ENG-${id}`,
  self: `https://example.atlassian.net/rest/api/3/issue/${id}`,
  fields: {
    summary: `Issue ${id}`,
    description: { type: "doc", version: 1, content: [] },
    updated,
    status: { name: "Open" },
    assignee: { accountId: "user-1", displayName: "Ada" },
    labels: ["backend"],
    project: { key: "ENG" },
    components: [{ name: "API" }],
  },
})

const fakeHttp = (respond: (request: HttpClientRequest.HttpClientRequest) => Response) => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  return {
    requests,
    client: HttpClient.make((request) =>
      Effect.sync(() => {
        requests.push(request)
        return HttpClientResponse.fromWeb(request, respond(request))
      }),
    ),
  }
}

const url = (request: HttpClientRequest.HttpClientRequest) =>
  Option.getOrElse(HttpClientRequest.toUrl(request), () => new URL(request.url))

const body = (request: HttpClientRequest.HttpClientRequest) => {
  if (request.body._tag !== "Uint8Array") throw new Error(`Unexpected request body: ${request.body._tag}`)
  return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(new TextDecoder().decode(request.body.body)))
}

const commentOperation = {
  issueKey: "ENG/42",
  text: "Implemented in build 123.",
  operationKey: "comment:run-123",
  marker: "[opencode:comment:run-123]",
}

describe("Jira issue provider", () => {
  test("normalizes canonical tenant identity and rejects malformed structured inputs", async () => {
    const adapter = makeJira(fakeHttp(() => Response.json({})).client)

    expect(await Effect.runPromise(adapter.tenantIdentity(connectionInputs))).toBe("https://example.atlassian.net")
    expect(await Effect.runPromise(adapter.tenantIdentity({ site: "https://example.atlassian.net/" }))).toBe(
      "https://example.atlassian.net",
    )
    expect(
      await Effect.runPromise(adapter.tenantIdentity({ site: "ftp://example.test" }).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.InvalidInputError)
    expect(
      await Effect.runPromise(adapter.tenantIdentity({ site: "https://name:secret@example.test" }).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.InvalidInputError)
  })

  test("verifies with trimmed Basic auth credentials through Effect HttpClient", async () => {
    const http = fakeHttp(() => Response.json({ displayName: "Ada", accountId: "user-1" }))
    const result = await Effect.runPromise(makeJira(http.client).verify(credential()))

    expect(result).toEqual({ ok: true, detail: "Connected as Ada" })
    expect(http.requests).toHaveLength(1)
    expect(url(http.requests[0]!).toString()).toBe("https://example.atlassian.net/rest/api/3/myself")
    expect(http.requests[0]!.headers.authorization).toBe(`Basic ${btoa("user@example.com:api-token")}`)
    expect(http.requests[0]!.headers.accept).toBe("application/json")
  })

  test("returns typed input and authentication errors", async () => {
    const adapter = makeJira(fakeHttp(() => new Response(null, { status: 401 })).client)

    expect(
      await Effect.runPromise(
        adapter.verify(credential({ site: "https://example.test", email: " " })).pipe(Effect.flip),
      ),
    ).toBeInstanceOf(IssueProvider.InvalidInputError)
    expect(await Effect.runPromise(adapter.verify(credential()).pipe(Effect.flip))).toBeInstanceOf(
      IssueProvider.AuthenticationError,
    )
  })

  test("loads Jira metadata with names and images scoped to selected projects", async () => {
    const http = fakeHttp((request) => {
      const requestUrl = url(request)
      if (requestUrl.pathname === "/rest/api/3/project/search")
        return Response.json({
          total: 1,
          values: [
            { id: "100", key: "ENG", name: "Engineering", avatarUrls: { "24x24": "https://example.test/project.png" } },
          ],
        })
      if (requestUrl.pathname === "/rest/api/3/label")
        return Response.json({ values: ["backend", "urgent", "backend"] })
      if (requestUrl.pathname === "/rest/api/3/status")
        return Response.json([
          { id: "status-2", name: "In Review" },
          { id: "status-1", name: "Open" },
        ])
      if (requestUrl.pathname === "/rest/api/3/field")
        return Response.json([
          { id: "summary", name: "Summary", custom: false },
          { id: "customfield_1", name: "Repository", custom: true },
        ])
      if (requestUrl.pathname === "/rest/api/3/user/assignable/multiProjectSearch")
        return Response.json([
          {
            accountId: "user-1",
            displayName: "Ada",
            active: true,
            avatarUrls: { "24x24": "https://example.test/ada.png" },
          },
        ])
      if (requestUrl.pathname === "/rest/api/3/project/ENG/statuses")
        return Response.json([
          {
            id: "type-1",
            name: "Bug",
            iconUrl: "https://example.test/bug.png",
            statuses: [{ id: "status-1", name: "Open" }],
          },
        ])
      if (requestUrl.pathname === "/rest/api/3/project/ENG/components")
        return Response.json([{ id: "component-1", name: "API" }])
      return new Response(null, { status: 404 })
    })
    const adapter = makeJira(http.client)
    const global = await Effect.runPromise(adapter.metadataGlobal(credential()))
    const project = await Effect.runPromise(adapter.metadataProject(credential(), "ENG"))
    const result = { ...global, ...project }

    expect(result).toEqual({
      projects: [{ id: "100", key: "ENG", name: "Engineering", imageUrl: "https://example.test/project.png" }],
      users: [{ id: "user-1", name: "Ada", imageUrl: "https://example.test/ada.png" }],
      labels: ["backend", "urgent"],
      statuses: [{ id: "status-1", name: "Open" }],
      components: [{ id: "component-1", name: "API" }],
      issueTypes: [{ id: "type-1", name: "Bug", imageUrl: "https://example.test/bug.png" }],
      fields: [{ id: "customfield_1", name: "Repository" }],
    })
    expect(global.statuses).toEqual([
      { id: "status-2", name: "In Review" },
      { id: "status-1", name: "Open" },
    ])
    expect(
      http.requests.filter((request) => url(request).pathname === "/rest/api/3/project/ENG/statuses"),
    ).toHaveLength(1)
    expect(
      url(
        http.requests.find((request) => url(request).pathname === "/rest/api/3/user/assignable/multiProjectSearch")!,
      ).searchParams.get("projectKeys"),
    ).toBe("ENG")
  })

  test("loads active Jira users for one project", async () => {
    const http = fakeHttp((request) => {
      const requestUrl = url(request)
      const pathname = requestUrl.pathname
      if (pathname === "/rest/api/3/project/search")
        return Response.json({
          total: 2,
          values: [
            { id: "100", key: "ENG", name: "Engineering" },
            { id: "200", key: "OPS", name: "Operations" },
          ],
        })
      if (pathname === "/rest/api/3/label") return Response.json({ values: [] })
      if (pathname === "/rest/api/3/status") return Response.json([])
      if (pathname === "/rest/api/3/field") return Response.json([])
      if (pathname === "/rest/api/3/user/assignable/multiProjectSearch")
        return requestUrl.searchParams.get("projectKeys") === "ENG"
          ? Response.json([
              { accountId: "active", displayName: "Ada", active: true },
              { accountId: "inactive", displayName: "Grace", active: false },
            ])
          : new Response(null, { status: 400 })
      if (pathname === "/rest/api/3/project/ENG/statuses" || pathname === "/rest/api/3/project/ENG/components")
        return Response.json([])
      return new Response(null, { status: 404 })
    })
    const adapter = makeJira(http.client)
    await Effect.runPromise(adapter.metadataGlobal(credential()))
    const result = await Effect.runPromise(adapter.metadataProject(credential(), "ENG"))

    expect(result.users).toEqual([{ id: "active", name: "Ada" }])
    expect(
      http.requests
        .filter((request) => url(request).pathname === "/rest/api/3/user/assignable/multiProjectSearch")
        .map((request) => url(request).searchParams.get("projectKeys"))
        .sort(),
    ).toEqual(["ENG"])
  })

  test("loads every page of visible Jira projects", async () => {
    const http = fakeHttp((request) => {
      const requestUrl = url(request)
      if (requestUrl.pathname === "/rest/api/3/project/search") {
        const startAt = Number(requestUrl.searchParams.get("startAt"))
        return Response.json({
          total: 51,
          values: [{ id: String(startAt), key: startAt ? "OPS" : "ENG", name: startAt ? "Operations" : "Engineering" }],
        })
      }
      if (requestUrl.pathname === "/rest/api/3/label") return Response.json({ values: [] })
      if (requestUrl.pathname === "/rest/api/3/status") return Response.json([])
      if (requestUrl.pathname === "/rest/api/3/field") return Response.json([])
      if (requestUrl.pathname === "/rest/api/3/user/assignable/multiProjectSearch") return Response.json([])
      return new Response(null, { status: 404 })
    })
    const result = await Effect.runPromise(makeJira(http.client).metadataGlobal(credential()))

    expect(result.projects.map((project) => project.key)).toEqual(["ENG", "OPS"])
    expect(http.requests.filter((request) => url(request).pathname === "/rest/api/3/project/search")).toHaveLength(2)
  })

  test("loads every page of Jira labels", async () => {
    const http = fakeHttp((request) => {
      const requestUrl = url(request)
      if (requestUrl.pathname === "/rest/api/3/project/search") return Response.json({ total: 0, values: [] })
      if (requestUrl.pathname === "/rest/api/3/label") {
        const startAt = Number(requestUrl.searchParams.get("startAt"))
        return Response.json({
          total: 3,
          maxResults: 2,
          isLast: startAt === 2,
          values: startAt === 0 ? ["backend", "frontend"] : ["new-label"],
        })
      }
      if (requestUrl.pathname === "/rest/api/3/status" || requestUrl.pathname === "/rest/api/3/field")
        return Response.json([])
      return new Response(null, { status: 404 })
    })
    const result = await Effect.runPromise(makeJira(http.client).metadataGlobal(credential()))

    expect(result.labels).toEqual(["backend", "frontend", "new-label"])
    expect(http.requests.filter((request) => url(request).pathname === "/rest/api/3/label")).toHaveLength(2)
    expect(
      http.requests
        .filter((request) => url(request).pathname === "/rest/api/3/label")
        .map((request) => url(request).searchParams.get("startAt")),
    ).toEqual(["0", "2"])
  })

  test("gets and normalizes an issue", async () => {
    const response = {
      ...jiraIssue("42"),
      names: {
        customfield_10427: "Repository URL",
        customfield_20891: "Acceptance Criteria",
      },
      fields: {
        ...jiraIssue("42").fields,
        description: {
          type: "doc",
          version: 1,
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Context" }] },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "See " },
                {
                  type: "text",
                  text: "the design",
                  marks: [{ type: "link", attrs: { href: "https://example.test/design" } }],
                },
                { type: "text", text: "." },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Keep the old flow" }] }],
                },
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Add the new flow" }] }],
                },
              ],
            },
          ],
        } as Schema.Json,
        customfield_10427: " https://github.com/example/service ",
        customfield_20891: {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Given a user" }] },
            { type: "paragraph", content: [{ type: "text", text: "Then access is granted" }] },
          ],
        },
      },
    }
    const http = fakeHttp(() => Response.json(response))
    const issue = await Effect.runPromise(makeJira(http.client).get(credential(), "ENG/42"))

    expect(url(http.requests[0]!).pathname).toBe("/rest/api/3/issue/ENG%2F42")
    expect(url(http.requests[0]!).searchParams.get("fields")).toBe("*all")
    expect(url(http.requests[0]!).searchParams.get("expand")).toBe("names")
    expect(issue).toMatchObject({
      id: "42",
      key: "ENG-42",
      title: "Issue 42",
      description:
        "## Context\n\nSee [the design](https://example.test/design).\n\n- Keep the old flow\n- Add the new flow",
      url: "https://example.atlassian.net/browse/ENG-42",
      status: "Open",
      assignee: { id: "user-1", name: "Ada" },
      labels: ["backend"],
      issueProject: "ENG",
      component: "API",
      repoField: "https://github.com/example/service",
      acceptanceCriteria: "Given a user\nThen access is granted",
      updatedAt: Date.parse("2026-07-29T12:34:56.789Z"),
    })
    expect(issue.raw).toEqual(response)
  })

  test("posts Jira comments as ADF with deterministic operation metadata", async () => {
    const http = fakeHttp(() => Response.json({ id: "comment-123" }, { status: 201 }))
    expect(await Effect.runPromise(makeJira(http.client).comment(credential(), commentOperation))).toEqual({
      providerResultID: "comment-123",
    })

    expect(http.requests).toHaveLength(1)
    expect(http.requests[0]!.method).toBe("POST")
    expect(url(http.requests[0]!).pathname).toBe("/rest/api/3/issue/ENG%2F42/comment")
    expect(http.requests[0]!.headers.authorization).toBe(`Basic ${btoa("user@example.com:api-token")}`)
    expect(http.requests[0]!.headers.accept).toBe("application/json")
    expect(http.requests[0]!.headers["content-type"]).toBe("application/json")
    expect(body(http.requests[0]!)).toEqual({
      body: {
        type: "doc",
        version: 1,
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Implemented in build 123." }] },
          { type: "paragraph", content: [{ type: "text", text: "[opencode:comment:run-123]" }] },
        ],
      },
    })
  })

  test("treats an invalid successful comment response as ambiguous", async () => {
    const error = await Effect.runPromise(
      makeJira(fakeHttp(() => new Response(null, { status: 201 })).client)
        .comment(credential(), commentOperation)
        .pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(IssueProvider.AmbiguousRequestError)
  })

  test("reconciles comments by searching all Jira comment pages for the marker", async () => {
    const http = fakeHttp((request) => {
      const startAt = Number(url(request).searchParams.get("startAt"))
      return Response.json({
        startAt,
        maxResults: 100,
        total: 101,
        comments:
          startAt === 0
            ? [{ id: "1", body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [] }] } }]
            : [
                {
                  id: "101",
                  body: {
                    type: "doc",
                    version: 1,
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "[opencode:comment:run-123]" }] },
                    ],
                  },
                },
              ],
      })
    })
    const result = await Effect.runPromise(makeJira(http.client).reconcileComment(credential(), commentOperation))

    expect(result).toEqual({ applied: true, providerResultID: "101" })
    expect(http.requests.map((request) => url(request).searchParams.get("startAt"))).toEqual(["0", "100"])
    expect(http.requests.every((request) => request.method === "GET")).toBe(true)
  })

  test("uses Jira's effective comment page size during reconciliation", async () => {
    const http = fakeHttp((request) => {
      const startAt = Number(url(request).searchParams.get("startAt"))
      return Response.json({
        startAt,
        maxResults: 50,
        total: 51,
        comments: startAt === 0
          ? [{ id: "1", body: {} }]
          : [{ id: "51", body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: commentOperation.marker }] }] } }],
      })
    })
    const result = await Effect.runPromise(makeJira(http.client).reconcileComment(credential(), commentOperation))

    expect(result).toEqual({ applied: true, providerResultID: "51" })
    expect(http.requests.map((request) => url(request).searchParams.get("startAt"))).toEqual(["0", "50"])
  })

  test("reports a comment as unapplied when its marker is absent", async () => {
    const result = await Effect.runPromise(
      makeJira(
        fakeHttp(() => Response.json({ startAt: 0, maxResults: 100, total: 1, comments: [{ id: "1", body: {} }] }))
          .client,
      ).reconcileComment(credential(), commentOperation),
    )

    expect(result).toEqual({ applied: false })
  })

  test("resolves and posts the available Jira transition for the target status", async () => {
    const http = fakeHttp((request) =>
      url(request).searchParams.get("fields") === "status"
        ? Response.json({ fields: { status: { name: "Open" } } })
        : request.method === "GET"
        ? Response.json({
            transitions: [
              { id: "11", name: "Start progress", to: { name: "In Progress" } },
              { id: "31", name: "Complete", to: { name: "Done" } },
            ],
          })
        : new Response(null, { status: 204 }),
    )
    expect(await Effect.runPromise(
      makeJira(http.client).transition(credential(), { issueKey: "ENG/42", targetStatus: "done" }),
    )).toEqual({ providerResultID: "31" })

    expect(http.requests.map((request) => request.method)).toEqual(["GET", "GET", "POST"])
    expect(http.requests.map((request) => url(request).pathname)).toEqual([
      "/rest/api/3/issue/ENG%2F42",
      "/rest/api/3/issue/ENG%2F42/transitions",
      "/rest/api/3/issue/ENG%2F42/transitions",
    ])
    expect(body(http.requests[2]!)).toEqual({ transition: { id: "31" } })
    expect(http.requests[2]!.headers.authorization).toBe(`Basic ${btoa("user@example.com:api-token")}`)
  })

  test("treats unavailable transitions as definitive invalid input", async () => {
    const error = await Effect.runPromise(
      makeJira(fakeHttp((request) => url(request).searchParams.get("fields") === "status"
        ? Response.json({ fields: { status: { name: "Open" } } })
        : Response.json({ transitions: [] })).client)
        .transition(credential(), { issueKey: "ENG-42", targetStatus: "Done" })
        .pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(IssueProvider.InvalidInputError)
  })

  test("reconciles transitions from the current issue status", async () => {
    const http = fakeHttp(() => Response.json({ fields: { status: { name: "DONE" } } }))
    const adapter = makeJira(http.client)

    expect(
      await Effect.runPromise(
        adapter.reconcileTransition(credential(), { issueKey: "ENG/42", targetStatus: "Done" }),
      ),
    ).toEqual({ applied: true })
    expect(url(http.requests[0]!).pathname).toBe("/rest/api/3/issue/ENG%2F42")
    expect(url(http.requests[0]!).searchParams.get("fields")).toBe("status")
  })

  test("distinguishes definitive mutation failures from unknown outcomes", async () => {
    const unauthorized = makeJira(fakeHttp(() => new Response(null, { status: 401 })).client)
    const rejected = makeJira(fakeHttp(() => new Response(null, { status: 400 })).client)
    const unavailable = makeJira(fakeHttp(() => new Response(null, { status: 503 })).client)
    const timedOut = makeJira(fakeHttp(() => new Response(null, { status: 408 })).client)
    const transport = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, description: "connection reset" }),
        }),
      ),
    )

    expect(
      await Effect.runPromise(unauthorized.comment(credential(), commentOperation).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.AuthenticationError)
    expect(await Effect.runPromise(rejected.comment(credential(), commentOperation).pipe(Effect.flip))).toBeInstanceOf(
      IssueProvider.RequestError,
    )
    expect(
      await Effect.runPromise(unavailable.comment(credential(), commentOperation).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.AmbiguousRequestError)
    expect(
      await Effect.runPromise(timedOut.comment(credential(), commentOperation).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.AmbiguousRequestError)
    expect(
      await Effect.runPromise(makeJira(transport).comment(credential(), commentOperation).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.AmbiguousRequestError)
  })

  test("rejects incomplete mutation operations before making requests", async () => {
    const http = fakeHttp(() => Response.json({ id: "comment-123" }, { status: 201 }))
    const adapter = makeJira(http.client)
    const commentError = await Effect.runPromise(
      adapter.comment(credential(), { ...commentOperation, marker: " " }).pipe(Effect.flip),
    )
    const transitionError = await Effect.runPromise(
      adapter.transition(credential(), { issueKey: "ENG-42", targetStatus: " " }).pipe(Effect.flip),
    )

    expect(commentError).toBeInstanceOf(IssueProvider.InvalidInputError)
    expect(transitionError).toBeInstanceOf(IssueProvider.InvalidInputError)
    expect(http.requests).toHaveLength(0)
  })

  test("extracts named custom fields from search metadata without relying on tenant field IDs", async () => {
    const issue = jiraIssue("43")
    const http = fakeHttp(() =>
      Response.json({
        names: {
          customfield_31102: "Repo",
          customfield_48776: "Acceptance-Criterion",
          customfield_99999: "Unrelated field",
        },
        issues: [
          {
            ...issue,
            fields: {
              ...issue.fields,
              customfield_31102: { value: "acme/search-service" },
              customfield_48776: " Search result is visible ",
              customfield_99999: { nested: true },
            },
          },
        ],
      }),
    )
    const result = await Effect.runPromise(makeJira(http.client).search({ credential: credential(), criteria }))

    expect(result.issues[0]).toMatchObject({
      repoField: "acme/search-service",
      acceptanceCriteria: "Search result is visible",
    })
    expect(result.issues[0]!.raw).toMatchObject({
      fields: {
        customfield_31102: { value: "acme/search-service" },
        customfield_48776: " Search result is visible ",
        customfield_99999: { nested: true },
      },
    })
    expect(url(http.requests[0]!).searchParams.get("fields")).toBe("*all")
    expect(url(http.requests[0]!).searchParams.get("expand")).toBe("names")
  })

  test("passes page tokens through and preserves numeric ID ordering at a timestamp boundary", async () => {
    const timestamp = "2026-07-29T12:34:56.789Z"
    const cursor = Buffer.from(JSON.stringify({ updatedAt: Date.parse(timestamp), externalID: "9" })).toString(
      "base64url",
    )
    const http = fakeHttp(() =>
      Response.json({ issues: [jiraIssue("9", timestamp), jiraIssue("10", timestamp)], nextPageToken: "next-2" }),
    )
    const result = await Effect.runPromise(
      makeJira(http.client).search({ credential: credential(), criteria, cursor, page: "page-1" }),
    )

    expect(result.issues.map((issue) => issue.id)).toEqual(["10"])
    expect(result.nextPage).toBe("next-2")
    expect(JSON.parse(Buffer.from(result.cursor, "base64url").toString())).toEqual({
      updatedAt: Date.parse(timestamp),
      externalID: "10",
    })
    expect(url(http.requests[0]!).searchParams.get("nextPageToken")).toBe("page-1")
    expect(url(http.requests[0]!).searchParams.get("jql")).toContain("order by updated ASC, id ASC")
    expect(url(http.requests[0]!).searchParams.get("fields")).toBe("*all")
    expect(url(http.requests[0]!).searchParams.get("expand")).toBe("names")
  })

  test("preserves the starting watermark on an empty page", async () => {
    const cursor = Buffer.from(JSON.stringify({ updatedAt: 42, externalID: "9" })).toString("base64url")
    const result = await Effect.runPromise(
      makeJira(fakeHttp(() => Response.json({ issues: [] })).client).search({
        credential: credential(),
        criteria,
        cursor,
      }),
    )

    expect(result.cursor).toBe(cursor)
  })

  test("rejects invalid cursors and page tokens with typed pagination errors", async () => {
    const adapter = makeJira(fakeHttp(() => Response.json({ issues: [] })).client)
    const invalidCursor = await Effect.runPromise(
      adapter.search({ credential: credential(), criteria, cursor: "not-json" }).pipe(Effect.flip),
    )
    const invalidPage = await Effect.runPromise(
      adapter.search({ credential: credential(), criteria, page: "x".repeat(2049) }).pipe(Effect.flip),
    )
    const invalidTimestamp = Buffer.from(JSON.stringify({ updatedAt: Number.MAX_VALUE, externalID: "1" })).toString(
      "base64url",
    )
    const outOfRangeCursor = await Effect.runPromise(
      adapter.search({ credential: credential(), criteria, cursor: invalidTimestamp }).pipe(Effect.flip),
    )

    expect(invalidCursor).toBeInstanceOf(IssueProvider.PaginationError)
    expect(invalidPage).toBeInstanceOf(IssueProvider.PaginationError)
    expect(outOfRangeCursor).toBeInstanceOf(IssueProvider.PaginationError)
  })
})
