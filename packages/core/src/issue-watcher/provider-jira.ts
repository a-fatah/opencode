import { Credential } from "@opencode-ai/schema/credential"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { IssueProvider } from "./provider"

const JiraUser = Schema.Struct({ displayName: Schema.String, accountId: Schema.String })
const JiraNames = Schema.Record(Schema.String, Schema.String)
const JiraFields = Schema.StructWithRest(
  Schema.Struct({
    summary: Schema.String,
    description: Schema.NullOr(Schema.Json),
    updated: Schema.String,
    status: Schema.Struct({ name: Schema.String }),
    assignee: Schema.NullOr(JiraUser),
    labels: Schema.Array(Schema.String),
    project: Schema.Struct({ key: Schema.String }),
    components: Schema.Array(Schema.Struct({ name: Schema.String })),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)
const JiraIssue = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.String,
    key: Schema.String,
    self: Schema.String,
    fields: JiraFields,
    names: Schema.optional(JiraNames),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
)
const JiraSearch = Schema.Struct({
  issues: Schema.Array(JiraIssue),
  names: Schema.optional(JiraNames),
  nextPageToken: Schema.optional(Schema.String),
})
const JiraAvatarUrls = Schema.Struct({ "24x24": Schema.optional(Schema.String) })
const JiraProject = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  avatarUrls: Schema.optional(JiraAvatarUrls),
})
const JiraProjects = Schema.Struct({
  values: Schema.Array(JiraProject),
  total: Schema.Number,
  isLast: Schema.optional(Schema.Boolean),
})
const JiraMetadataUser = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
  active: Schema.optional(Schema.Boolean),
  avatarUrls: Schema.optional(JiraAvatarUrls),
})
const JiraLabels = Schema.Struct({ values: Schema.Array(Schema.String) })
const JiraStatus = Schema.Struct({ id: Schema.String, name: Schema.String })
const JiraIssueTypeStatuses = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  iconUrl: Schema.optional(Schema.String),
  statuses: Schema.Array(JiraStatus),
})
const JiraComponent = Schema.Struct({ id: Schema.String, name: Schema.String })
const JiraField = Schema.Struct({ id: Schema.String, name: Schema.String, custom: Schema.Boolean })
const Cursor = Schema.Struct({ updatedAt: Schema.Finite, externalID: Schema.String })

