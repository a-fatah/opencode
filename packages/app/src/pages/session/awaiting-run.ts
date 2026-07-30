import type { Prompt } from "@opencode-ai/schema/prompt"
import type { SessionInput } from "@opencode-ai/schema/session-input"
import type { AppSessionStatus } from "@/utils/session"
import { authTokenFromCredentials } from "@/utils/server"
import { uuid } from "@/utils/uuid"

export type AwaitingRunState = {
  sessionID?: string
  messageID?: string
  hydratedID?: string
  sourceText?: string
  locked: boolean
}

export type AwaitingRunRetry = {
  attemptID?: string
  confirmation?: { attemptID: string; newAttemptID: string }
}

export type AwaitingRunEvent = {
  type: string
  data?: { sessionID?: string; attemptID?: string }
  durable?: { seq: number }
}

export type AwaitingRunApi = {
  pending(sessionID: string): Promise<readonly SessionInput.Pending[]>
  replace(sessionID: string, messageID: string, prompt: Prompt): Promise<SessionInput.Pending>
  cancel(sessionID: string, messageID: string): Promise<void>
  resume(sessionID: string, messageID: string, attemptID: string): Promise<unknown>
  confirm(sessionID: string, attemptID: string, newAttemptID: string): Promise<unknown>
  history(sessionID: string, after?: number): Promise<{ data: readonly AwaitingRunEvent[]; hasMore: boolean }>
}

const REFRESH_EVENTS = new Set([
  "session.next.prompt.admitted",
  "session.next.prompt.replaced",
  "session.next.prompt.cancelled",
  "session.next.prompt.claimed",
  "session.input.admitted",
  "session.input.promoted",
  "session.execution.scheduled",
  "session.execution.started",
  "session.execution.completed",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.execution.superseded",
])

export function shouldRefreshAwaitingRun(event: AwaitingRunEvent, sessionID: string) {
  return REFRESH_EVENTS.has(event.type) && event.data?.sessionID === sessionID
}

export function awaitingRunLocked(event: AwaitingRunEvent, sessionID: string) {
  if (event.data?.sessionID !== sessionID) return false
  return (
    event.type === "session.next.prompt.claimed" ||
    event.type === "session.execution.scheduled" ||
    event.type === "session.execution.started"
  )
}

export function pendingHydration(state: AwaitingRunState, currentText: string, input: SessionInput.Pending) {
  if (state.sessionID && state.sessionID !== input.sessionID) return input.prompt.text
  if (state.messageID && state.messageID !== input.id) return input.prompt.text
  if (state.hydratedID === input.id) return
  if (state.sourceText === undefined && currentText.trim()) return
  if (state.sourceText !== undefined && currentText !== state.sourceText) return
  return input.prompt.text
}

export function awaitingRunPromptState(input: SessionInput.Pending, sourceText: string): AwaitingRunState {
  return {
    sessionID: input.sessionID,
    messageID: input.id,
    hydratedID: input.id,
    sourceText,
    locked: false,
  }
}

export function clearedAwaitingRunState(): AwaitingRunState {
  return { locked: true }
}

export function runAttemptID(state: AwaitingRunRetry, create: () => string) {
  return state.attemptID ?? create()
}

export function confirmationPair(state: AwaitingRunRetry, attemptID: string, create: () => string) {
  if (state.confirmation?.attemptID === attemptID) return state.confirmation
  return { attemptID, newAttemptID: create() }
}

export function latestHandoffAttempt(events: readonly AwaitingRunEvent[]) {
  const active = new Map<string, number>()
  events.forEach((event, index) => {
    const attemptID = event.data?.attemptID
    if (!attemptID) return
    if (event.type === "session.execution.scheduled" || event.type === "session.execution.started") {
      active.set(attemptID, index)
      return
    }
    if (
      event.type === "session.execution.completed" ||
      event.type === "session.execution.succeeded" ||
      event.type === "session.execution.failed" ||
      event.type === "session.execution.interrupted" ||
      event.type === "session.execution.superseded"
    )
      active.delete(attemptID)
  })
  return [...active.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export async function loadAwaitingRunHistory(api: Pick<AwaitingRunApi, "history">, sessionID: string) {
  const load = async (after?: number, events: readonly AwaitingRunEvent[] = []): Promise<readonly AwaitingRunEvent[]> => {
    const page = await api.history(sessionID, after)
    const next = [...events, ...page.data]
    if (!page.hasMore) return next
    const cursor = page.data.findLast((event) => event.durable)?.durable?.seq
    if (cursor === undefined || cursor === after) throw new Error("Session history pagination did not advance")
    return load(cursor, next)
  }
  return load()
}

export async function saveAndRun(input: {
  api: Pick<AwaitingRunApi, "replace" | "resume">
  sessionID: string
  pending: SessionInput.Pending
  prompt: Prompt
  attemptID: string
}) {
  const saved = await input.api.replace(input.sessionID, input.pending.id, input.prompt)
  await input.api.resume(input.sessionID, saved.id, input.attemptID)
  return saved
}

export function awaitingRunVisible(status: AppSessionStatus | undefined) {
  return status === "awaiting_run" || status === "handoff_unknown"
}

export function createAwaitingRunApi(input: {
  baseUrl: string
  fetch?: typeof globalThis.fetch
  username?: string
  password?: string
}): AwaitingRunApi {
  const request = async <T>(path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    if (init?.body) headers.set("content-type", "application/json")
    if (input.password)
      headers.set("authorization", `Basic ${authTokenFromCredentials({ username: input.username, password: input.password })}`)
    const response = await (input.fetch ?? globalThis.fetch)(new URL(path, input.baseUrl), { ...init, headers })
    if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    pending: (sessionID) => request(`/api/session/${encodeURIComponent(sessionID)}/input/pending`),
    replace: (sessionID, messageID, prompt) =>
      request(`/api/session/${encodeURIComponent(sessionID)}/input/${encodeURIComponent(messageID)}`, {
        method: "PUT",
        body: JSON.stringify({ prompt }),
      }),
    cancel: (sessionID, messageID) =>
      request(`/api/session/${encodeURIComponent(sessionID)}/input/${encodeURIComponent(messageID)}`, {
        method: "DELETE",
      }),
    resume: (sessionID, expectedMessageID, attemptID) =>
      request(`/api/session/${encodeURIComponent(sessionID)}/resume`, {
        method: "POST",
        body: JSON.stringify({ expectedMessageID, attemptID }),
      }),
    confirm: (sessionID, attemptID, newAttemptID) =>
      request(`/api/session/${encodeURIComponent(sessionID)}/resume/confirm`, {
        method: "POST",
        body: JSON.stringify({ attemptID, newAttemptID }),
      }),
    history: (sessionID, after) =>
      request<{ data: AwaitingRunEvent[]; hasMore: boolean }>(
        `/api/session/${encodeURIComponent(sessionID)}/history?limit=100${after === undefined ? "" : `&after=${after}`}`,
      ),
  }
}

export function createExecutionAttemptID() {
  return `sea_${uuid().replaceAll("-", "")}`
}
