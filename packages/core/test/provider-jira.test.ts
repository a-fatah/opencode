import { describe, expect, test } from "bun:test"
import { Credential } from "@opencode-ai/schema/credential"
import { Effect, Option } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { makeJira } from "@opencode-ai/core/issue-watcher/provider-jira"
import { IssueProvider } from "@opencode-ai/core/issue-watcher/provider"

const credential = (inputs = { site: " https://Example.ATLASSIAN.net///?ignored=yes#fragment ", email: " user@example.com " }) =>
  Credential.Key.make({ type: "key", key: "api-token", inputs })

const connectionInputs = { site: " https://Example.ATLASSIAN.net///?ignored=yes#fragment ", email: " user@example.com " }

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

describe("Jira issue provider", () => {
  test("normalizes canonical tenant identity and rejects malformed structured inputs", async () => {
    const adapter = makeJira(fakeHttp(() => Response.json({})).client)

    expect(await Effect.runPromise(adapter.tenantIdentity(connectionInputs))).toBe("https://example.atlassian.net")
    expect(await Effect.runPromise(adapter.tenantIdentity({ site: "https://example.atlassian.net/" }))).toBe(
      "https://example.atlassian.net",
    )
    expect(await Effect.runPromise(adapter.tenantIdentity({ site: "ftp://example.test" }).pipe(Effect.flip))).toBeInstanceOf(
      IssueProvider.InvalidInputError,
    )
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
      await Effect.runPromise(adapter.verify(credential({ site: "https://example.test", email: " " })).pipe(Effect.flip)),
    ).toBeInstanceOf(IssueProvider.InvalidInputError)
    expect(await Effect.runPromise(adapter.verify(credential()).pipe(Effect.flip))).toBeInstanceOf(
      IssueProvider.AuthenticationError,
    )
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
      description: JSON.stringify({ type: "doc", version: 1, content: [] }),
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
    const cursor = Buffer.from(JSON.stringify({ updatedAt: Date.parse(timestamp), externalID: "9" })).toString("base64url")
    const http = fakeHttp(() => Response.json({ issues: [jiraIssue("9", timestamp), jiraIssue("10", timestamp)], nextPageToken: "next-2" }))
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
      makeJira(fakeHttp(() => Response.json({ issues: [] })).client).search({ credential: credential(), criteria, cursor }),
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
