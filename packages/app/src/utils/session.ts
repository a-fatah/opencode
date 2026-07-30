import type { SessionApi, SessionInfo, SessionListInput } from "@opencode-ai/client/promise"
import type { Session } from "@opencode-ai/sdk/v2/client"

export type AppSessionStatus = "running" | "handoff_unknown" | "awaiting_run" | "idle"
export type AppSessionProvenance = {
  type: "issue"
  integrationID: string
  externalKey: string
  externalUrl: string
  watcherID?: string
  watcherName: string
  branch?: string
}
export type AppSession = Session & { status?: AppSessionStatus; provenance?: AppSessionProvenance }

export function normalizeSessionInfo(input: SessionInfo | Session): AppSession {
  if (!("location" in input)) return input
  return {
    id: input.id,
    slug: input.id,
    projectID: input.projectID,
    workspaceID: input.location.workspaceID,
    directory: input.location.directory,
    path: input.subpath,
    parentID: input.parentID,
    cost: input.cost,
    tokens: input.tokens,
    title: input.title,
    agent: input.agent,
    model: input.model,
    version: "",
    status: sessionStatus(input),
    provenance: sessionProvenance(input),
    time: input.time,
    revert: input.revert && {
      messageID: input.revert.messageID,
      partID: input.revert.partID,
      snapshot: input.revert.snapshot,
    },
  }
}

export function sessionProvenance(input: object | undefined): AppSessionProvenance | undefined {
  if (!input || !("provenance" in input)) return
  const provenance = input.provenance
  if (!provenance || typeof provenance !== "object" || !("type" in provenance) || provenance.type !== "issue") return
  return provenance as AppSessionProvenance
}

export function sessionStatus(input: object | undefined): AppSessionStatus | undefined {
  if (!input || !("status" in input)) return
  const status = input.status
  if (status === "running" || status === "handoff_unknown" || status === "awaiting_run" || status === "idle")
    return status
}

export async function listAllSessions(api: Pick<SessionApi, "list">, input: Omit<SessionListInput, "cursor">) {
  const load = async (cursor?: string): Promise<Session[]> => {
    const result = await api.list({ ...input, limit: input.limit ?? 100, cursor })
    const sessions = result.data.map(normalizeSessionInfo)
    if (result.data.length === 0 || !result.cursor.next) return sessions
    return [...sessions, ...(await load(result.cursor.next))]
  }
  return load()
}