export function makeJira(http: HttpClient.HttpClient): IssueProvider.Adapter {
  const integrationID = Integration.ID.make("jira")

  const site = (inputs: Integration.Inputs) =>
    Effect.try({
      try: () => {
        const input = inputs.site?.trim()
        if (!input) throw new Error("Jira site URL is required")
        const url = new URL(input)
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Jira site URL must use HTTP(S)")
        if (url.username || url.password) throw new Error("Jira site URL must not include credentials")
        url.hash = ""
        url.search = ""
        url.pathname = url.pathname.replace(/\/+$/, "")
        return url.toString().replace(/\/$/, "")
      },
      catch: (error) =>
        new IssueProvider.InvalidInputError({
          detail: error instanceof Error ? error.message : "Invalid Jira site URL",
        }),
    })

  const execute = <S extends Schema.Top>(credential: Credential.Key, path: string, schema: S) =>
    Effect.gen(function* () {
      const inputs = credential.inputs ?? {}
      const email = inputs.email?.trim()
      if (!email) return yield* new IssueProvider.InvalidInputError({ detail: "Jira email is required" })
      const base = yield* site(inputs)
      const response = yield* http
        .execute(
          HttpClientRequest.get(`${base}${path}`).pipe(
            HttpClientRequest.acceptJson,
            HttpClientRequest.basicAuth(email, credential.key),
          ),
        )
        .pipe(Effect.mapError(() => new IssueProvider.RequestError({ detail: "Jira request failed" })))
      if (response.status === 401 || response.status === 403) {
        return yield* new IssueProvider.AuthenticationError({ detail: "Jira rejected the email or API token" })
      }
      if (response.status < 200 || response.status >= 300) {
        return yield* new IssueProvider.RequestError({ detail: `Jira returned HTTP ${response.status}` })
      }
      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(() => new IssueProvider.RequestError({ detail: "Jira returned an invalid response" })),
      )
    })

  const normalize = (base: string, issue: typeof JiraIssue.Type, names = issue.names ?? {}) =>
    Schema.decodeUnknownSync(Issue.Info)({
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      description:
        typeof issue.fields.description === "string"
          ? issue.fields.description
          : issue.fields.description
            ? JSON.stringify(issue.fields.description)
            : "",
      url: `${base}/browse/${encodeURIComponent(issue.key)}`,
      status: issue.fields.status.name,
      ...(issue.fields.assignee
        ? { assignee: { id: issue.fields.assignee.accountId, name: issue.fields.assignee.displayName } }
        : {}),
      labels: issue.fields.labels,
      issueProject: issue.fields.project.key,
      ...(issue.fields.components[0] ? { component: issue.fields.components[0].name } : {}),
      ...optionalField("repoField", issue.fields, names, repositoryNames),
      ...optionalField("acceptanceCriteria", issue.fields, names, acceptanceCriteriaNames),
      updatedAt: Date.parse(issue.fields.updated),
      raw: issue,
    })

  const projects = Effect.fn("Jira.projects")(function* (credential: Credential.Key) {
    const first = yield* execute(credential, "/rest/api/3/project/search?startAt=0&maxResults=50", JiraProjects)
    const offsets = Array.from({ length: Math.ceil(first.total / 50) - 1 }, (_, index) => (index + 1) * 50)
    const remaining = yield* Effect.forEach(
      offsets,
      (startAt) => execute(credential, `/rest/api/3/project/search?startAt=${startAt}&maxResults=50`, JiraProjects),
      { concurrency: 4 },
    )
    return [
      ...new Map([first, ...remaining].flatMap((page) => page.values).map((project) => [project.id, project])).values(),
    ].toSorted((left, right) => left.name.localeCompare(right.name))
  })

  return {
    integrationID,
    name: "Jira",
    method: {
      type: "key",
      label: "API token",
      prompts: [
        { type: "text", key: "site", message: "Jira site URL", placeholder: "https://company.atlassian.net" },
        { type: "text", key: "email", message: "Jira account email" },
      ],
    },
    tenantIdentity: site,
    verify: Effect.fn("Jira.verify")(function* (credential) {
      const user = yield* execute(credential, "/rest/api/3/myself", JiraUser)
      return { ok: true, detail: `Connected as ${user.displayName}` }
    }),
    metadataGlobal: Effect.fn("Jira.metadataGlobal")(function* (credential) {
      const [jiraProjects, labels, fields] = yield* Effect.all(
        [
          projects(credential),
          execute(credential, "/rest/api/3/label?maxResults=1000", JiraLabels),
          execute(credential, "/rest/api/3/field", Schema.Array(JiraField)),
        ],
        { concurrency: "unbounded" },
      )
      return Schema.decodeUnknownSync(IssueWatcher.MetadataGlobal)({
        projects: jiraProjects.map((project) => ({
          id: project.id,
          key: project.key,
          name: project.name,
          ...(project.avatarUrls?.["24x24"] ? { imageUrl: project.avatarUrls["24x24"] } : {}),
        })),
        labels: [...new Set(labels.values)].sort((a, b) => a.localeCompare(b)),
        fields: uniqueOptions(
          fields.filter((field) => field.custom).map((field) => ({ id: field.id, name: field.name })),
        ),
      })
    }),
    metadataProject: Effect.fn("Jira.metadataProject")(function* (credential, projectKey) {
      const encoded = encodeURIComponent(projectKey)
      const [users, issueTypes, components] = yield* Effect.all(
        [
          execute(
            credential,
            `/rest/api/3/user/assignable/multiProjectSearch?${new URLSearchParams({ projectKeys: projectKey, maxResults: "1000" })}`,
            Schema.Array(JiraMetadataUser),
          ),
          execute(credential, `/rest/api/3/project/${encoded}/statuses`, Schema.Array(JiraIssueTypeStatuses)),
          execute(credential, `/rest/api/3/project/${encoded}/components`, Schema.Array(JiraComponent)),
        ],
        { concurrency: "unbounded" },
      )
      return Schema.decodeUnknownSync(IssueWatcher.MetadataProjectScope)({
        users: uniqueOptions(
          users
            .filter((user) => user.active !== false)
            .map((user) => ({
              id: user.accountId,
              name: user.displayName,
              ...(user.avatarUrls?.["24x24"] ? { imageUrl: user.avatarUrls["24x24"] } : {}),
            })),
        ),
        statuses: uniqueOptions(
          issueTypes.flatMap((issueType) => issueType.statuses.map((status) => ({ id: status.id, name: status.name }))),
        ),
        components: uniqueOptions(components.map((component) => ({ id: component.id, name: component.name }))),
        issueTypes: uniqueOptions(
          issueTypes.map((issueType) => ({
            id: issueType.id,
            name: issueType.name,
            ...(issueType.iconUrl ? { imageUrl: issueType.iconUrl } : {}),
          })),
        ),
      })
    }),
    search: Effect.fn("Jira.search")(function* (input) {
      const base = yield* site(input.credential.inputs ?? {})
      const encodedCursor = input.cursor
      const cursor = encodedCursor
        ? yield* Effect.try({
            try: () => {
              const cursor = Schema.decodeUnknownSync(Cursor)(
                JSON.parse(Buffer.from(encodedCursor, "base64url").toString()),
              )
              if (Number.isNaN(new Date(cursor.updatedAt).getTime())) throw new Error("Invalid Jira cursor timestamp")
              return cursor
            },
            catch: () => new IssueProvider.PaginationError({ detail: "Invalid Jira cursor" }),
          })
        : undefined
      if (input.page && input.page.length > 2048) {
        return yield* new IssueProvider.PaginationError({ detail: "Invalid Jira page token" })
      }
      const clauses = [
        input.criteria.issueProjects.length
          ? `project in (${input.criteria.issueProjects.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`
          : undefined,
        input.criteria.assignee === "me"
          ? "assignee = currentUser()"
          : input.criteria.assignee
            ? `assignee = "${input.criteria.assignee.id.replaceAll('"', '\\"')}"`
            : undefined,
        input.criteria.labels?.length
          ? `labels in (${input.criteria.labels.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`
          : undefined,
        input.criteria.statuses?.length
          ? `status in (${input.criteria.statuses.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`
          : undefined,
        cursor ? `updated >= "${new Date(cursor.updatedAt).toISOString()}"` : undefined,
      ].filter((value): value is string => value !== undefined)
      const jql =
        input.criteria.escape?.language === "jql"
          ? [
              input.criteria.escape.query,
              cursor ? `updated >= "${new Date(cursor.updatedAt).toISOString()}"` : undefined,
            ]
              .filter((value): value is string => value !== undefined)
              .join(" AND ")
          : clauses.join(" AND ")
      const query = new URLSearchParams({
        jql: `${jql}${jql ? " order by updated ASC, id ASC" : "order by updated ASC, id ASC"}`,
        maxResults: "100",
        fields: "*all",
        expand: "names",
        ...(input.page ? { nextPageToken: input.page } : {}),
      })
      const result = yield* execute(input.credential, `/rest/api/3/search/jql?${query}`, JiraSearch)
      const issues = result.issues
        .map((issue) => normalize(base, issue, result.names))
        .filter(
          (issue) =>
            !cursor ||
            issue.updatedAt > cursor.updatedAt ||
            (issue.updatedAt === cursor.updatedAt && compareExternalID(issue.id, cursor.externalID) > 0),
        )
      const latest = issues.at(-1)
      return {
        issues,
        ...(result.nextPageToken ? { nextPage: result.nextPageToken } : {}),
        cursor: latest
          ? Buffer.from(JSON.stringify({ updatedAt: latest.updatedAt, externalID: latest.id })).toString("base64url")
          : (input.cursor ?? Buffer.from(JSON.stringify({ updatedAt: 0, externalID: "" })).toString("base64url")),
      }
    }),
    get: Effect.fn("Jira.get")(function* (credential, key) {
      return normalize(
        yield* site(credential.inputs ?? {}),
        yield* execute(credential, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=*all&expand=names`, JiraIssue),
      )
    }),
    comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
    transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
  }
}

function uniqueOptions<T extends { readonly id: string; readonly name: string }>(options: ReadonlyArray<T>) {
  return [...new Map(options.map((option) => [option.id, option])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

const repositoryNames = new Set(["repository", "repo", "repositoryurl", "repourl"])
const acceptanceCriteriaNames = new Set(["acceptancecriteria", "acceptancecriterion"])

function optionalField<K extends "repoField" | "acceptanceCriteria">(
  key: K,
  fields: typeof JiraFields.Type,
  names: typeof JiraNames.Type,
  acceptedNames: ReadonlySet<string>,
) {
  const value = Object.entries(names)
    .filter(([, name]) => acceptedNames.has(name.toLowerCase().replaceAll(/[^a-z0-9]/g, "")))
    .map(([fieldID]) => jiraFieldText(fields[fieldID]))
    .find((value): value is string => value !== undefined)
  return value ? { [key]: value } : {}
}

function jiraFieldText(value: Schema.Json | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined
  if (value === null || typeof value !== "object") return undefined
  if (isJsonArray(value)) {
    const text = value
      .map(jiraFieldText)
      .filter((value): value is string => value !== undefined)
      .join("\n")
      .trim()
    return text || undefined
  }
  if (typeof value.text === "string") return value.text.trim() || undefined
  if (typeof value.value === "string") return value.value.trim() || undefined
  if (value.type === "hardBreak") return "\n"
  if (!Array.isArray(value.content)) return undefined
  const separator = value.type === "paragraph" || value.type === "heading" ? "" : "\n"
  const text = value.content
    .map(jiraFieldText)
    .filter((value): value is string => value !== undefined)
    .join(separator)
    .trim()
  return text || undefined
}

function isJsonArray(value: Schema.Json): value is ReadonlyArray<Schema.Json> {
  return Array.isArray(value)
}

function compareExternalID(left: string, right: string) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const normalizedLeft = left.replace(/^0+(?=\d)/, "")
    const normalizedRight = right.replace(/^0+(?=\d)/, "")
    return normalizedLeft.length - normalizedRight.length || normalizedLeft.localeCompare(normalizedRight)
  }
  return left.localeCompare(right)
}
